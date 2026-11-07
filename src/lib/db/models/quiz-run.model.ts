import mongoose, { Schema, Document, Model } from "mongoose";
import type { IQuizAnswer } from "./quiz-submission.model";

// Test o'yini (savol-ma-savol, vaqt bilan). Vaqt server tomonida hisoblanadi: savol berilgan payt (`servedAt`)
// shu yerda saqlanadi. O'yin tugagach natija QuizSubmission ga yoziladi — boshqa kod faqat o'shani o'qiydi.

export interface IQuizRunAnswer extends IQuizAnswer {
  /** Javob berishga ketgan vaqt (ms); vaqt tugaganda — limit */
  ms: number;
  timedOut: boolean;
  /** O'yin ochkosi (tezlik + ketma-ketlik) */
  gamePoints: number;
}

export interface IQuizRunData {
  _id: string | mongoose.Types.ObjectId;
  quizId: string | mongoose.Types.ObjectId;
  lessonId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  /** O'ynaladigan savollar tartibi */
  questionIds: string[];
  /** Joriy savol (questionIds ichidagi o'rni) */
  index: number;
  /** Joriy savol berilgan vaqt; null — hali berilmagan */
  servedAt?: Date | string | null;
  answers: IQuizRunAnswer[];
  score: number;
  streak: number;
  maxStreak: number;
  finishedAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface IQuizRun extends Document, Omit<IQuizRunData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const RunAnswerSchema = new Schema<IQuizRunAnswer>(
  {
    questionId: { type: String, required: true },
    value: { type: Schema.Types.Mixed, default: "" },
    isCorrect: { type: Boolean },
    pointsAwarded: { type: Number, default: 0 },
    ms: { type: Number, default: 0 },
    timedOut: { type: Boolean, default: false },
    gamePoints: { type: Number, default: 0 },
  },
  { _id: false }
);

const QuizRunSchema = new Schema<IQuizRun>(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    questionIds: { type: [String], default: [] },
    index: { type: Number, default: 0 },
    servedAt: { type: Date, default: null },
    answers: { type: [RunAnswerSchema], default: [] },
    score: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Bir o'quvchida bitta testning bir vaqtda faqat bitta tugallanmagan o'yini
QuizRunSchema.index({ quizId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { finishedAt: { $type: "null" } } });

export const QuizRun: Model<IQuizRun> = mongoose.models.QuizRun || mongoose.model<IQuizRun>("QuizRun", QuizRunSchema);
