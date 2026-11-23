// Ovozli suhbat xonasi mantig'i (Cloudflare Durable Object ichida ishlaydi, lekin transportga bog'liq emas — testlanadi).
// Xona ovozni saqlamaydi: kelgan paketni darhol ruxsati borlarga uzatadi va unutadi.

import {
  OPEN_PHASE,
  isLocked,
  mayHear,
  maySpeak,
  newerPhase,
  questionActive,
  relayPacket,
  validPacket,
  type VoiceControl,
  type VoiceMember,
  type VoicePeer,
  type VoiceRoomState,
  type VoiceTicket,
} from "./voice-protocol";

/** Ulanish bilan birga saqlanadigan ma'lumot (Durable Object uxlab qolsa ham ulanishda qoladi) */
export interface VoiceAttachment {
  s: number;
  p: string;
  n: string;
  host: boolean;
  mic: boolean;
  deaf: boolean;
}

/** Xona holati (Durable Object xotirasida saqlanadi) */
export interface VoiceStored extends VoiceRoomState {
  seq: number;
  /** Joriy savolga javob berganlar (o'quvchi id) */
  answered: string[];
}

export const MAX_VOICE_MEMBERS = 80;
/** Bitta o'quvchi soniyasiga shundan ko'p ovoz yubora olmaydi (24 kbit/s Opus ~3 KB/s) */
const BYTES_PER_SEC = 12_000;
const PACKETS_PER_SEC = 40;

export const emptyVoiceState = (): VoiceStored => ({ muted: false, phase: OPEN_PHASE, seq: 0, answered: [] });

export class VoiceRoomCore<C> {
  readonly members = new Map<C, VoiceAttachment>();
  private answered: Set<string>;
  private budget = new Map<C, { at: number; bytes: number; packets: number }>();

  constructor(public state: VoiceStored) {
    this.answered = new Set(state.answered);
  }

  /** Uyg'ongach: mavjud ulanishlar qayta tiklanadi */
  restore(c: C, a: VoiceAttachment) {
    this.members.set(c, a);
  }

  private member(a: VoiceAttachment): VoiceMember {
    return { host: a.host, deaf: a.deaf, answered: this.answered.has(a.p) };
  }

  private snapshot(): VoiceStored {
    return { ...this.state, answered: [...this.answered] };
  }

  /** Yangi ulanish. Shu foydalanuvchining eski ulanishlari (boshqa tab) qaytariladi — ular yopiladi */
  join(c: C, t: VoiceTicket): { attachment: VoiceAttachment; replaced: C[]; stored: VoiceStored } | null {
    const replaced = [...this.members].filter(([, a]) => a.p === t.p).map(([k]) => k);
    for (const k of replaced) this.leave(k);
    if (this.members.size >= MAX_VOICE_MEMBERS) return null;
    // Xona yangi ochilgan yoki saytdan xabar kechikkan bo'lsa — biletdagi holat
    if (newerPhase(this.state.phase, t.phase)) this.setPhase(t.phase);
    if (t.answered && t.phase.q !== null && t.phase.q === this.state.phase.q) this.answered.add(t.p);
    if (this.state.seq === 0 && this.members.size === 0) this.state.muted = t.muted;
    this.state.seq += 1;
    const attachment: VoiceAttachment = { s: this.state.seq, p: t.p, n: t.n.slice(0, 40), host: t.host, mic: false, deaf: false };
    this.members.set(c, attachment);
    return { attachment, replaced, stored: this.snapshot() };
  }

  leave(c: C) {
    this.members.delete(c);
    this.budget.delete(c);
  }

  private setPhase(phase: VoiceRoomState["phase"]) {
    if (phase.q !== this.state.phase.q) this.answered.clear();
    this.state.phase = phase;
  }

  /** Brauzerdan matnli xabar; o'zgargan ma'lumot (yoki null) */
  message(c: C, raw: string): VoiceAttachment | null {
    const a = this.members.get(c);
    if (!a) return null;
    let msg: { t?: unknown; on?: unknown } | null = null;
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
    const on = msg?.on === true;
    if (msg?.t === "mic" && a.mic !== on) a.mic = on;
    else if (msg?.t === "deaf" && a.deaf !== on) a.deaf = on;
    else return null;
    return a;
  }

  /** Saytdan boshqaruv (imzo tekshirilgan). Xona holati o'zgarsa — saqlash uchun qaytariladi */
  control(msg: VoiceControl): VoiceStored | null {
    if (msg.t === "muted") {
      if (this.state.muted === msg.muted) return null;
      this.state.muted = msg.muted;
    } else if (msg.t === "phase") {
      if (!newerPhase(this.state.phase, msg.phase)) return null;
      this.setPhase(msg.phase);
      for (const p of msg.free ?? []) this.answered.add(String(p));
    } else if (msg.t === "answered") {
      if (msg.q !== this.state.phase.q) return null;
      const before = this.answered.size;
      for (const p of msg.p) this.answered.add(String(p));
      if (this.answered.size === before) return null;
    } else return null;
    return this.snapshot();
  }

  /** Ovoz paketi: kimga nima yuborilishini qaytaradi (gapira olmasa yoki me'yordan oshsa — hech kimga) */
  audio(c: C, b: Uint8Array, now: number): [C, Uint8Array][] {
    const a = this.members.get(c);
    if (!a || !a.mic || !validPacket(b)) return [];
    const speaker = this.member(a);
    if (!maySpeak(speaker, this.state, now)) return [];
    const bud = this.budget.get(c);
    if (!bud || now - bud.at >= 1000) this.budget.set(c, { at: now, bytes: b.length, packets: 1 });
    else {
      bud.bytes += b.length;
      bud.packets += 1;
      if (bud.bytes > BYTES_PER_SEC || bud.packets > PACKETS_PER_SEC) return [];
    }
    const out: [C, Uint8Array][] = [];
    let full: Uint8Array | null = null;
    let level: Uint8Array | null = null;
    for (const [k, l] of this.members) {
      if (k === c) continue;
      const listener = this.member(l);
      if (mayHear(listener, speaker, this.state, now)) out.push([k, (full ??= relayPacket(a.s, b, true))]);
      // Karnayi o'chiq — ovoz emas, faqat kim gapirayotgani (qulfdagilarga hech narsa)
      else if (l.deaf && !isLocked(listener, this.state, now) && (l.host || speaker.host || !isLocked(speaker, this.state, now)))
        out.push([k, (level ??= relayPacket(a.s, b, false))]);
    }
    return out;
  }

  roster(now: number): string {
    const peers: VoicePeer[] = [...this.members.values()]
      .map((a) => ({ s: a.s, n: a.n, host: a.host, mic: a.mic && maySpeak(this.member(a), this.state, now), lock: isLocked(this.member(a), this.state, now) }))
      .sort((x, y) => x.s - y.s);
    return JSON.stringify({ t: "roster", muted: this.state.muted, question: questionActive(this.state.phase, now), peers });
  }
}
