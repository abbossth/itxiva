import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { HomeworkSubmission, IHomeworkFile, IIntegrityMatch } from "@/lib/db/models/homework-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Group } from "@/lib/db/models/group.model";
import { textSimilarity } from "@/lib/similarity";
import { createHash } from "node:crypto";
import { estimateAiWriting } from "@/lib/ai/detect-ai";
import { isAiConfigured } from "@/lib/ai/claude";
import { codeContainment, codeGrams, commonGrams, heuristicAiSignals, looksLikeCode } from "@/lib/ai-heuristics";
import { downloadBuffer } from "@/lib/storage/r2";

// Uyga vazifa javobining "Turnitin" tekshiruvi: boshqa javoblarga o'xshashlik va AI yozganlik ehtimoli.
// Natija javobga saqlanadi; o'quvchi ham, mentor ham ko'radi.

/** Shu foizdan o'xshash javob hisobotga kiradi */
const MATCH_MIN = 40;
const MAX_MATCHES = 3;
/** Bundan kichik fayllar solishtirilmaydi: bir xil hajm tasodifan to'g'ri kelishi mumkin */
const SAME_FILE_MIN_BYTES = 10 * 1024;
/** Mazmuni xeshlanadigan fayl hajmi chegarasi */
const HASH_MAX_BYTES = 20 * 1024 * 1024;
const HASH_TIMEOUT_MS = 20_000;
/** Kod o'xshashligi shundan yuqori bo'lsa — hisobga olinadi (mustaqil yozilgan bir xil tuzilma bo'lmasin) */
const CODE_MATCH_MIN = 0.6;

interface SubmissionForCheck {
  _id: mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  text?: string;
  files?: IHomeworkFile[];
}

/**
 * Ikki javobda bir xil fayl bormi (nomi boshqacha bo'lsa ham). Ikkalasida mazmun xeshi bo'lsa — xesh bo'yicha
 * (aniq), aks holda (eski javoblar) — hajmi va turi bayt-baytigacha bir xil.
 */
function shareFile(a: IHomeworkFile[] = [], b: IHomeworkFile[] = []): boolean {
  const hashes = new Set(a.filter((f) => f.sha256).map((f) => f.sha256));
  if (b.some((f) => f.sha256 && hashes.has(f.sha256))) return true;
  const sizes = new Set(
    a.filter((f) => !f.sha256 && (f.size ?? 0) >= SAME_FILE_MIN_BYTES).map((f) => `${f.size}:${f.mimeType ?? ""}`)
  );
  return b.some((f) => !f.sha256 && (f.size ?? 0) >= SAME_FILE_MIN_BYTES && sizes.has(`${f.size}:${f.mimeType ?? ""}`));
}

/** Javob fayllarining mazmun xeshini hisoblab saqlaydi (bir marta) */
async function hashFiles(submissionId: mongoose.Types.ObjectId, files: IHomeworkFile[] = []): Promise<IHomeworkFile[]> {
  // Fayl ombori sozlanmagan bo'lsa (masalan, testlar) — hajm bo'yicha solishtirish qoladi
  if (!process.env.R2_ACCESS_KEY_ID) return files;
  let changed = false;
  const out: IHomeworkFile[] = [];
  for (const f of files) {
    if (f.sha256 || (f.size ?? 0) > HASH_MAX_BYTES) {
      out.push(f);
      continue;
    }
    try {
      // Ombor sekin javob bersa tekshiruv qotib qolmasin
      const buf = await Promise.race([
        downloadBuffer(f.key),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), HASH_TIMEOUT_MS)),
      ]);
      out.push({ ...f, sha256: createHash("sha256").update(buf).digest("hex") });
      changed = true;
    } catch (error) {
      console.error("Homework file hash failed:", error instanceof Error ? error.message : error);
      out.push(f);
    }
  }
  if (changed) await HomeworkSubmission.updateOne({ _id: submissionId }, { $set: { files: out } });
  return out;
}

