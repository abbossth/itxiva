import mongoose, { Schema, Document, Model } from "mongoose";

export type MaterialType = "file" | "youtube" | "link";

export interface IMaterial {
  _id?: string | mongoose.Types.ObjectId;
  type: MaterialType;
  title: string;
  urlOrKey: string;
  mimeType?: string;
  fileSize?: number;
  createdAt?: Date | string;
}

export interface ILessonData {
  _id: string | mongoose.Types.ObjectId;
  groupId: string | mongoose.Types.ObjectId;
  quarter: number;
  order: number;
  title: string;
  topic?: string;
  description?: string;
  date?: Date | string;
  isPublished: boolean;
  materials: IMaterial[];
  isNew?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface ILesson extends Document, Omit<ILessonData, "_id" | "isNew"> {
  _id: mongoose.Types.ObjectId;
}

const MaterialSchema = new Schema<IMaterial>(
  {
    type: {
      type: String,
      enum: ["file", "youtube", "link"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    urlOrKey: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    fileSize: {
      type: Number,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  }
);

const LessonSchema = new Schema<ILesson>(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    quarter: {
      type: Number,
      required: true,
      enum: [1, 2, 3, 4],
      index: true,
    },
    order: {
      type: Number,
      default: 1,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    materials: [MaterialSchema],
  },
  {
    timestamps: true,
  }
);

// Compound indexes
LessonSchema.index({ groupId: 1, quarter: 1, order: 1 });
LessonSchema.index({ groupId: 1, isPublished: 1, quarter: 1 });

export const Lesson: Model<ILesson> =
  mongoose.models.Lesson || mongoose.model<ILesson>("Lesson", LessonSchema);
