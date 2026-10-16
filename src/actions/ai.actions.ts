"use server";

import mongoose from "mongoose";
import { z } from "zod";
import { requireMentor } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiError, generateStructured, isAiConfigured } from "@/lib/ai/claude";
import { buildDocx, buildPptx } from "@/lib/ai/documents";
import { downloadBuffer, uploadBuffer } from "@/lib/storage/r2";
import { AI_READABLE_TYPES } from "@/lib/ai/claude";
import { reviewHomeworkWithAi, type HomeworkReview, type HomeworkReviewInput } from "@/lib/ai/review-homework";
import { connectToDatabase } from "@/lib/db/connect";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Group } from "@/lib/db/models/group.model";
import { findSimilarSubmissions } from "@/lib/homework-integrity";
import { quizQuestionSchema } from "@/lib/validations/quiz.schema";
import type { IQuizQuestion } from "@/lib/db/models/quiz.model";
import type { IMaterial } from "@/lib/db/models/lesson.model";
import { ActionResult } from "./auth.actions";

const lessonContextSchema = z.object({
  title: z.string().trim().max(200).default(""),
  topic: z.string().trim().max(300).default(""),
  description: z.string().trim().max(8000).default(""),
  grade: z.coerce.number().int().min(1).max(11).optional(),
});
export type LessonContextInput = z.input<typeof lessonContextSchema>;

