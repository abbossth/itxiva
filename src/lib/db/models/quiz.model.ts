import mongoose, { Schema, Document, Model } from "mongoose";

export type QuizQuestionType = "single_choice" | "multiple_choice" | "short_answer" | "open_ended";

export interface IQuizQuestion {
  _id?: string | mongoose.Types.ObjectId;
  type: QuizQuestionType;
  prompt: string;
  options?: string[];
  correctAnswers: string[];
  points: number;
  explanation?: string;
}

export interface IQuizData {
  _id: string | mongoose.Types.ObjectId;
  lessonId: string | mongoose.Types.ObjectId;
  title: string;
  description?: string;
  questions: IQuizQuestion[];
  isPublished: boolean;
  passingScore?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IQuiz extends Document, Omit<IQuizData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const QuizQuestionSchema = new Schema<IQuizQuestion>(
  {
    type: {
      type: String,
      enum: ["single_choice", "multiple_choice", "short_answer", "open_ended"],
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
      default: 1,
      min: 1,
    },
    explanation: {
      type: String,
      trim: true,
    },
  },
  { _id: true }
);

const QuizSchema = new Schema<IQuiz>(
  {
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
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
    questions: {
      type: [QuizQuestionSchema],
      default: [],
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    passingScore: {
      type: Number,
      default: 60,
    },
  },
  {
    timestamps: true,
  }
);

export const Quiz: Model<IQuiz> =
  mongoose.models.Quiz || mongoose.model<IQuiz>("Quiz", QuizSchema);
