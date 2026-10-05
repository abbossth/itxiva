import mongoose, { Schema, Document, Model } from "mongoose";
import { ExamQuestionType } from "./exam.model";

export type ExamSubmissionStatus = "in_progress" | "submitted" | "graded";

export interface IExamAnswer {
  questionId: string;
  type: ExamQuestionType;
  value?: string | string[];
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  repoUrl?: string;
  isCorrect?: boolean;
  pointsAwarded: number;
  mentorFeedback?: string;
}

export interface IExamSubmissionData {
  _id: string | mongoose.Types.ObjectId;
  examId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  groupId: string | mongoose.Types.ObjectId;
  attemptNumber: number;
  startedAt: Date | string;
  submittedAt?: Date | string;
  status: ExamSubmissionStatus;
  answers: IExamAnswer[];
  totalScore: number;
  maxScore: number;
  isPassed: boolean;
  mentorGeneralFeedback?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IExamSubmission extends Document, Omit<IExamSubmissionData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const ExamAnswerSchema = new Schema<IExamAnswer>(
  {
    questionId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    value: {
      type: Schema.Types.Mixed,
    },
    fileKey: {
      type: String,
      trim: true,
    },
    fileName: {
      type: String,
      trim: true,
    },
    fileSize: {
      type: Number,
    },
    repoUrl: {
      type: String,
      trim: true,
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

const ExamSubmissionSchema = new Schema<IExamSubmission>(
  {
    examId: {
      type: Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    attemptNumber: {
      type: Number,
      default: 1,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    submittedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "graded"],
      default: "in_progress",
      index: true,
    },
    answers: {
      type: [ExamAnswerSchema],
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
    isPassed: {
      type: Boolean,
      default: false,
    },
    mentorGeneralFeedback: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

ExamSubmissionSchema.index({ examId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });

export const ExamSubmission: Model<IExamSubmission> =
  mongoose.models.ExamSubmission ||
  mongoose.model<IExamSubmission>("ExamSubmission", ExamSubmissionSchema);
