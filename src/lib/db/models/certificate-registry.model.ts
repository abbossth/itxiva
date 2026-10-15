import mongoose, { Schema, Document, Model } from "mongoose";

// Tasdiqlangan sertifikatlar reyestri: bir havola yoki ID ikki marta qabul qilinmaydi (unique indekslar).
// Mukofot bekor qilinsa ham yozuv qoladi — soxta sertifikat qayta yuborilmasin.

export interface ICertificateRegistry extends Document {
  _id: mongoose.Types.ObjectId;
  normUrl?: string;
  normCertId?: string;
  studentId: mongoose.Types.ObjectId;
  questId: mongoose.Types.ObjectId;
  submissionId: mongoose.Types.ObjectId;
  platform?: string;
  courseName?: string;
  revoked?: boolean;
  createdAt?: Date;
}

const CertificateRegistrySchema = new Schema<ICertificateRegistry>(
  {
    normUrl: { type: String },
    normCertId: { type: String },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    questId: { type: Schema.Types.ObjectId, ref: "Quest", required: true },
    submissionId: { type: Schema.Types.ObjectId, ref: "QuestSubmission", required: true },
    platform: { type: String, trim: true },
    courseName: { type: String, trim: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CertificateRegistrySchema.index({ normUrl: 1 }, { unique: true, partialFilterExpression: { normUrl: { $type: "string" } } });
CertificateRegistrySchema.index({ normCertId: 1 }, { unique: true, partialFilterExpression: { normCertId: { $type: "string" } } });

export const CertificateRegistry: Model<ICertificateRegistry> =
  mongoose.models.CertificateRegistry ||
  mongoose.model<ICertificateRegistry>("CertificateRegistry", CertificateRegistrySchema);
