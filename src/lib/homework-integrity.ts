import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { HomeworkSubmission, IHomeworkFile, IIntegrityMatch } from "@/lib/db/models/homework-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Group } from "@/lib/db/models/group.model";
import { textSimilarity } from "@/lib/similarity";
import { estimateAiWriting } from "@/lib/ai/detect-ai";
import { isAiConfigured } from "@/lib/ai/claude";

// Uyga vazifa javobining "Turnitin" tekshiruvi: boshqa javoblarga o'xshashlik va AI yozganlik ehtimoli.
// Natija javobga saqlanadi; o'quvchi ham, mentor ham ko'radi.

/** Shu foizdan o'xshash javob hisobotga kiradi */
const MATCH_MIN = 40;
const MAX_MATCHES = 3;
/** Bundan kichik fayllar solishtirilmaydi: bir xil hajm tasodifan to'g'ri kelishi mumkin */
const SAME_FILE_MIN_BYTES = 10 * 1024;

interface SubmissionForCheck {
  _id: mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  text?: string;
  files?: IHomeworkFile[];
}

/** Ikki javobda bir xil fayl bormi (nomi boshqacha bo'lsa ham): hajmi va turi bayt-baytigacha bir xil */
function shareFile(a: IHomeworkFile[] = [], b: IHomeworkFile[] = []): boolean {
  const sizes = new Set(
    a.filter((f) => (f.size ?? 0) >= SAME_FILE_MIN_BYTES).map((f) => `${f.size}:${f.mimeType ?? ""}`)
  );
  return b.some((f) => (f.size ?? 0) >= SAME_FILE_MIN_BYTES && sizes.has(`${f.size}:${f.mimeType ?? ""}`));
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

  return others
    .filter((o) => o.studentId)
    .map((o) => {
      const byText = textSimilarity(submission.text ?? "", o.text ?? "", instructions) * 100;
      const byFile = shareFile(submission.files, o.files) ? 100 : 0;
      return { o, percent: Math.round(Math.max(byText, byFile)) };
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
    .select("lessonId studentId groupId text files attempt")
    .populate<{ studentId: { _id: mongoose.Types.ObjectId; fullName: string } | null }>("studentId", "fullName")
    .lean();
  if (!submission?.studentId) return;
  const lesson = await Lesson.findById(submission.lessonId).select("groupId homework linkId").lean();
  if (!lesson) return;

  const instructions = lesson.homework?.instructions ?? "";
  const subject = { ...submission, studentId: submission.studentId._id };
  const matches = await findSimilarSubmissions(subject, lesson, instructions);
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
  } else if (!isAiConfigured()) {
    aiSignals = ["AI sozlanmagan — faqat o'xshashlik tekshirildi"];
  } else {
    try {
      const [group, previous] = await Promise.all([
        Group.findById(lesson.groupId).select("grade").lean(),
        HomeworkSubmission.find({ studentId: subject.studentId, _id: { $ne: submission._id }, text: { $ne: "" } })
          .sort({ submittedAt: -1 })
          .limit(3)
          .select("text")
          .lean(),
      ]);
      const estimate = await estimateAiWriting({
        text: submission.text,
        grade: group?.grade ?? null,
        instructions,
        previous: previous.map((p) => p.text ?? ""),
      });
      aiScore = estimate.score;
      aiSignals = estimate.signals;
    } catch (error) {
      console.error("Homework AI-writing check failed:", error);
      status = "failed";
      aiSignals = ["AI hozir band yoki kunlik limiti tugagan — tekshiruv keyinroq avtomatik qayta bajariladi"];
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