/** Shu vazifaga (boshqa guruhlardagi bog'langan nusxalari bilan) kelgan eng o'xshash javoblar */
export async function findSimilarSubmissions(
  submission: SubmissionForCheck,
  lesson: { _id: mongoose.Types.ObjectId; linkId?: unknown },
  instructions: string
): Promise<(IIntegrityMatch & { text: string })[]> {
  const lessonIds = lesson.linkId
    ? (await Lesson.find({ linkId: lesson.linkId }).select("_id").lean()).map((l) => l._id)
    : [lesson._id];
  const others = await HomeworkSubmission.find({
    lessonId: { $in: lessonIds },
    _id: { $ne: submission._id },
    studentId: { $ne: submission.studentId },
  })
    .select("text files studentId groupId lessonId")
    .populate<{ studentId: { _id: mongoose.Types.ObjectId; fullName: string } | null }>("studentId", "fullName")
    .populate<{ groupId: { name: string } | null }>("groupId", "name")
    .lean();

  // Kod bo'lsa: nomlar/izohlar o'zgartirilgani ko'chirmani yashirmaydi. Shu vazifaga kelgan javoblarning ko'pchiligida
  // uchraydigan bo'laklar (hamma yozadigan tuzilma) va topshiriq matnidagilar hisobga olinmaydi
  const mine = submission.text ?? "";
  const isCode = looksLikeCode(mine);
  const gramsOf = new Map<string, Set<string>>();
  let common = new Set<string>();
  if (isCode) {
    for (const o of others) if (looksLikeCode(o.text ?? "")) gramsOf.set(o._id.toString(), codeGrams(o.text ?? ""));
    common = commonGrams([codeGrams(mine), ...gramsOf.values()]);
    for (const g of codeGrams(instructions)) common.add(g);
  }
  const myGrams = isCode ? codeGrams(mine) : new Set<string>();

  return others
    .filter((o) => o.studentId)
    .map((o) => {
      const byText = textSimilarity(mine, o.text ?? "", instructions) * 100;
      const theirs = gramsOf.get(o._id.toString());
      const code = theirs ? codeContainment(myGrams, theirs, common) : 0;
      const byCode = code >= CODE_MATCH_MIN ? code * 100 : 0;
      const byFile = shareFile(submission.files, o.files) ? 100 : 0;
      return { o, percent: Math.round(Math.max(byText, byCode, byFile)) };
    })
    .filter(({ percent }) => percent >= MATCH_MIN)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, MAX_MATCHES)
    .map(({ o, percent }) => ({
      submissionId: o._id,
      studentId: o.studentId!._id,
      fullName: o.studentId!.fullName,
      groupName: o.groupId?.name ?? "",
      lessonId: o.lessonId,
      percent,
      text: o.text ?? "",
    }));
}

export const PENDING_INTEGRITY = {
  status: "pending" as const,
  similarity: 0,
  matches: [],
  aiScore: null,
  aiSignals: [],
  checkedAt: null,
};

/**
 * Javobni tekshiradi va natijani saqlaydi. O'xshash javoblarning hisobotiga ham shu javob qo'shiladi:
 * kim kimdan ko'chirgani noma'lum, shuning uchun ikkala tomon ham belgilanadi.
 */
