import mongoose, { Schema, Document, Model } from "mongoose";

// O'quvchi faolligi: kunlik topshiriqlar va marralar shu yozuvlardan hisoblanadi.
// (o'quvchi, tur, kun, ref) yagona — bir savolga bir kunda qayta javob yoki materialni qayta ochish ikki marta sanalmaydi.

export type ActivityKind = "login" | "material_view" | "quiz_answer";

export interface IActivityEvent extends Document {
  _id: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  kind: ActivityKind;
  /** Toshkent kuni "2026-10-16" */
  dayKey: string;
  /** Savol yoki material identifikatori; kirishda bo'sh */
  ref: string;
  /** Test javobi to'g'rimi (marralar uchun) */
  correct?: boolean;
  createdAt?: Date;
}

const ActivityEventSchema = new Schema<IActivityEvent>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["login", "material_view", "quiz_answer"], required: true },
    dayKey: { type: String, required: true },
    ref: { type: String, default: "" },
    correct: { type: Boolean },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivityEventSchema.index({ studentId: 1, kind: 1, dayKey: 1, ref: 1 }, { unique: true });
ActivityEventSchema.index({ kind: 1, dayKey: 1 });

export const ActivityEvent: Model<IActivityEvent> =
  mongoose.models.ActivityEvent || mongoose.model<IActivityEvent>("ActivityEvent", ActivityEventSchema);
