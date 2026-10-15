import mongoose, { Schema, Document, Model } from "mongoose";

// Topshiriqqa yuborilgan ish yoki dalil. Avtomatik bajarilgan topshiriq ham shu yerda (auto: true, darhol approved).

export type QuestSubmissionStatus = "pending" | "approved" | "rejected";

export interface IQuestEvidence {
  platform?: string;
  courseName?: string;
  url?: string;
  /** Takrorni aniqlash uchun normallashtirilgan havola */
  normUrl?: string;
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  certId?: string;
  normCertId?: string;
  issuedAt?: Date | string | null;
  note?: string;
}

/** Tizim tekshiruvi natijasi (mentorga avtomatik ko'rsatiladi) */
export interface IQuestCheck {
  key: "duplicate" | "date" | "monthly_limit";
  ok: boolean;
  message: string;
}

export interface IQuestSubmissionData {
  _id: string | mongoose.Types.ObjectId;
  questId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  groupId?: string | mongoose.Types.ObjectId | null;
  status: QuestSubmissionStatus;
  auto: boolean;
  /** Davr kaliti ("once", "d:2026-10-16", "w:2026-W42") — cheksiz topshiriqda null */
  periodKey: string | null;
  /** Oylik limit uchun: "2026-10" */
  monthKey: string;
  evidence?: IQuestEvidence;
  checks: IQuestCheck[];
  checklist?: { name?: boolean; course?: boolean; date?: boolean; program?: boolean };
  coins: number;
  xp: number;
  /** Musobaqa: egallangan o'rin (1–3) */
  place?: number | null;
  rejectReason?: string;
  reviewedBy?: string | mongoose.Types.ObjectId | null;
  reviewedAt?: Date | string | null;
  /** Tasdiqlangan mukofot keyin bekor qilingan (masalan, soxta sertifikat aniqlansa) */
  revokedAt?: Date | string | null;
  submittedAt: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IQuestSubmission extends Document, Omit<IQuestSubmissionData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const QuestSubmissionSchema = new Schema<IQuestSubmission>(
  {
    questId: { type: Schema.Types.ObjectId, ref: "Quest", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    auto: { type: Boolean, default: false },
    periodKey: { type: String, default: null },
    monthKey: { type: String, required: true },
    evidence: {
      platform: { type: String, trim: true },
      courseName: { type: String, trim: true },
      url: { type: String, trim: true },
      normUrl: { type: String, trim: true },
      fileKey: { type: String, trim: true },
      fileName: { type: String, trim: true },
      fileSize: { type: Number },
      mimeType: { type: String, trim: true },
      certId: { type: String, trim: true },
      normCertId: { type: String, trim: true },
      issuedAt: { type: Date, default: null },
      note: { type: String, trim: true },
    },
    checks: {
      type: [new Schema({ key: String, ok: Boolean, message: String }, { _id: false })],
      default: [],
    },
    checklist: {
      name: { type: Boolean },
      course: { type: Boolean },
      date: { type: Boolean },
      program: { type: Boolean },
    },
    coins: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    place: { type: Number, default: null },
    rejectReason: { type: String, trim: true, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Avtomatik topshiriq bir davrda bir marta bajariladi (parallel tekshiruvda ham)
QuestSubmissionSchema.index(
  { questId: 1, studentId: 1, periodKey: 1 },
  { unique: true, partialFilterExpression: { auto: true } }
);
QuestSubmissionSchema.index({ status: 1, submittedAt: 1 });
QuestSubmissionSchema.index({ studentId: 1, questId: 1, monthKey: 1 });
QuestSubmissionSchema.index({ "evidence.normUrl": 1 }, { sparse: true });
QuestSubmissionSchema.index({ "evidence.normCertId": 1 }, { sparse: true });

export const QuestSubmission: Model<IQuestSubmission> =
  mongoose.models.QuestSubmission || mongoose.model<IQuestSubmission>("QuestSubmission", QuestSubmissionSchema);
