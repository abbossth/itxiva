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
  /** Omad g'ildiragidan yutilgan sovg'alar: o'yin tugagach ochiladi (quti — 5–20, super baraban — 5–50 coin) */
  prizes?: ILivePrize[];
  /** Sarguzasht rejimlari: masofa (m), balandlik (km), qadam, olmos yoki katak soni */
  progress: number;
  /** Marraga / narigi qirg'oqqa yetgan (poyga, ko'prik) */
  finished: boolean;
  /** Oxirgi natija ta'siri (o'quvchi ekranida va proyektorda ko'rsatiladi) */
  effect?: { index: number; kind: string; text: string; delta: number; items: string[]; zaps?: { to: string; m: number; blocked: boolean }[] } | null;
  /** "Kiber jang" (hamma hammaga qarshi) holati */
  arena?: ILiveArenaPlayer | null;
  /** Jang oldidan xarita uchun ovozi (qaysi jang uchun) */
  arenaVote?: { round: number; map: string } | null;
  /** "Galaktika poygasi 3D": joriy poygadagi holati */
  galaxy?: ILiveGalaxyPlayer | null;
  /** "Yashil zona": joriy raunddagi holati */
  zone?: ILiveZonePlayer | null;
  /** O'quvchi personaji (qo'shilgan paytdagi ko'rinishi va darajasi) */
  look?: Record<string, unknown> | null;
  /** Kutish zalidagi oxirgi harakati (emot) */
  emote?: { id: string; at: number } | null;
  createdAt?: Date | string;
}

export interface ILiveGalaxyPlayer {
  round: number;
  /** Uchgan masofa (m) va yonlama joyi (-1…1) */
  d: number;
  x: number;
  orbs: number;
  /** Turbo zaryadlari (to'g'ri javoblarga qarab) */
  turbo: number;
  /** Kema rangi (tartib raqami) */
  ship: number;
  points: number;
  place: number;
}

export interface ILiveZonePlayer {
  round: number;
  x: number;
  y: number;
  /** Oxirgi joylashuv qabul qilingan vaqt (ms) — tezlik tekshiruvi uchun */
  at: number;
  speed: number;
  color: number;
  out: boolean;
  /** Qaysi to'lqinda o'chgan (-1 — o'chmagan) */
  outWave: number;
  stars: number;
  points: number;
  place: number;
  /** Joy da'vosi: qaysi to'lqinda, qaysi zonaga, qachon kirgan (-1 — yo'q) */
  seatWave?: number;
  seatZone?: number;
  seatAt?: number;
}

export interface ILivePrize {
  /** Qaysi qisqa o'yindan (savol raqami) */
  round: number;
  kind: "box" | "superWheel";
  /** Ochilgach: coin miqdori va super barabanda tushgan segment */
  coins: number;
  segment: number;
  /** Personaj sovg'asi: buyum ("slot:id") yoki "power:N"; null — coin */
  gift?: string | null;
  openedAt?: Date | string | null;
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
  /** Jamoaviy arenada jamoa raqami; -1 — individual jang */
  team?: number;
  /** Emoji-reaksiya (EMOTES indeksi) va vaqti (ms) */
  emote?: number;
  emoteAt?: number;
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
    look: { type: Schema.Types.Mixed, default: null },
    emote: { type: new Schema({ id: String, at: Number }, { _id: false }), default: null },
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
      type: new Schema(
        {
          index: Number,
          kind: String,
          text: String,
          delta: Number,
          items: { type: [String], default: [] },
          zaps: { type: [new Schema({ to: String, m: Number, blocked: Boolean }, { _id: false })], default: [] },
        },
        { _id: false }
      ),
      default: null,
    },
    minigames: {
      type: [new Schema({ round: Number, value: { type: Number, default: 0 }, points: { type: Number, default: 0 } }, { _id: false })],
      default: [],
    },
    prizes: {
      type: [
        new Schema(
          {
            round: Number,
            kind: { type: String, enum: ["box", "superWheel"] },
            coins: { type: Number, default: 0 },
            segment: { type: Number, default: -1 },
            gift: { type: String, default: null },
            openedAt: { type: Date, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    arenaVote: { type: new Schema({ round: Number, map: String }, { _id: false }), default: null },
    zone: {
      type: new Schema(
        {
          round: Number,
          x: { type: Number, default: 50 },
          y: { type: Number, default: 31 },
          at: { type: Number, default: 0 },
          speed: { type: Number, default: 15 },
          color: { type: Number, default: 0 },
          out: { type: Boolean, default: false },
          outWave: { type: Number, default: -1 },
          stars: { type: Number, default: 0 },
          points: { type: Number, default: 0 },
          place: { type: Number, default: 0 },
          seatWave: { type: Number, default: -1 },
          seatZone: { type: Number, default: -1 },
          seatAt: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: null,
    },
    galaxy: {
      type: new Schema(
        {
          round: Number,
          d: { type: Number, default: 0 },
          x: { type: Number, default: 0 },
          orbs: { type: Number, default: 0 },
          turbo: { type: Number, default: 1 },
          ship: { type: Number, default: 0 },
          points: { type: Number, default: 0 },
          place: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: null,
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
          team: { type: Number, default: -1 },
          emote: { type: Number, default: -1 },
          emoteAt: { type: Number, default: 0 },
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
