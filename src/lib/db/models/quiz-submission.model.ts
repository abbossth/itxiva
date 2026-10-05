import mongoose, { Schema, Document, Model } from "mongoose";

export type QuizSubmissionStatus = "in_progress" | "submitted" | "graded";

export interface IQuizAnswer {
  questionId: string;
  value: string | string[];
  isCorrect?: boolean;
  pointsAwarded: number;
  mentorFeedback?: string;
}

export interface IQuizSubmissionData {
  _id: string | mongoose.Types.ObjectId;
  quizId: string | mongoose.Types.ObjectId;
  lessonId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  answers: IQuizAnswer[];
  totalScore: number;
  maxScore: number;
  status: QuizSubmissionStatus;
  submittedAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IQuizSubmission extends Document, Omit<IQuizSubmissionData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const QuizAnswerSchema = new Schema<IQuizAnswer>(
  {
    questionId: {
      type: String,
      required: true,
    },
    value: {
      type: Schema.Types.Mixed,
      default: "",
    },
    isCorrect: {
      type: Boolean,
    },
    pointsAwarded: {
      type: Number,
      default: 0,
    },
    mentorFeedback: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const QuizSubmissionSchema = new Schema<IQuizSubmission>(
  {
    quizId: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    answers: {
      type: [QuizAnswerSchema],
      default: [],
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    maxScore: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "graded"],
      default: "submitted",
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Har bir o'quvchi uchun bitta quiz topshirig'i (yoki oxirgi topshiriq)
QuizSubmissionSchema.index({ quizId: 1, studentId: 1 }, { unique: true });

export const QuizSubmission: Model<IQuizSubmission> =
  mongoose.models.QuizSubmission ||
  mongoose.model<IQuizSubmission>("QuizSubmission", QuizSubmissionSchema);
