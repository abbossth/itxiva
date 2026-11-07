import mongoose, { Schema, Document, Model } from "mongoose";

// Jonli o'yin ishtirokchisi: ochko, jon (omon qolish), sandiqlar (xazina), jamoa.

export interface ILiveAnswer {
  index: number;
  value: string | string[];
  isCorrect: boolean;
  ms: number;
  points: number;
}

export interface ILiveGamePlayerData {
  _id: string | mongoose.Types.ObjectId;
  gameId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  name: string;
  /** Jamoaviy jangda jamoa raqami (0 dan) */
  team: number;
  score: number;
  streak: number;
  lives: number;
  eliminated: boolean;
  /** Qaysi savolda o'yindan chiqqan (tartib uchun) */
  eliminatedAt?: number | null;
  shield: boolean;
  /** Keyingi to'g'ri javob ochkosi ikki baravar */
  double: boolean;
  /** Ochilmagan sandiqlar */
  chests: number;
  /** Oxirgi ochilgan sandiq natijasi (o'quvchiga ko'rsatish uchun) */
  lastChest?: { kind: string; amount: number; text: string } | null;
  answers: ILiveAnswer[];
  /** Yakunda berilgan coin */
  coins: number;
  createdAt?: Date | string;
}

export interface ILiveGamePlayer extends Document, Omit<ILiveGamePlayerData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const LiveAnswerSchema = new Schema<ILiveAnswer>(
  {
    index: { type: Number, required: true },
    value: { type: Schema.Types.Mixed, default: "" },
    isCorrect: { type: Boolean, default: false },
    ms: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
  },
  { _id: false }
);

const LiveGamePlayerSchema = new Schema<ILiveGamePlayer>(
  {
    gameId: { type: Schema.Types.ObjectId, ref: "LiveGame", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    team: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lives: { type: Number, default: 3 },
    eliminated: { type: Boolean, default: false },
    eliminatedAt: { type: Number, default: null },
    shield: { type: Boolean, default: false },
    double: { type: Boolean, default: false },
    chests: { type: Number, default: 0 },
    lastChest: {
      type: new Schema({ kind: String, amount: Number, text: String }, { _id: false }),
      default: null,
    },
    answers: { type: [LiveAnswerSchema], default: [] },
    coins: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LiveGamePlayerSchema.index({ gameId: 1, studentId: 1 }, { unique: true });

export const LiveGamePlayer: Model<ILiveGamePlayer> =
  mongoose.models.LiveGamePlayer || mongoose.model<ILiveGamePlayer>("LiveGamePlayer", LiveGamePlayerSchema);
