// Jonli o'yindagi ovozli suhbat: brauzer, sayt serveri va Cloudflare xonasi uchun umumiy qoidalar.
// Ovoz hech qayerda saqlanmaydi: xona faqat bir o'quvchidan kelgan Opus paketlarini boshqalarga uzatadi.
//
// Qoidalar (xona majburlaydi — brauzerga ishonilmaydi):
//  - Savol paytida javob bermagan o'quvchi "qulf"da: hech kimni eshitmaydi, gapirsa — faqat ustoz eshitadi.
//    Javob berganlar (va o'yindan chiqqanlar) faqat bir-biri bilan (va ustoz bilan) gaplashadi.
//  - Ustoz "hammaning mikrofonini o'chirish" qilsa — o'quvchilar gapira olmaydi (eshitishadi).
//  - Ustoz (host) hammani eshitadi (savol paytida ham), uning ovozi qulfda bo'lmaganlarga boradi.
// Bu fayl brauzer, Node va Cloudflare Worker'da ishlaydi — tashqi bog'liqlik yo'q.

export interface VoiceTicket {
  k: "voice";
  /** O'yin id */
  g: string;
  /** Foydalanuvchi id (o'quvchi) yoki "host:<mentorId>" */
  p: string;
  n: string;
  host: boolean;
  /** Bilet berilgan paytdagi holat (xona yangi ochilsa — shundan boshlanadi) */
  muted: boolean;
  phase: VoicePhase;
  /** Shu o'quvchi joriy savolga javob berganmi (yoki o'yindan chiqqanmi) */
  answered: boolean;
  exp: number;
}

/** O'yin bosqichi: savol (q — indeks, until — shu paytdan keyin xona o'zi ochadi) yoki ochiq */
export type VoicePhase = { q: number; until: number; v: number } | { q: null; until: 0; v: number };

export const OPEN_PHASE: VoicePhase = { q: null, until: 0, v: 0 };

/** Saytdan xonaga (imzo bilan) */
export type VoiceControl =
  /** free — savol boshida ham gaplasha oladiganlar (o'yindan chiqqanlar) */
  | { g: string; t: "phase"; phase: VoicePhase; free?: string[] }
  | { g: string; t: "answered"; q: number; p: string[] }
  | { g: string; t: "muted"; muted: boolean };

/** Brauzerdan xonaga (matn) */
export type VoiceClientMessage = { t: "mic"; on: boolean } | { t: "deaf"; on: boolean };

export interface VoicePeer {
  /** Xonadagi raqam (ovoz paketlarida shu) */
  s: number;
  n: string;
  host: boolean;
  mic: boolean;
  /** Savol paytida javob bermagan */
  lock: boolean;
}

/** Xonadan brauzerga (matn) */
export type VoiceServerMessage =
  | { t: "hello"; s: number }
  | { t: "roster"; muted: boolean; question: boolean; peers: VoicePeer[] };

export interface VoiceMember {
  host: boolean;
  deaf: boolean;
  /** Savol paytida javob berganmi */
  answered: boolean;
}

export interface VoiceRoomState {
  muted: boolean;
  phase: VoicePhase;
}

/** Hozir savol ketyaptimi (muddat o'tsa — xona o'zi ochiladi, sayt xabari yo'qolsa ham qulf qolib ketmaydi) */
export function questionActive(phase: VoicePhase, now: number): boolean {
  return phase.q !== null && now < phase.until;
}

/** Savol paytida qulfdami: gapira ham, eshita ham olmaydi */
export function isLocked(m: VoiceMember, s: VoiceRoomState, now: number): boolean {
  return !m.host && questionActive(s.phase, now) && !m.answered;
}

/** Gapira oladimi (savol paytida qulfdagi o'quvchi ham gapiradi — uni faqat ustoz eshitadi) */
export function maySpeak(m: VoiceMember, s: VoiceRoomState): boolean {
  return m.host || !s.muted;
}

