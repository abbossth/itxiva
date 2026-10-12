import mongoose, { Schema, Document, Model } from "mongoose";

// O'chirilgan narsa bazadan yo'qolmaydi: o'zi va unga bog'liq yozuvlar shu yerga ko'chiriladi.
// Asosiy to'plamlarda ular qolmaydi, shuning uchun ro'yxatlar, reyting va hisobotlarga aralashmaydi.

export type ArchiveKind = "student" | "group" | "lesson" | "exam" | "product" | "attendance";

export interface IArchive extends Document {
  _id: mongoose.Types.ObjectId;
  kind: ArchiveKind;
  /** O'chirilgan obyektning asl `_id`si — tiklanganda shu bilan qaytadi */
  entityId: mongoose.Types.ObjectId;
  title: string;
  subtitle: string;
  /** Obyekt tegishli bo'lgan guruh (bo'lsa) */
  groupId?: mongoose.Types.ObjectId | null;
  deletedBy: mongoose.Types.ObjectId;
  /** To'plam nomi → shu arxivdagi yozuvlar soni */
  counts: Record<string, number>;
  createdAt: Date;
}

const ArchiveSchema = new Schema<IArchive>(
  {
    kind: { type: String, enum: ["student", "group", "lesson", "exam", "product", "attendance"], required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    groupId: { type: Schema.Types.ObjectId, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    counts: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ArchiveSchema.index({ createdAt: -1 });

export interface IArchivedDoc extends Document {
  _id: mongoose.Types.ObjectId;
  archiveId: mongoose.Types.ObjectId;
  /** Yozuv olingan to'plam nomi */
  coll: string;
  /** Yozuvning o'zi, qanday bo'lsa shunday */
  doc: Record<string, unknown>;
  /** Boshqa arxivdan ko'chib kelgan (masalan, tiklangan davomatdagi arxivlangan o'quvchining yozuvi) */
  moved?: boolean;
}

const ArchivedDocSchema = new Schema<IArchivedDoc>({
  archiveId: { type: Schema.Types.ObjectId, required: true, index: true },
  coll: { type: String, required: true },
  doc: { type: Schema.Types.Mixed, required: true },
  moved: { type: Boolean, default: false },
});

export const Archive: Model<IArchive> = mongoose.models.Archive || mongoose.model<IArchive>("Archive", ArchiveSchema);
export const ArchivedDoc: Model<IArchivedDoc> =
  mongoose.models.ArchivedDoc || mongoose.model<IArchivedDoc>("ArchivedDoc", ArchivedDocSchema);
