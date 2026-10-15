import mongoose, { Schema, Document, Model } from "mongoose";
import type { QuestRepeat } from "@/lib/gamification/periods";

// Topshiriq (quest): o'quvchi bajarib coin va XP oladigan qo'shimcha vazifa.

export type QuestVerify = "auto" | "mentor" | "proof" | "competition";
export type QuestDifficulty = "easy" | "medium" | "hard";
export type QuestStatus = "draft" | "published" | "archived";
export type QuestTemplate = "certificate" | "project" | "habit" | "group_challenge" | "weekly_problem";
/**
 * Avtomatik tekshiriladigan shartlar:
 *  tests_today — bugun N ta test savoliga javob; materials — davrda N ta dars materialini ochish;
 *  login — platformaga kirish; login_streak — N kunlik kirish seriyasi;
 *  month_attendance — oy davomida to'liq davomat; group_challenge — guruh oylik davomati N% dan yuqori
 */
export type QuestAutoKind = "tests_today" | "materials" | "login" | "login_streak" | "month_attendance" | "group_challenge";
export type EvidenceLink = "required" | "optional" | "none";

export interface IQuestData {
  _id: string | mongoose.Types.ObjectId;
  title: string;
  description: string;
  difficulty: QuestDifficulty;
  verify: QuestVerify;
  template?: QuestTemplate | null;
  autoRule?: { kind: QuestAutoKind; target: number } | null;
  evidence: { link: EvidenceLink; file: boolean; certId: boolean; note: boolean };
  guard: { uniqueProof: boolean; dateAfterJoin: boolean; monthlyLimit: number | null };
  reward: {
    /** Belgilangan miqdor yoki oraliq (aniq miqdorni mentor tasdiqlashda tanlaydi) */
    coinsMin: number;
    coinsMax: number;
    /** null — coin bilan teng */
    xp: number | null;
    /** Musobaqa: 1–3-o'rinlar uchun coin */
    places: number[];
  };
  audience: { groupIds: (string | mongoose.Types.ObjectId)[]; grades: number[] };
  repeat: QuestRepeat;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  status: QuestStatus;
  /** Mentor faol/nofaol qiladi (e'lon qilinganni vaqtincha to'xtatish) */
  isActive: boolean;
  notify: { announce: boolean; onSubmission: boolean };
  /** Tizim yaratgan standart topshiriq (kunlik odatlar) */
  isSystem?: boolean;
  publishedAt?: Date | string | null;
  createdBy?: string | mongoose.Types.ObjectId | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IQuest extends Document, Omit<IQuestData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const QuestSchema = new Schema<IQuest>(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    verify: { type: String, enum: ["auto", "mentor", "proof", "competition"], required: true },
    template: { type: String, enum: ["certificate", "project", "habit", "group_challenge", "weekly_problem", null], default: null },
    autoRule: {
      type: new Schema(
        {
          kind: {
            type: String,
            enum: ["tests_today", "materials", "login", "login_streak", "month_attendance", "group_challenge"],
            required: true,
          },
          target: { type: Number, required: true, min: 1 },
        },
        { _id: false }
      ),
      default: null,
    },
    evidence: {
      link: { type: String, enum: ["required", "optional", "none"], default: "none" },
      file: { type: Boolean, default: false },
      certId: { type: Boolean, default: false },
      note: { type: Boolean, default: false },
    },
    guard: {
      uniqueProof: { type: Boolean, default: true },
      dateAfterJoin: { type: Boolean, default: false },
      monthlyLimit: { type: Number, default: null, min: 1 },
    },
    reward: {
      coinsMin: { type: Number, required: true, min: 0 },
      coinsMax: { type: Number, required: true, min: 0 },
      xp: { type: Number, default: null, min: 0 },
      places: { type: [Number], default: [] },
    },
    audience: {
      groupIds: [{ type: Schema.Types.ObjectId, ref: "Group" }],
      grades: [{ type: Number }],
    },
    repeat: { type: String, enum: ["once", "daily", "weekly", "unlimited"], default: "once" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    isActive: { type: Boolean, default: true },
    notify: {
      announce: { type: Boolean, default: true },
      onSubmission: { type: Boolean, default: true },
    },
    isSystem: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

QuestSchema.index({ status: 1, isActive: 1, verify: 1 });

export const Quest: Model<IQuest> = mongoose.models.Quest || mongoose.model<IQuest>("Quest", QuestSchema);
