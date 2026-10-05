import mongoose, { Schema, Document, Model } from "mongoose";

export type ExamQuestionType =
  | "single_choice"
  | "multiple_choice"
  | "open_ended"
  | "project_upload"
  | "github_repo";

export interface IExamQuestion {
  _id?: string | mongoose.Types.ObjectId;
  type: ExamQuestionType;
  prompt: string;
  options?: string[];
  correctAnswers?: string[];
  points: number;
  allowedFileTypes?: string[];
  maxFileSizeMb?: number;
}

export interface IExamData {
  _id: string | mongoose.Types.ObjectId;
  groupIds: (string | mongoose.Types.ObjectId)[];
  quarter: number;
  title: string;
  description?: string;
  startTime: Date | string;
  endTime: Date | string;
  durationMinutes: number;
  maxAttempts: number;
  passingScore: number;
  isPublished: boolean;
  isResultsPublished: boolean;
  questions: IExamQuestion[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IExam extends Document, Omit<IExamData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const ExamQuestionSchema = new Schema<IExamQuestion>(
  {
    type: {
      type: String,
      enum: [
        "single_choice",
        "multiple_choice",
        "open_ended",
        "project_upload",
        "github_repo",
      ],
      required: true,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
    correctAnswers: {
      type: [String],
      default: [],
    },
    points: {
      type: Number,
      required: true,
      default: 5,
      min: 1,
    },
    allowedFileTypes: {
      type: [String],
      default: [".zip", ".pdf", ".png", ".jpg", ".docx"],
    },
    maxFileSizeMb: {
      type: Number,
      default: 50,
    },
  },
  { _id: true }
);

const ExamSchema = new Schema<IExam>(
  {
    groupIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Group",
        required: true,
      },
    ],
    quarter: {
      type: Number,
      required: true,
      enum: [1, 2, 3, 4],
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 60,
      min: 5,
    },
    maxAttempts: {
      type: Number,
      default: 1,
      min: 1,
    },
    passingScore: {
      type: Number,
      default: 60,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    isResultsPublished: {
      type: Boolean,
      default: false,
    },
    questions: {
      type: [ExamQuestionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

ExamSchema.index({ groupIds: 1, isPublished: 1, startTime: 1 });

export const Exam: Model<IExam> =
  mongoose.models.Exam || mongoose.model<IExam>("Exam", ExamSchema);
