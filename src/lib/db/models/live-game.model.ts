import mongoose, { Schema, Document, Model } from "mongoose";

// Jonli o'yin: mentor proyektorda boshqaradi, guruh o'quvchilari telefondan bir vaqtda javob beradi.
// Savollar o'yin yaratilganda nusxalanadi — keyin test tahrirlansa ham o'yin buzilmaydi.

import { LIVE_GAME_MODES, type LiveGameMode } from "@/lib/live-game/mode-list";
export { LIVE_GAME_MODES, type LiveGameMode };
export type LiveGameSource = "today" | "all";
export type LiveGameStatus = "lobby" | "question" | "reveal" | "minigame" | "arena" | "galaxy" | "zone" | "finished";
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

export interface ILiveMinigame {
  /** Qaysi savol natijasidan keyin (savol raqami) */
  round: number;
  kind: import("@/lib/live-game/minigames").MinigameKind;
  /** O'yin boshlanadigan vaqt (sanoqdan keyin) va tugash vaqti */
  startedAt: Date | string;
  endsAt: Date | string;
  endedAt?: Date | string | null;
  /** Omad g'ildiragi: server tanlagan segment, o'yinchi va natija */
  wheel?: { segment: number; effect: string; playerId: string; name: string } | null;
}

export interface ILiveGalaxy {
  round: number;
  final: boolean;
  /** Trassa urug'i — hamma bir xil trassada uchadi */
  seed: number;
  startedAt: Date | string;
  endsAt: Date | string;
  endedAt?: Date | string | null;
}

