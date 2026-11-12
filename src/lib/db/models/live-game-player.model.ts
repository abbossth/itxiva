import mongoose, { Schema, Document, Model } from "mongoose";

// Jonli o'yin ishtirokchisi: ochko, jon (omon qolish), sandiqlar (xazina), jamoa.

export interface ILiveAnswer {
  index: number;
  value: string | string[];
  isCorrect: boolean;
  ms: number;
  points: number;
  /** Sarguzasht rejimlari: javobdan keyin tanlangan taktika va nishon */
  tactic?: string | null;
  target?: string | null;
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
  /** Oxirgi natijadagi o'rni va undan oldingisi (reyting animatsiyasi uchun); 0 — hali yo'q */
  rank: number;
  prevRank: number;
  /** Qisqa o'yinlar natijasi: round — savol raqami, value — bosish/nishon soni, points — olingan ochko */
  minigames: { round: number; value: number; points: number }[];
  /** Sarguzasht rejimlari: masofa (m), balandlik (km), qadam, olmos yoki katak soni */
  progress: number;
  /** Marraga / narigi qirg'oqqa yetgan (poyga, ko'prik) */
  finished: boolean;
  /** Oxirgi natija ta'siri (o'quvchi ekranida va proyektorda ko'rsatiladi) */
  effect?: { index: number; kind: string; text: string; delta: number; items: string[] } | null;
  /** "Kiber jang" (hamma hammaga qarshi) holati */
  arena?: ILiveArenaPlayer | null;
  createdAt?: Date | string;
}

export interface ILiveArenaShot {
  id: number;
  x: number;
  y: number;
  a: number;
  /** Server qabul qilgan vaqt (ms) */
  at: number;
}

export interface ILiveArenaPlayer {
  lives: number;
  maxLives: number;
  kills: number;
  /** Raqibga tekkan o'qlar */
  hits: number;
  hitsTaken: number;
  out: boolean;
  outAt?: number | null;
  killedBy?: string | null;
  skin: string;
  weapon: string;
  /** Qurolning otish oralig'i (soniya) */
  cooldown: number;
  x: number;
  y: number;
  a: number;
  /** Kuchlar tugash vaqti (ms) */
  shieldUntil: number;
  speedUntil: number;
  rapidUntil: number;
  tripleUntil: number;
  hitUntil: number;
  /** Oxirgi otilgan o'qlar (boshqalar ko'rishi va tekkanini tekshirish uchun) */
  shots: ILiveArenaShot[];
  /** Tekkan deb hisoblangan o'qlar (ikki marta hisoblanmasin) */
  used: number[];
  points: number;
  place: number;
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
    tactic: { type: String, default: null },
    target: { type: String, default: null },
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
    rank: { type: Number, default: 0 },
    prevRank: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    finished: { type: Boolean, default: false },
    effect: {
      type: new Schema({ index: Number, kind: String, text: String, delta: Number, items: { type: [String], default: [] } }, { _id: false }),
      default: null,
    },
    minigames: {
      type: [new Schema({ round: Number, value: { type: Number, default: 0 }, points: { type: Number, default: 0 } }, { _id: false })],
      default: [],
    },
    arena: {
      type: new Schema(
        {
          lives: { type: Number, default: 3 },
          maxLives: { type: Number, default: 3 },
          kills: { type: Number, default: 0 },
          hits: { type: Number, default: 0 },
          hitsTaken: { type: Number, default: 0 },
          out: { type: Boolean, default: false },
          outAt: { type: Number, default: null },
          killedBy: { type: String, default: null },
          skin: { type: String, default: "bolt" },
          weapon: { type: String, default: "Lazer-1" },
          cooldown: { type: Number, default: 0.36 },
          x: { type: Number, default: 0 },
          y: { type: Number, default: 0 },
          a: { type: Number, default: 0 },
          shieldUntil: { type: Number, default: 0 },
          speedUntil: { type: Number, default: 0 },
          rapidUntil: { type: Number, default: 0 },
          tripleUntil: { type: Number, default: 0 },
          hitUntil: { type: Number, default: 0 },
          shots: {
            type: [new Schema({ id: Number, x: Number, y: Number, a: Number, at: Number }, { _id: false })],
            default: [],
          },
          used: { type: [Number], default: [] },
          points: { type: Number, default: 0 },
          place: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LiveGamePlayerSchema.index({ gameId: 1, studentId: 1 }, { unique: true });

export const LiveGamePlayer: Model<ILiveGamePlayer> =
  mongoose.models.LiveGamePlayer || mongoose.model<ILiveGamePlayer>("LiveGamePlayer", LiveGamePlayerSchema);
