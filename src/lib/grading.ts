import { IQuizQuestion } from "./db/models/quiz.model";
import { IQuizAnswer } from "./db/models/quiz-submission.model";
import { IExamQuestion } from "./db/models/exam.model";
import { IExamAnswer } from "./db/models/exam-submission.model";

/**
 * Normalizes short text strings: trimmed, lowercased, and multiple spaces collapsed
 */
export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Grades quiz submissions automatically where applicable
 */
export function autoGradeQuiz({
  questions,
  submittedAnswers,
}: {
  questions: IQuizQuestion[];
  submittedAnswers: { questionId: string; value: string | string[] }[];
}): {
  answers: IQuizAnswer[];
  totalScore: number;
  maxScore: number;
  hasOpenEnded: boolean;
} {
  const answerMap = new Map<string, string | string[]>();
  for (const a of submittedAnswers) {
    answerMap.set(a.questionId, a.value);
  }

  let totalScore = 0;
  let maxScore = 0;
  let hasOpenEnded = false;
  const gradedAnswers: IQuizAnswer[] = [];

  for (const q of questions) {
    const qId = q._id ? q._id.toString() : "";
    const val = answerMap.get(qId);
    maxScore += q.points;

    if (q.type === "open_ended") {
      hasOpenEnded = true;
      gradedAnswers.push({
        questionId: qId,
        value: typeof val === "string" ? val : "",
        isCorrect: undefined,
        pointsAwarded: 0,
      });
      continue;
    }

    if (q.type === "single_choice") {
      const studentVal = typeof val === "string" ? val.trim() : "";
      const isCorrect = q.correctAnswers.some((ans) => ans.trim() === studentVal);
      const points = isCorrect ? q.points : 0;
      totalScore += points;
      gradedAnswers.push({
        questionId: qId,
        value: studentVal,
        isCorrect,
        pointsAwarded: points,
      });
      continue;
    }

    if (q.type === "multiple_choice") {
      const studentVals = Array.isArray(val) ? val.map((v) => v.trim()).sort() : [];
      const correctVals = (q.correctAnswers || []).map((v) => v.trim()).sort();

      const isCorrect =
        studentVals.length === correctVals.length &&
        studentVals.every((v, i) => v === correctVals[i]);

      const points = isCorrect ? q.points : 0;
      totalScore += points;
      gradedAnswers.push({
        questionId: qId,
        value: studentVals,
        isCorrect,
        pointsAwarded: points,
      });
      continue;
    }

    if (q.type === "short_answer") {
      const studentVal = typeof val === "string" ? normalizeText(val) : "";
      const isCorrect = q.correctAnswers.some((ans) => normalizeText(ans) === studentVal);
      const points = isCorrect ? q.points : 0;
      totalScore += points;
      gradedAnswers.push({
        questionId: qId,
        value: typeof val === "string" ? val : "",
        isCorrect,
        pointsAwarded: points,
      });
    }
  }

  return {
    answers: gradedAnswers,
    totalScore,
    maxScore,
    hasOpenEnded,
  };
}

/**
 * Auto-grades objective questions in exams and prepares answers list
 */
export function autoGradeExam({
  questions,
  submittedAnswers,
}: {
  questions: IExamQuestion[];
  submittedAnswers: {
    questionId: string;
    type: string;
    value?: string | string[];
    fileKey?: string;
    fileName?: string;
    fileSize?: number;
    repoUrl?: string;
  }[];
}): {
  answers: IExamAnswer[];
  autoScore: number;
  maxScore: number;
  requiresManualGrading: boolean;
} {
  const answerMap = new Map<string, (typeof submittedAnswers)[0]>();
  for (const a of submittedAnswers) {
    answerMap.set(a.questionId, a);
  }

  let autoScore = 0;
  let maxScore = 0;
  let requiresManualGrading = false;
  const processedAnswers: IExamAnswer[] = [];

  for (const q of questions) {
    const qId = q._id ? q._id.toString() : "";
    const raw = answerMap.get(qId);
    maxScore += q.points;

    if (q.type === "open_ended" || q.type === "project_upload" || q.type === "github_repo") {
      requiresManualGrading = true;
      processedAnswers.push({
        questionId: qId,
        type: q.type,
        value: raw?.value,
        fileKey: raw?.fileKey,
        fileName: raw?.fileName,
        fileSize: raw?.fileSize,
        repoUrl: raw?.repoUrl,
        isCorrect: undefined,
        pointsAwarded: 0,
      });
      continue;
    }

    if (q.type === "single_choice") {
      const val = typeof raw?.value === "string" ? raw.value.trim() : "";
      const isCorrect = (q.correctAnswers || []).some((ans) => ans.trim() === val);
      const points = isCorrect ? q.points : 0;
      autoScore += points;
      processedAnswers.push({
        questionId: qId,
        type: q.type,
        value: val,
        isCorrect,
        pointsAwarded: points,
      });
      continue;
    }

    if (q.type === "multiple_choice") {
      const vals = Array.isArray(raw?.value)
        ? raw.value.map((v) => v.trim()).sort()
        : [];
      const correctVals = (q.correctAnswers || []).map((v) => v.trim()).sort();

      const isCorrect =
        vals.length === correctVals.length && vals.every((v, i) => v === correctVals[i]);

      const points = isCorrect ? q.points : 0;
      autoScore += points;
      processedAnswers.push({
        questionId: qId,
        type: q.type,
        value: vals,
        isCorrect,
        pointsAwarded: points,
      });
    }
  }

  return {
    answers: processedAnswers,
    autoScore,
    maxScore,
    requiresManualGrading,
  };
}