function describeLesson(ctx: z.output<typeof lessonContextSchema>): string {
  return [
    ctx.grade ? `Sinf: ${ctx.grade}-sinf` : "",
    ctx.title ? `Dars nomi: ${ctx.title}` : "",
    ctx.topic ? `Qisqacha mavzu: ${ctx.topic}` : "",
    ctx.description ? `Dars konspekti:\n${ctx.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Har bir AI amali oldidan: mentor ekanini, kalit borligini va limitni tekshiradi */
async function guard(bucket = "ai", limit = 20): Promise<string | null> {
  const mentor = await requireMentor();
  if (!isAiConfigured()) return "AI yordamchi sozlanmagan: ANTHROPIC_API_KEY yoki GEMINI_API_KEY kiritilmagan";
  const rate = checkRateLimit(`${bucket}_${mentor.userId}`, limit, 10 * 60_000);
  if (!rate.allowed) return `Juda ko'p so'rov. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring`;
  return null;
}

function fail<T>(error: unknown): ActionResult<T> {
  if (error instanceof AiError) return { success: false, message: error.message };
  console.error("AI action error:", error);
  return { success: false, message: "AI yordamchida kutilmagan xatolik yuz berdi" };
}

export async function getAiStatus(): Promise<{ configured: boolean }> {
  await requireMentor();
  return { configured: isAiConfigured() };
}

// ---------- 1. Dars matni ----------

const lessonDraftSchema = z.object({
  title: z.string().describe("Darsning to'liq nomi, raqamsiz. Masalan: \"JavaScript'da massivlar\""),
  topic: z.string().describe("Bir qatorli qisqa mavzu: kalit tushunchalar vergul bilan"),
  description: z
    .string()
    .describe(
      "O'quvchi o'qiydigan dars konspekti, oddiy matn (markdown belgilarisiz). Bo'limlar: Maqsad, Dars rejasi (vaqtlari bilan, jami 90 daqiqa), Asosiy tushunchalar, Amaliy mashq, Uy vazifasi. Bo'limlar orasida bo'sh qator."
    ),
});

export async function generateLessonDraftAction(input: {
  topic: string;
  grade?: number;
  notes?: string;
}): Promise<ActionResult<z.infer<typeof lessonDraftSchema>>> {
  const blocked = await guard();
  if (blocked) return { success: false, message: blocked };

  const topic = typeof input.topic === "string" ? input.topic.trim().slice(0, 300) : "";
  if (topic.length < 3) return { success: false, message: "Dars mavzusini yozing (kamida 3 ta belgi)" };
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 1000) : "";

  try {
    const data = await generateStructured({
      schema: lessonDraftSchema,
      prompt: `Quyidagi mavzu bo'yicha bitta dars tayyorla.

Mavzu: ${topic}
${input.grade ? `Sinf: ${input.grade}-sinf` : ""}
${notes ? `Mentor izohi: ${notes}` : ""}`,
    });
    return { success: true, data };
  } catch (error) {
    return fail(error);
  }
}

// ---------- 2. Test savollari ----------

const aiQuizSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(["single_choice", "multiple_choice", "short_answer"]),
      prompt: z.string(),
      options: z.array(z.string()).describe("Tanlov savollarida 3-4 ta turli variant; short_answer uchun bo'sh massiv"),
      correctAnswers: z
        .array(z.string())
        .describe("Tanlov savollarida options ichidagi matnning aynan o'zi; short_answer uchun qabul qilinadigan qisqa javob(lar)"),
      explanation: z.string().describe("To'g'ri javobning bir jumlali izohi"),
    })
  ),
});

export async function generateQuizAction(
  context: LessonContextInput,
  count = 5
): Promise<ActionResult<{ questions: IQuizQuestion[] }>> {
  const blocked = await guard();
  if (blocked) return { success: false, message: blocked };

  const ctx = lessonContextSchema.safeParse(context);
  if (!ctx.success || (!ctx.data.title && !ctx.data.description)) {
    return { success: false, message: "Test tuzish uchun avval dars nomi yoki konspektini kiriting" };
  }
  const n = Math.min(10, Math.max(3, Math.round(Number(count)) || 5));

  try {
    const data = await generateStructured({
      schema: aiQuizSchema,
      prompt: `Quyidagi dars bo'yicha o'quvchilar bilimini tekshiradigan ${n} ta test savoli tuz.

${describeLesson(ctx.data)}

Talablar:
- Savollar dars mazmunini tushunishni tekshirsin, yodlashni emas; osondan qiyinga qarab joylashtir.
- Aksariyati single_choice bo'lsin, 1-2 tasi multiple_choice yoki short_answer.
- Noto'g'ri variantlar ishonarli bo'lsin, lekin to'g'ri javob bitta ma'noda aniq bo'lsin.
- short_answer javobi bir so'z yoki qisqa ibora bo'lsin.`,
    });

    // AI javobi mavjud test sxemasi bilan tekshiriladi; yaroqsiz savollar tashlab yuboriladi
    const questions: IQuizQuestion[] = [];
    for (const q of data.questions) {
      const parsed = quizQuestionSchema.safeParse({ ...q, points: 1 });
      if (parsed.success) questions.push(parsed.data as IQuizQuestion);
    }
    if (questions.length === 0) {
      return { success: false, message: "AI yaroqli savol tuza olmadi. Qaytadan urinib ko'ring" };
    }
    return { success: true, data: { questions } };
  } catch (error) {
    return fail(error);
  }
}

// ---------- 3. Matnni yaxshilash ----------

const improvedTextSchema = z.object({
  text: z.string().describe("Yaxshilangan matn, oddiy matn ko'rinishida (markdown belgilarisiz)"),
});

export async function improveTextAction(text: string): Promise<ActionResult<{ text: string }>> {
  const blocked = await guard();
  if (blocked) return { success: false, message: blocked };

  const source = typeof text === "string" ? text.trim() : "";
  if (source.length < 20) return { success: false, message: "Yaxshilash uchun kamida bir-ikki jumla yozing" };
  if (source.length > 8000) return { success: false, message: "Matn juda uzun (8000 belgidan oshmasin)" };

  try {
    const data = await generateStructured({
      schema: improvedTextSchema,
      effort: "low",
      prompt: `Mentor yozgan dars konspektini tahrir qil: imlo va uslub xatolarini tuzat, jumlalarni ravon va o'quvchiga tushunarli qil, tartibli bo'limlarga ajrat. Mazmun, faktlar, topshiriqlar va kod namunalarini o'zgartirma, yangi ma'lumot qo'shma.

<matn>
${source}
</matn>`,
    });
    return { success: true, data };
  } catch (error) {
    return fail(error);
  }
}

// ---------- 4. Fayllar: taqdimot va konspekt ----------

export interface GeneratedFile {
  filename: string;
  mimeType: string;
  /** Yuklab olish uchun fayl mazmuni */
  base64: string;
  /** Omborga saqlangan bo'lsa — darsga biriktirish uchun tayyor material */
  material: IMaterial | null;
}

async function storeFile(buffer: Buffer, title: string, ext: "pptx" | "docx", mimeType: string, label: string): Promise<GeneratedFile> {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "dars";
  const filename = `${slug}.${ext}`;
  const key = `materials/ai/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filename}`;

  let material: IMaterial | null = null;
  try {
    await uploadBuffer({ key, body: buffer, contentType: mimeType });
    material = { type: "file", title: `${label}: ${title}`.slice(0, 120), urlOrKey: key, mimeType, fileSize: buffer.length };
  } catch (error) {
    // Ombor sozlanmagan bo'lsa ham mentor faylni yuklab olib, o'zi biriktira oladi
    console.error("AI file upload failed:", error);
  }
  return { filename, mimeType, base64: buffer.toString("base64"), material };
}

const deckSchema = z.object({
  title: z.string(),
  subtitle: z.string().describe("Bir qatorli tagsarlavha"),
  slides: z.array(
    z.object({
      title: z.string().describe("Slayd sarlavhasi, 60 belgigacha"),
      bullets: z.array(z.string()).describe("3-5 ta qisqa band, har biri 110 belgigacha"),
      code: z.string().describe("Slaydga mos qisqa kod namunasi (12 qatorgacha) yoki bo'sh satr"),
      notes: z.string().describe("Mentor uchun so'zlash matni: slaydda nimani tushuntirish kerak"),
    })
  ),
});

export async function generatePresentationAction(context: LessonContextInput): Promise<ActionResult<GeneratedFile>> {
  const blocked = await guard();
  if (blocked) return { success: false, message: blocked };

  const ctx = lessonContextSchema.safeParse(context);
  if (!ctx.success || !ctx.data.title) {
    return { success: false, message: "Taqdimot uchun avval dars nomini kiriting" };
  }

  try {
    const deck = await generateStructured({
      schema: deckSchema,
      prompt: `Quyidagi dars uchun sinfda proyektorda ko'rsatiladigan taqdimot tuz: 8-12 slayd.

${describeLesson(ctx.data)}

Tuzilishi: darsning maqsadi → asosiy tushunchalar (har biriga alohida slayd, misol bilan) → birgalikda bajariladigan amaliy mashq → xulosa → uy vazifasi. Slaydda matn kam, gap mentorning so'zlash matnida bo'lsin.`,
    });
    if (deck.slides.length === 0) return { success: false, message: "AI slaydlarni tuza olmadi. Qaytadan urinib ko'ring" };

    const buffer = await buildPptx(deck);
    const file = await storeFile(
      buffer,
      ctx.data.title,
      "pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Taqdimot"
    );
    return { success: true, data: file };
  } catch (error) {
    return fail(error);
  }
}

const handoutSchema = z.object({
  title: z.string(),
  intro: z.string().describe("2-3 jumlali kirish: bu darsda nima o'rganiladi va nega kerak"),
  sections: z.array(
    z.object({
      heading: z.string(),
      paragraphs: z.array(z.string()),
      code: z.string().describe("Bo'limga mos kod namunasi yoki bo'sh satr"),
    })
  ),
  exercises: z.array(z.string()).describe("Darsda bajariladigan 3-5 ta mashq"),
  homework: z.array(z.string()).describe("2-3 ta uy vazifasi"),
});

export async function generateHandoutAction(context: LessonContextInput): Promise<ActionResult<GeneratedFile>> {
  const blocked = await guard();
  if (blocked) return { success: false, message: blocked };

  const ctx = lessonContextSchema.safeParse(context);
  if (!ctx.success || !ctx.data.title) {
    return { success: false, message: "Konspekt uchun avval dars nomini kiriting" };
  }

  try {
    const handout = await generateStructured({
      schema: handoutSchema,
      prompt: `Quyidagi dars uchun o'quvchilarga tarqatiladigan konspekt tayyorla (chop etilganda 2-3 bet). O'quvchi darsdan keyin uyda shu hujjat bo'yicha mavzuni takrorlay olsin.

${describeLesson(ctx.data)}`,
    });

    const buffer = await buildDocx(handout);
    const file = await storeFile(
      buffer,
      ctx.data.title,
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Konspekt"
    );
    return { success: true, data: file };
  } catch (error) {
    return fail(error);
  }
}

// ---------- Uyga vazifa ----------

const homeworkDraftSchema = z.object({
  instructions: z
    .string()
    .describe(
      "O'quvchi o'qiydigan uyga vazifa matni, oddiy matn (markdown belgilarisiz). 2–4 ta raqamlangan topshiriq: osonidan qiyiniga. Oxirida 'Topshirish:' qatori — nima yuborilishi kerakligi (kod, fayl yoki havola)."
    ),
});

export async function generateHomeworkAction(
  input: LessonContextInput
): Promise<ActionResult<z.infer<typeof homeworkDraftSchema>>> {
  const blocked = await guard();
  if (blocked) return { success: false, message: blocked };

  const ctx = lessonContextSchema.safeParse(input);
  if (!ctx.success || (!ctx.data.title && !ctx.data.topic && !ctx.data.description)) {
    return { success: false, message: "Avval dars nomini yoki konspektini yozing" };
  }

  try {
    const data = await generateStructured({
      schema: homeworkDraftSchema,
      effort: "low",
      maxTokens: 4000,
      prompt: `Quyidagi dars uchun uyga vazifa tuz. Vazifa darsda o'tilgan narsalarni mustahkamlasin va uyda 30–45 daqiqada bajarilsin.\n\n${describeLesson(ctx.data)}`,
    });
    return { success: true, data };
  } catch (error) {
    return fail(error);
  }
}

