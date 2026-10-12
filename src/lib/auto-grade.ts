import mongoose from "mongoose";
import { Quiz } from "@/lib/db/models/quiz.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { Exam } from "@/lib/db/models/exam.model";
import { ExamSubmission } from "@/lib/db/models/exam-submission.model";
import { isAutoOpenQuestion, isPassingScore } from "@/lib/grading";
import { gradeOpenAnswersWithAi, OpenAnswerItem } from "@/lib/ai/grade-open";

// Topshirilgan test va imtihonlardagi ochiq javoblarni AI bilan baholaydi. AI ishlamasa yoki javobni tashlab
// ketsa, urinish "tekshirish kerak" holatida qoladi — mentor o'zi baholaydi yoki keyinroq qayta ishga tushiradi.

type Id = string | mongoose.Types.ObjectId;

interface QuestionLike {
  _id?: unknown;
  type: string;
  grading?: string | null;
  prompt: string;
  correctAnswers?: string[];
  points: number;
}

interface AnswerLike {
  questionId: string;
  value?: unknown;
  isCorrect?: boolean | null;
  pointsAwarded: number;
  mentorFeedback?: string;
  aiGraded?: boolean;
  correctAnswer?: string;
}

const isUngraded = (a: AnswerLike) => (a.isCorrect === undefined || a.isCorrect === null) && !a.aiGraded;

/** AI ko'rishi kerak bo'lgan javoblar */
export function pendingAiAnswers(questions: QuestionLike[], answers: AnswerLike[]): OpenAnswerItem[] {
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const items: OpenAnswerItem[] = [];
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || !isAutoOpenQuestion(q) || !isUngraded(a)) continue;
    if (typeof a.value !== "string" || !a.value.trim()) continue;
    items.push({ id: a.questionId, prompt: q.prompt, sample: (q.correctAnswers ?? []).join("\n"), maxPoints: q.points, answer: a.value });
  }
  return items;
}

/** Javoblarga AI bahosini yozadi. `remaining` — hali mentor ko'rishi kerak bo'lgan javob qoldimi */
async function applyAiGrades(questions: QuestionLike[], answers: AnswerLike[]): Promise<{ changed: boolean; remaining: boolean }> {
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  let changed = false;

  // Bo'sh qoldirilgan avtomatik ochiq savol — 0 ball (AI'ga yuborilmaydi)
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (q && isAutoOpenQuestion(q) && isUngraded(a) && (typeof a.value !== "string" || !a.value.trim())) {
      a.isCorrect = false;
      a.pointsAwarded = 0;
      changed = true;
    }
  }

  const items = pendingAiAnswers(questions, answers);
  if (items.length > 0) {
    try {
      const grades = await gradeOpenAnswersWithAi(items);
      for (const a of answers) {
        const grade = grades.get(a.questionId);
        const q = byId.get(a.questionId);
        if (!grade || !q || !isUngraded(a)) continue;
        a.pointsAwarded = grade.points;
        a.isCorrect = grade.points >= q.points;
        a.mentorFeedback = grade.feedback;
        if (grade.correctAnswer) a.correctAnswer = grade.correctAnswer;
        a.aiGraded = true;
        changed = true;
      }
    } catch (error) {
      console.error("AI grading failed:", error instanceof Error ? error.message : error);
    }
  }

  const remaining = answers.some((a) => {
    const q = byId.get(a.questionId);
    if (!q) return false;
    if (q.type === "project_upload" || q.type === "github_repo") return true;
    return q.type === "open_ended" && (isAutoOpenQuestion(q) ? isUngraded(a) : true);
  });
  return { changed, remaining };
}

/** Bitta test topshirig'ini baholaydi. Natija: to'liq baholandimi */
export async function aiGradeQuizSubmission(submissionId: Id): Promise<boolean> {
  const submission = await QuizSubmission.findById(submissionId).lean();
  if (!submission || submission.status !== "submitted") return false;
  const quiz = await Quiz.findById(submission.quizId).lean();
  if (!quiz) return false;

  const answers = submission.answers as AnswerLike[];
  const { changed, remaining } = await applyAiGrades(quiz.questions, answers);
  if (!changed && remaining) return false;

  // Mentor shu orada o'zi baholab qo'ygan bo'lsa, uning bahosi ustidan yozilmaydi
  await QuizSubmission.updateOne(
    { _id: submission._id, status: "submitted" },
    { $set: { answers, totalScore: answers.reduce((sum, a) => sum + (a.pointsAwarded || 0), 0), status: remaining ? "submitted" : "graded" } }
  );
  return !remaining;
}

/** Bitta imtihon urinishini baholaydi. Natija: to'liq baholandimi */
export async function aiGradeExamSubmission(submissionId: Id): Promise<boolean> {
  const submission = await ExamSubmission.findById(submissionId).lean();
  if (!submission || submission.status !== "submitted") return false;
  const exam = await Exam.findById(submission.examId).lean();
  if (!exam) return false;

  const answers = submission.answers as AnswerLike[];
  const { changed, remaining } = await applyAiGrades(exam.questions, answers);
  if (!changed && remaining) return false;

  const questionIds = new Set(exam.questions.map((q) => String(q._id)));
  const totalScore = answers.reduce((sum, a) => sum + (questionIds.has(a.questionId) ? a.pointsAwarded || 0 : 0), 0);
  const maxScore = exam.questions.reduce((sum, q) => sum + q.points, 0);
  await ExamSubmission.updateOne(
    { _id: submission._id, status: "submitted" },
    {
      $set: {
        answers,
        totalScore,
        maxScore,
        status: remaining ? "submitted" : "graded",
        isPassed: remaining ? false : isPassingScore(totalScore, maxScore, exam.passingScore),
      },
    }
  );
  return !remaining;
}

/** Test yoki imtihonning hali tekshirilmagan barcha topshiriqlarini AI'dan o'tkazadi */
export async function aiGradePending(kind: "quiz" | "exam", id: Id): Promise<{ checked: number; graded: number }> {
  const pending =
    kind === "quiz"
      ? await QuizSubmission.find({ quizId: id, status: "submitted" }).select("_id").lean()
      : await ExamSubmission.find({ examId: id, status: "submitted" }).select("_id").lean();
  let graded = 0;
  // Ketma-ket: bepul tarifda bir vaqtdagi so'rovlar rad etiladi
  for (const s of pending) {
    if (kind === "quiz" ? await aiGradeQuizSubmission(s._id) : await aiGradeExamSubmission(s._id)) graded++;
  }
  return { checked: pending.length, graded };
}