export async function runIntegrityCheck(submissionId: string): Promise<void> {
  await connectToDatabase();
  const submission = await HomeworkSubmission.findById(submissionId)
    .select("lessonId studentId groupId text files attempt authoring")
    .populate<{ studentId: { _id: mongoose.Types.ObjectId; fullName: string } | null }>("studentId", "fullName")
    .lean();
  if (!submission?.studentId) return;
  const lesson = await Lesson.findById(submission.lessonId).select("groupId homework linkId").lean();
  if (!lesson) return;

  const instructions = lesson.homework?.instructions ?? "";
  // Fayllar mazmuni bo'yicha solishtirilishi uchun avval xeshlanadi
  const files = await hashFiles(submission._id, submission.files);
  const subject = { ...submission, files, studentId: submission.studentId._id };
  const matches = await findSimilarSubmissions(subject, lesson, instructions);
  // Boshqa vazifalarga (oldingi guruhlar, o'tgan yil) yuborilgan aynan shu fayl — boshqa o'quvchiniki bo'lsa
  const hashes = files.map((f) => f.sha256).filter((h): h is string => Boolean(h));
  if (hashes.length > 0 && matches.length < MAX_MATCHES) {
    const seen = new Set(matches.map((m) => m.submissionId.toString()));
    const elsewhere = await HomeworkSubmission.find({
      "files.sha256": { $in: hashes },
      studentId: { $ne: subject.studentId },
      _id: { $ne: submission._id },
    })
      .select("studentId groupId lessonId")
      .populate<{ studentId: { _id: mongoose.Types.ObjectId; fullName: string } | null }>("studentId", "fullName")
      .populate<{ groupId: { name: string } | null }>("groupId", "name")
      .limit(MAX_MATCHES)
      .lean();
    for (const o of elsewhere) {
      if (!o.studentId || seen.has(o._id.toString()) || matches.length >= MAX_MATCHES) continue;
      matches.push({ submissionId: o._id, studentId: o.studentId._id, fullName: o.studentId.fullName, groupName: o.groupId?.name ?? "", lessonId: o.lessonId, percent: 100, text: "" });
    }
  }
  const similarity = matches[0]?.percent ?? 0;
  const stored: IIntegrityMatch[] = matches.map((m) => ({
    submissionId: m.submissionId,
    studentId: m.studentId,
    fullName: m.fullName,
    groupName: m.groupName,
    lessonId: m.lessonId,
    percent: m.percent,
  }));

  // Javob qayta yuborilgan bo'lsa, eski tekshiruv yangisining ustiga yozmasligi uchun urinish raqami bilan
  const current = { _id: submission._id, attempt: submission.attempt ?? 1 };
  // O'xshashlik darhol saqlanadi: AI qismi ishlamasa ham plagiat foizi ko'rinadi
  await HomeworkSubmission.updateOne(current, {
    $set: { integrity: { ...PENDING_INTEGRITY, similarity, matches: stored } },
  });

  await updateCounterparts({ ...submission, studentId: submission.studentId }, stored);

  let aiScore: number | null = null;
  let aiSignals: string[] = [];
  let status: "done" | "failed" = "done";
  if (!submission.text?.trim()) {
    aiSignals = ["Javobda matn yo'q (faqat fayl yoki havola) — AI yozganini aniqlab bo'lmaydi"];
  } else {
    const previous = (
      await HomeworkSubmission.find({ studentId: subject.studentId, _id: { $ne: submission._id }, text: { $ne: "" } })
        .sort({ submittedAt: -1 })
        .limit(3)
        .select("text")
        .lean()
    ).map((p) => p.text ?? "");
    // AI'siz belgilar (doim ishlaydi): markdown, chatbot iboralari, maxsus belgilar, uslub farqi, yozish jarayoni
    const heur = heuristicAiSignals(submission.text, previous, submission.authoring ?? null);
    aiScore = heur.score;
    aiSignals = heur.signals;
    if (!isAiConfigured()) {
      aiSignals = [...aiSignals, "AI sozlanmagan — faqat matn belgilari va yozish jarayoni tekshirildi"];
    } else {
      try {
        const group = await Group.findById(lesson.groupId).select("grade").lean();
        const estimate = await estimateAiWriting({ text: submission.text, grade: group?.grade ?? null, instructions, previous });
        // Ikkala baho birlashtiriladi: kuchliroq dalil hal qiladi
        aiScore = estimate.score === null ? heur.score : heur.score === null ? estimate.score : Math.max(estimate.score, heur.score);
        aiSignals = [...new Set([...heur.signals, ...estimate.signals])].slice(0, 8);
      } catch (error) {
        console.error("Homework AI-writing check failed:", error);
        status = "failed";
        aiSignals = [...aiSignals, "AI hozir ishlamadi — hozircha faqat matn belgilari va yozish jarayoni bo'yicha; AI tekshiruvi keyinroq avtomatik qayta bajariladi"];
      }
    }
  }

  await HomeworkSubmission.updateOne(current, {
    $set: {
      "integrity.status": status,
      "integrity.aiScore": aiScore,
      "integrity.aiSignals": aiSignals,
      "integrity.checkedAt": new Date(),
    },
  });
}

/** O'xshash chiqqan (yoki avval o'xshash bo'lgan) boshqa javoblarning hisobotini yangilaydi */
async function updateCounterparts(
  submission: {
    _id: mongoose.Types.ObjectId;
    lessonId: mongoose.Types.ObjectId | string;
    groupId: mongoose.Types.ObjectId | string;
    studentId: { _id: mongoose.Types.ObjectId; fullName: string };
  },
  matches: IIntegrityMatch[]
): Promise<void> {
  const group = await Group.findById(submission.groupId).select("name").lean();
  const self: IIntegrityMatch = {
    submissionId: submission._id,
    studentId: submission.studentId._id,
    fullName: submission.studentId.fullName,
    groupName: group?.name ?? "",
    lessonId: submission.lessonId,
    percent: 0,
  };
  const percentFor = new Map(matches.map((m) => [m.submissionId.toString(), m.percent]));

  const others = await HomeworkSubmission.find({
    $or: [{ _id: { $in: matches.map((m) => m.submissionId) } }, { "integrity.matches.submissionId": submission._id }],
  })
    .select("integrity")
    .lean();

  for (const other of others) {
    // Hali tekshirilmagan eski javob: uni mentor tekshirganda o'xshashlik o'zi topiladi
    if (!other.integrity) continue;
    const percent = percentFor.get(other._id.toString());
    const kept = (other.integrity.matches ?? []).filter((m) => m.submissionId.toString() !== submission._id.toString());
    const next = (percent ? [...kept, { ...self, percent }] : kept).sort((a, b) => b.percent - a.percent).slice(0, MAX_MATCHES);
    await HomeworkSubmission.updateOne(
      { _id: other._id },
      { $set: { "integrity.matches": next, "integrity.similarity": next[0]?.percent ?? 0 } }
    );
  }
}