/**
 * Tinglovchi gapiruvchini eshitadimi:
 *  - ustoz hammani eshitadi (savol paytida ham);
 *  - qulfdagi o'quvchi hech kimni eshitmaydi;
 *  - qulfdagi o'quvchining ovozi faqat ustozga boradi (o'quvchilar test paytida bir-birini eshitmaydi);
 *  - javob berganlar bir-birini va ustozni eshitadi.
 */
export function mayHear(listener: VoiceMember, speaker: VoiceMember, s: VoiceRoomState, now: number): boolean {
  if (listener.deaf) return false;
  if (listener.host) return true;
  if (isLocked(listener, s, now)) return false;
  return !isLocked(speaker, s, now);
}

/** Yangiroq bosqich ustun (sayt xabarlari tartibsiz kelishi mumkin) */
export function newerPhase(cur: VoicePhase, next: VoicePhase): boolean {
  return next.v > cur.v;
}

// ---- Ovoz paketlari ----
// Brauzer → xona: [daraja u8][n u8] + n × ([uzunlik u16 BE][Opus kadr])
// Xona → brauzer: [raqam u16 BE] + yuqoridagi. Eshitmaydiganlarga (karnay o'chiq) faqat [raqam][daraja][0] — kim gapirayotgani ko'rinsin.

export const VOICE_SAMPLE_RATE = 48000;
/** Bitta Opus kadri: 20 ms */
export const VOICE_FRAME = 960;
/** Bitta paketda nechta kadr (40 ms — kechikish va xabarlar soni o'rtasida) */
export const VOICE_FRAMES_PER_PACKET = 2;
export const VOICE_MAX_PACKET = 2000;
export const VOICE_BITRATE = 24000;

export function packFrames(level: number, frames: Uint8Array[]): Uint8Array {
  let size = 2;
  for (const f of frames) size += 2 + f.length;
  const out = new Uint8Array(size);
  out[0] = Math.max(0, Math.min(255, Math.round(level)));
  out[1] = frames.length;
  let o = 2;
  for (const f of frames) {
    out[o] = f.length >> 8;
    out[o + 1] = f.length & 255;
    out.set(f, o + 2);
    o += 2 + f.length;
  }
  return out;
}

/** Brauzerdan kelgan paketni tekshirish: buzilgan bo'lsa null */
export function validPacket(b: Uint8Array): boolean {
  if (b.length < 2 || b.length > VOICE_MAX_PACKET) return false;
  const n = b[1];
  if (n > 6) return false;
  let o = 2;
  for (let i = 0; i < n; i++) {
    if (o + 2 > b.length) return false;
    const len = (b[o] << 8) | b[o + 1];
    o += 2 + len;
    if (o > b.length) return false;
  }
  return o === b.length;
}

/** Xona: paketga gapiruvchi raqamini qo'shadi; full=false — faqat daraja (ovozsiz) */
export function relayPacket(slot: number, b: Uint8Array, full: boolean): Uint8Array {
  if (!full) return new Uint8Array([slot >> 8, slot & 255, b[0], 0]);
  const out = new Uint8Array(b.length + 2);
  out[0] = slot >> 8;
  out[1] = slot & 255;
  out.set(b, 2);
  return out;
}

export function unpackRelay(b: Uint8Array): { slot: number; level: number; frames: Uint8Array[] } | null {
  if (b.length < 4) return null;
  const slot = (b[0] << 8) | b[1];
  const level = b[2];
  const n = b[3];
  const frames: Uint8Array[] = [];
  let o = 4;
  for (let i = 0; i < n; i++) {
    if (o + 2 > b.length) return null;
    const len = (b[o] << 8) | b[o + 1];
    if (o + 2 + len > b.length) return null;
    frames.push(b.subarray(o + 2, o + 2 + len));
    o += 2 + len;
  }
  return { slot, level, frames };
}
