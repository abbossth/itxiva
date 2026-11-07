import mongoose, { Schema, Document, Model } from "mongoose";

// Jonli o'yin: mentor proyektorda boshqaradi, guruh o'quvchilari telefondan bir vaqtda javob beradi.
// Savollar o'yin yaratilganda nusxalanadi — keyin test tahrirlansa ham o'yin buzilmaydi.

export type LiveGameMode = "classic" | "survival" | "chest" | "team";
export type LiveGameSource = "today" | "all";
export type LiveGameStatus = "lobby" | "question" | "reveal" | "finished";
export type LiveQuestionType = "single_choice" | "multiple_choice" | "short_answer";

export interface ILiveQuestion {
  prompt: string;
  type: LiveQuestionType;
  options: string[];
  correctAnswers: string[];
  timeLimit: number;
  sourceQuizId?: string | mongoose.Types.ObjectId | null;
  /** Asl savol (test savoli uchun coin bir marta beriladi) */
  sourceQuestionId?: string | null;
}

export interface ILiveEvent {
  text: string;
  kind: "chest" | "steal" | "shield" | "double" | "out" | "info";
  at: Date | string;
}

export interface ILiveGameData {
  _id: string | mongoose.Types.ObjectId;
  mentorId: string | mongoose.Types.ObjectId;
  groupId: string | mongoose.Types.ObjectId;
  mode: LiveGameMode;
  source: LiveGameSource;
  teams: number;
  prizes: number[];
  status: LiveGameStatus;
  /** Joriy savol; lobby'da -1 */
  index: number;
  questionStartedAt?: Date | string | null;
  questions: ILiveQuestion[];
  events: ILiveEvent[];
  finishedAt?: Date | string | null;
  /** Coin berilgan vaqt (bir marta) */
  rewardedAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface ILiveGame extends Document, Omit<ILiveGameData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const LiveQuestionSchema = new Schema<ILiveQuestion>(
  {
    prompt: { type: String, required: true },
    type: { type: String, enum: ["single_choice", "multiple_choice", "short_answer"], required: true },
    options: { type: [String], default: [] },
    correctAnswers: { type: [String], default: [] },
    timeLimit: { type: Number, default: 20 },
    sourceQuizId: { type: Schema.Types.ObjectId, default: null },
    sourceQuestionId: { type: String, default: null },
  },
  { _id: false }
);

const LiveEventSchema = new Schema<ILiveEvent>(
  {
    text: { type: String, required: true },
    kind: { type: String, enum: ["chest", "steal", "shield", "double", "out", "info"], default: "info" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const LiveGameSchema = new Schema<ILiveGame>(
  {
    mentorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
    mode: { type: String, enum: ["classic", "survival", "chest", "team"], required: true },
    source: { type: String, enum: ["today", "all"], required: true },
    teams: { type: Number, default: 2, min: 2, max: 4 },
    prizes: { type: [Number], default: [30, 20, 10] },
    status: { type: String, enum: ["lobby", "question", "reveal", "finished"], default: "lobby" },
    index: { type: Number, default: -1 },
    questionStartedAt: { type: Date, default: null },
    questions: { type: [LiveQuestionSchema], default: [] },
    events: { type: [LiveEventSchema], default: [] },
    finishedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LiveGameSchema.index({ groupId: 1, status: 1 });
LiveGameSchema.index({ mentorId: 1, createdAt: -1 });

export const LiveGame: Model<ILiveGame> = mongoose.models.LiveGame || mongoose.model<ILiveGame>("LiveGame", LiveGameSchema);
