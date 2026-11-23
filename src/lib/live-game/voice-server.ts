// Ovozli suhbat: sayt serveri tomoni — imzolangan bilet va Cloudflare xonasiga boshqaruv xabarlari.
// Xona faqat ovozni uzatadi; kim gapira/eshita olishini sayt shu xabarlar bilan aytadi (savol boshlandi, kim javob berdi...).
// Bu fayl "use server" emas.

import mongoose from "mongoose";
import { hmacSign, signToken } from "./arena-token";
import { LIVE_GRACE_MS } from "./modes";
import { OPEN_PHASE, type VoiceControl, type VoicePhase, type VoiceTicket } from "./voice-protocol";

/** Ovozli suhbat sozlanganmi (arena bilan bir xil Worker va kalit) */
export function voiceEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ARENA_WS_URL && process.env.ARENA_SECRET);
}

let healthCache: { at: number; ok: boolean } | null = null;

/**
 * Worker'da ovoz xonasi bormi (`/health/voice`, 2 daqiqa keshlanadi). Worker hali yangilanmagan bo'lsa — panel ko'rinmaydi
 * (o'quvchi "ulanmoqda…" da osilib qolmaydi).
 */
export async function voiceRoomReady(): Promise<boolean> {
  if (!voiceEnabled()) return false;
  if (process.env.VITEST) return true;
  const now = Date.now();
  if (healthCache && now - healthCache.at < 120_000) return healthCache.ok;
  let ok = false;
  try {
    const r = await fetch(`${httpBase()}/health/voice`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    ok = r.ok && (await r.text()).trim() === "ok";
  } catch {
    ok = false;
  }
  healthCache = { at: now, ok };
  return ok;
}

const httpBase = () => (process.env.NEXT_PUBLIC_ARENA_WS_URL ?? "").replace(/\/$/, "").replace(/^ws/, "http");

/** Savol bosqichi: muddat tugashi bilan (yoki natija ochilganda) qulf ochiladi */
export function questionPhase(index: number, startedAt: Date | string | number, timeLimitSec: number): VoicePhase {
  const st = new Date(startedAt).getTime();
  return { q: index, until: st + timeLimitSec * 1000 + LIVE_GRACE_MS + 500, v: st };
}

/** O'yin holatidan joriy bosqich (bilet uchun) */
export function phaseOfGame(game: {
  status: string;
  index: number;
  questionStartedAt?: Date | string | null;
  revealedAt?: Date | string | null;
  questions?: { timeLimit: number }[];
}): VoicePhase {
  const q = game.questions?.[game.index];
  if (game.status === "question" && game.questionStartedAt && q) return questionPhase(game.index, game.questionStartedAt, q.timeLimit);
  return { ...OPEN_PHASE, v: game.revealedAt ? new Date(game.revealedAt).getTime() : 0 };
}

export async function voiceSocketUrl(gameId: string, t: Omit<VoiceTicket, "k" | "g" | "exp">): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_ARENA_WS_URL;
  const secret = process.env.ARENA_SECRET;
  if (!base || !secret || !mongoose.isValidObjectId(gameId)) return null;
  // O'yin ko'pi bilan 1 soat; uzilsa brauzer yangi bilet oladi
  const ticket: VoiceTicket = { ...t, k: "voice", g: gameId, exp: Date.now() + 75 * 60_000 };
  return `${base.replace(/\/$/, "")}/voice/${gameId}?t=${encodeURIComponent(await signToken(secret, ticket))}`;
}

/** Xonaga boshqaruv xabari (javobni kutmaydi; yetib bormasa ham savol muddati tugagach qulf o'zi ochiladi) */
export function pushVoice(msg: VoiceControl): Promise<void> {
  const secret = process.env.ARENA_SECRET;
  if (!voiceEnabled() || !secret) return Promise.resolve();
  const body = JSON.stringify(msg);
  return hmacSign(secret, body)
    .then((sig) =>
      fetch(`${httpBase()}/voice/${msg.g}/ctl`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-arena-sig": sig },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      })
    )
    .then(() => undefined)
    .catch((e) => console.error("Voice control:", e instanceof Error ? e.message : e));
}