export interface ILiveZone {
  round: number;
  final: boolean;
  seed: number;
  startedAt: Date | string;
  endsAt: Date | string;
  /** Natijasi hisoblangan to'lqinlar soni */
  resolved: number;
  /** Real vaqt xonasida (Cloudflare) o'ynaladi — natijalarni xona yuboradi */
  rt?: boolean;
  /** Boshqa rejimdagi qisqa o'yin sifatida */
  mini?: boolean;
  endedAt?: Date | string | null;
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
  /** Yaratishda tanlangan qo'shimchalar */
  options: { minigames: boolean; arena: boolean; /** Jamoaviy jangda arena jamoa bo'lib o'tadi */ teamArena?: boolean; /** Qisqa o'yinlar orasida "Yashil zona" ham chiqadi */ zone?: boolean };
  /** Joriy yoki oxirgi qisqa o'yin */
  minigame?: ILiveMinigame | null;
  /** O'tkazilgan qisqa o'yinlar (savol raqamlari) */
  minigameRounds: number[];
  /** Shu o'yinda chiqqan raund turlari (qisqa o'yinlar va "zone") — tartib tasodifiy, takrorlanmasin */
  minigameKinds?: string[];
  /** Jang o'tkazilgan savollar (savol raqami; oxirgisi — final jang) */
  arenaRounds: number[];
  /** "Hudud bosib olish": har katakning egasi (o'yinchining qo'shilish tartibi), -1 — bo'sh */
  cells: number[];
  /** "Ko'prikdan o'tish": har qadamdagi yoriq taxta (yashirin) va ochilgan taxtalar (bit maskasi) */
  cracks?: number[];
  known?: number[];
  /** Rejim introsi boshlangan vaqt (kutish zalida) */
  introAt?: Date | string | null;
  /** Bonus raund: shu savolda ochko ×2 */
  bonusIndex?: number | null;
  /** Oxirgi bosqich — otishmali arena */
  arena?: ILiveArena | null;
  /** "Galaktika poygasi 3D": joriy yoki oxirgi poyga */
  galaxy?: ILiveGalaxy | null;
  /** Poyga o'tkazilgan savollar (oxirgisi — final) */
  galaxyRounds?: number[];
  /** "Yashil zona": joriy yoki oxirgi raund */
  zone?: ILiveZone | null;
  zoneRounds?: number[];
  finishedAt?: Date | string | null;
  /** O'quvchi yaratgan o'yin: server o'zi boshqaradi; g'oliblarga `prizes` (kamida `minPlayers` o'yinchi bo'lsa), sovg'a qutisi yo'q */
  studentGame?: boolean;
  /** Sovrin berilishi uchun kamida shuncha o'yinchi (o'quvchi o'yini) */
  minPlayers?: number;
  /** O'quvchi o'yini boshlanishi uchun kamida shuncha o'yinchi va tayyor bo'lgach o'zi boshlanish vaqti (ms) */
  needPlayers?: number;
  autoStartMs?: number;
  /** O'yinni yaratgan o'quvchi (studentGame) */
  creatorId?: string | mongoose.Types.ObjectId | null;
  creatorName?: string;
  /** Butun sinf uchun o'yin (masalan, 8): shu sinfdagi barcha guruhlar qo'shila oladi; null — faqat guruh */
  grade?: number | null;
  /** O'yin narxi (coin) — qatnashchilar birgalikda yig'adi; paid — hozircha yig'ilgani */
  price?: number;
  paid?: number;
  /** Kim qancha qo'shdi (har qo'shish alohida yozuv) */
  contributions?: { key: string; studentId: string | mongoose.Types.ObjectId; name: string; amount: number; at: Date | string }[];
  /** Narx to'lgan vaqt — FUNDED_START_S dan keyin o'yin o'zi boshlanadi */
  fundedAt?: Date | string | null;
  /** Boshlanmay bekor qilinib, coinlar qaytarilgan vaqt */
  refundedAt?: Date | string | null;
  /** Natija ochilgan vaqt — server o'zi keyingi savolga o'tishi uchun */
  revealedAt?: Date | string | null;
  /** Coin berilgan vaqt (bir marta) */
  rewardedAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface ILiveArenaPickup {
  id: number;
  kind: "heart" | "shield" | "speed" | "rapid" | "triple";
  x: number;
  y: number;
}

export interface ILiveArenaFeed {
  at: number;
  kind: "kill" | "pickup";
  a: string;
  b?: string | null;
  power?: string | null;
}

export interface ILiveArena {
  /** Qaysi savoldan keyingi jang (oxirgi savol — final) */
  round?: number;
  /** Jang xaritasi; ovoz berish davomida null (eski janglarda yo'q — klassik) */
  map?: string | null;
  /** Xarita uchun ovoz berish tugash vaqti; ovoz hal bo'lgach null */
  voteEndsAt?: Date | string | null;
  /** Jang davomiyligi (s) va jamoaviymi — ovozdan keyin jang shu bilan boshlanadi */
  seconds?: number;
  teams?: boolean;
  startedAt: Date | string;
  endsAt: Date | string;
  endedAt?: Date | string | null;
  /** Xaritadagi sovg'alar (birinchi yetib kelgan oladi) */
  pickups: ILiveArenaPickup[];
  nextPickupAt: number;
  seq: number;
  /** Kim kimni yiqitdi, kim nima oldi */
  feed: ILiveArenaFeed[];
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
    mode: { type: String, enum: LIVE_GAME_MODES, required: true },
    source: { type: String, enum: ["today", "all"], required: true },
    teams: { type: Number, default: 2, min: 2, max: 4 },
    prizes: { type: [Number], default: [10, 7, 5] },
    status: { type: String, enum: ["lobby", "question", "reveal", "minigame", "arena", "galaxy", "zone", "finished"], default: "lobby" },
    index: { type: Number, default: -1 },
    questionStartedAt: { type: Date, default: null },
    questions: { type: [LiveQuestionSchema], default: [] },
    events: { type: [LiveEventSchema], default: [] },
    options: {
      type: new Schema({ minigames: { type: Boolean, default: true }, arena: { type: Boolean, default: false }, teamArena: { type: Boolean, default: false }, zone: { type: Boolean, default: false } }, { _id: false }),
      default: () => ({ minigames: true, arena: false, teamArena: false }),
    },
    minigame: {
      type: new Schema(
        {
          round: Number,
          kind: { type: String, enum: ["tap", "target", "wheel", "bonus", "memory", "math", "colors", "reaction"] },
          startedAt: Date,
          endsAt: Date,
          endedAt: { type: Date, default: null },
          wheel: { type: new Schema({ segment: Number, effect: String, playerId: String, name: String }, { _id: false }), default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    minigameRounds: { type: [Number], default: [] },
    minigameKinds: { type: [String], default: [] },
    arenaRounds: { type: [Number], default: [] },
    galaxy: {
      type: new Schema(
        { round: Number, final: Boolean, seed: Number, startedAt: Date, endsAt: Date, endedAt: { type: Date, default: null } },
        { _id: false }
      ),
      default: null,
    },
    galaxyRounds: { type: [Number], default: [] },
    zone: {
      type: new Schema(
        {
          round: Number,
          final: Boolean,
          seed: Number,
          startedAt: Date,
          endsAt: Date,
          resolved: { type: Number, default: 0 },
          rt: { type: Boolean, default: false },
          mini: { type: Boolean, default: false },
          endedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    zoneRounds: { type: [Number], default: [] },
    cells: { type: [Number], default: [] },
    cracks: { type: [Number], default: [] },
    known: { type: [Number], default: [] },
    introAt: { type: Date, default: null },
    bonusIndex: { type: Number, default: null },
    studentGame: { type: Boolean, default: false },
    minPlayers: { type: Number, default: 0 },
    needPlayers: { type: Number, default: 0 },
    autoStartMs: { type: Number, default: 0 },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    creatorName: { type: String, default: "" },
    grade: { type: Number, default: null },
    price: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    contributions: {
      type: [new Schema({ key: String, studentId: { type: Schema.Types.ObjectId, ref: "User" }, name: String, amount: Number, at: Date }, { _id: false })],
      default: [],
    },
    fundedAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    revealedAt: { type: Date, default: null },
    arena: {
      type: new Schema(
        {
          round: { type: Number, default: null },
          map: { type: String, default: undefined },
          voteEndsAt: { type: Date, default: null },
          seconds: { type: Number, default: 0 },
          teams: { type: Boolean, default: false },
          startedAt: Date,
          endsAt: Date,
          endedAt: { type: Date, default: null },
          pickups: {
            type: [new Schema({ id: Number, kind: String, x: Number, y: Number }, { _id: false })],
            default: [],
          },
          nextPickupAt: { type: Number, default: 0 },
          seq: { type: Number, default: 0 },
          feed: {
            type: [new Schema({ at: Number, kind: String, a: String, b: { type: String, default: null }, power: { type: String, default: null } }, { _id: false })],
            default: [],
          },
        },
        { _id: false }
      ),
      default: null,
    },
    finishedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LiveGameSchema.index({ groupId: 1, status: 1 });
LiveGameSchema.index({ mentorId: 1, createdAt: -1 });
// O'quvchi o'yinlari: sinf bo'yicha faol o'yinlar va mentor kuzatuvi
LiveGameSchema.index({ grade: 1, status: 1 }, { partialFilterExpression: { studentGame: true } });
LiveGameSchema.index({ studentGame: 1, createdAt: -1 });

export const LiveGame: Model<ILiveGame> = mongoose.models.LiveGame || mongoose.model<ILiveGame>("LiveGame", LiveGameSchema);