// ---------- Uyga vazifani tekshirish ----------

// AI'ga yuboriladigan fayllar chegarasi: so'rov hajmi va narxi oshib ketmasligi uchun
const REVIEW_MAX_FILES = 6;
const REVIEW_MAX_FILE_BYTES = 5 * 1024 * 1024;
const REVIEW_MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export interface SimilarSubmission {
  studentId: string;
  fullName: string;
  groupName: string;
  lessonId: string;
  percent: number;
}

export type HomeworkReviewResult = HomeworkReview & { similar: SimilarSubmission[] };

/** Mentorga taxminiy ball va izoh taklif qiladi. Hech narsa saqlanmaydi — bahoni mentor o'zi qo'yadi */
export async function suggestHomeworkReviewAction(
  submissionId: string,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<ActionResult<HomeworkReviewResult>> {
  // Bir guruhni ketma-ket tekshirishda limit tez tugamasligi uchun alohida hisob
  const blocked = await guard("ai_review", 60);
  if (blocked) return { success: false, message: blocked };
  if (typeof submissionId !== "string" || !mongoose.isValidObjectId(submissionId)) {
    return { success: false, message: "Javob topilmadi" };
  }

  await connectToDatabase();
  const submission = await HomeworkSubmission.findById(submissionId)
    .select("lessonId studentId text links files attempt")
    .lean();
  if (!submission) return { success: false, message: "Javob topilmadi" };
  const lesson = await Lesson.findById(submission.lessonId).select("title topic groupId homework linkId").lean();
  if (!lesson) return { success: false, message: "Dars topilmadi" };
  const group = await Group.findById(lesson.groupId).select("grade").lean();

  const candidates = [
    ...(lesson.homework?.attachments ?? [])
      .filter((a) => a.type === "file")
      .map((a) => ({ key: a.urlOrKey, name: a.title, mimeType: a.mimeType, size: a.fileSize, source: "task" as const })),
    ...(submission.files ?? []).map((f) => ({ ...f, source: "student" as const })),
  ];

  const files: HomeworkReviewInput["files"] = [];
  const unreadFiles: string[] = [];
  let totalBytes = 0;
  for (const f of candidates) {
    const readable =
      AI_READABLE_TYPES.includes(f.mimeType ?? "") &&
      files.length < REVIEW_MAX_FILES &&
      (f.size ?? 0) <= REVIEW_MAX_FILE_BYTES &&
      totalBytes + (f.size ?? 0) <= REVIEW_MAX_TOTAL_BYTES;
    if (!readable) {
      if (f.source === "student") unreadFiles.push(f.name);
      continue;
    }
    try {
      const buffer = await downloadBuffer(f.key);
      if (buffer.length > REVIEW_MAX_FILE_BYTES || totalBytes + buffer.length > REVIEW_MAX_TOTAL_BYTES) {
        if (f.source === "student") unreadFiles.push(f.name);
        continue;
      }
      totalBytes += buffer.length;
      files.push({ mimeType: f.mimeType!, data: buffer.toString("base64"), name: f.name, source: f.source });
    } catch (error) {
      console.error("AI review file download failed:", error);
      if (f.source === "student") unreadFiles.push(f.name);
    }
  }

  const studentText = submission.text ?? "";
  if (!studentText.trim() && !files.some((f) => f.source === "student")) {
    return {
      success: false,
      message: "AI bu javobni o'qiy olmaydi: matn yo'q, fayllar esa rasm yoki PDF emas. Javobni o'zingiz tekshiring",
    };
  }

  const instructions = lesson.homework?.instructions ?? "";
  const [similar, previous] = await Promise.all([
    findSimilarSubmissions(submission, lesson, instructions),
    HomeworkSubmission.find({ studentId: submission.studentId, _id: { $ne: submission._id }, text: { $ne: "" } })
      .sort({ submittedAt: -1 })
      .limit(3)
      .select("text")
      .lean(),
  ]);

  try {
    const review = await reviewHomeworkWithAi({
      lessonTitle: lesson.title,
      lessonTopic: lesson.topic ?? "",
      grade: group?.grade ?? null,
      instructions,
      studentText,
      links: submission.links ?? [],
      attempt: submission.attempt ?? 1,
      files,
      unreadFiles,
      // AI'ga boshqa o'quvchilarning ismi yuborilmaydi
      similarAnswers: similar.map((s) => ({ percent: s.percent, text: s.text })),
      previousAnswers: previous.map((p) => p.text ?? "").filter((t) => t.trim()),
    }, { fresh: fresh === true });
    return {
      success: true,
      data: {
        ...review,
        similar: similar.map((s) => ({
          studentId: s.studentId.toString(),
          fullName: s.fullName,
          groupName: s.groupName,
          lessonId: s.lessonId.toString(),
          percent: s.percent,
        })),
      },
    };
  } catch (error) {
    return fail(error);
  }
}
