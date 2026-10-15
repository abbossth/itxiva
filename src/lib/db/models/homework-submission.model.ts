import mongoose, { Schema, Document, Model } from "mongoose";

// submitted: o'quvchi yubordi, mentor hali tekshirmagan -> graded: ball qo'yildi (yopiq).
// returned: mentor qayta ishlashga qaytardi, o'quvchi yana yubora oladi.
export type HomeworkStatus = "submitted" | "returned" | "graded";

export interface IHomeworkFile {
  key: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface IIntegrityMatch {
  submissionId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  /** Tekshiruv paytidagi ism va guruh (keyin o'zgarsa ham hisobot o'qiladi) */
  fullName: string;
  groupName: string;
  lessonId: string | mongoose.Types.ObjectId;
  percent: number;
}

/**
 * Javob yuborilganda avtomatik tekshiruv: boshqa javoblarga o'xshashlik (plagiat) va AI yozganlik ehtimoli.
 * pending — tekshirilmoqda; done — tayyor; failed — AI qismi ishlamadi (o'xshashlik baribir hisoblangan)
 */
export interface IHomeworkIntegrity {
  status: "pending" | "done" | "failed";
  /** 0–100: eng o'xshash javob bilan moslik */
  similarity: number;
  matches: IIntegrityMatch[];
  /** 0–100: AI yordamida yozilgan bo'lish ehtimoli; null — aniqlab bo'lmaydi (matn yo'q yoki juda qisqa) */
  aiScore: number | null;
  aiSignals: string[];
  checkedAt: Date | string | null;
}

export interface IHomeworkSubmissionData {
  _id: string | mongoose.Types.ObjectId;
  lessonId: string | mongoose.Types.ObjectId;
  groupId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  text: string;
  links: string[];
  files: IHomeworkFile[];
  status: HomeworkStatus;
  submittedAt: Date | string;
  isLate: boolean;
  attempt: number;
  score?: number | null;
  feedback?: string;
  coinsAwarded: number;
  gradedAt?: Date | string | null;
  gradedBy?: string | mongoose.Types.ObjectId | null;
  integrity?: IHomeworkIntegrity | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IHomeworkSubmission extends Document, Omit<IHomeworkSubmissionData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const HomeworkFileSchema = new Schema<IHomeworkFile>(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number },
  },
  { _id: false }
);

const IntegrityMatchSchema = new Schema<IIntegrityMatch>(
  {
    submissionId: { type: Schema.Types.ObjectId, ref: "HomeworkSubmission", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fullName: { type: String, default: "" },
    groupName: { type: String, default: "" },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    percent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const IntegritySchema = new Schema<IHomeworkIntegrity>(
  {
    status: { type: String, enum: ["pending", "done", "failed"], default: "pending" },
    similarity: { type: Number, default: 0, min: 0, max: 100 },
    matches: [IntegrityMatchSchema],
    aiScore: { type: Number, default: null, min: 0, max: 100 },
    aiSignals: [{ type: String }],
    checkedAt: { type: Date, default: null },
  },
  { _id: false }
);

const HomeworkSubmissionSchema = new Schema<IHomeworkSubmission>(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, default: "" },
    links: [{ type: String, trim: true }],
    files: [HomeworkFileSchema],
    status: {
      type: String,
      enum: ["submitted", "returned", "graded"],
      default: "submitted",
      index: true,
    },
    submittedAt: { type: Date, default: Date.now },
    isLate: { type: Boolean, default: false },
    attempt: { type: Number, default: 1 },
    score: { type: Number, default: null, min: 0, max: 100 },
    feedback: { type: String, default: "", trim: true },
    coinsAwarded: { type: Number, default: 0 },
    gradedAt: { type: Date, default: null },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    integrity: { type: IntegritySchema, default: null },
  },
  { timestamps: true }
);

// Bitta darsga bitta o'quvchidan bitta javob (qayta yuborish shu hujjatni yangilaydi)
HomeworkSubmissionSchema.index({ lessonId: 1, studentId: 1 }, { unique: true });
HomeworkSubmissionSchema.index({ groupId: 1, status: 1 });
HomeworkSubmissionSchema.index({ studentId: 1, submittedAt: -1 });

export const HomeworkSubmission: Model<IHomeworkSubmission> =
  mongoose.models.HomeworkSubmission ||
  mongoose.model<IHomeworkSubmission>("HomeworkSubmission", HomeworkSubmissionSchema);
