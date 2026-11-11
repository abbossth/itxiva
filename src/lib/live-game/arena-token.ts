// "Kiber jang" real vaqt xonasi uchun imzolangan bilet va natija imzosi (HMAC-SHA256).
// Web Crypto ishlatiladi: Vercel (Node) va Cloudflare Worker'da bir xil ishlaydi. Tashqi kutubxona yo'q.

export interface ArenaTicket {
  /** O'yin va raund (xona nomi) */
  g: string;
  r: number;
  role: "player" | "watch";
  /** O'yinchi (LiveGamePlayer) id; tomoshabinda — "watch" */
  p: string;
  n: string;
  skin: string;
  lives: number;
  maxLives: number;
  weapon: string;
  cooldown: number;
  x: number;
  y: number;
  shieldUntil: number;
  /** Jang boshlanishi va tugashi (ms) */
  st: number;
  en: number;
  /** Bilet muddati (ms) */
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Matn imzosi (base64url) */
export async function hmacSign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/** Imzoni doimiy vaqtda tekshirish (Web Crypto verify) */
export async function hmacVerify(secret: string, data: string, sig: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig) as BufferSource, enc.encode(data));
  } catch {
    return false;
  }
}

export async function signTicket(secret: string, t: ArenaTicket): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(t)));
  return `${body}.${await hmacSign(secret, body)}`;
}

/** Bilet to'g'ri, buzilmagan va muddati o'tmagan bo'lsa — mazmuni */
export async function verifyTicket(secret: string, token: string, now = Date.now()): Promise<ArenaTicket | null> {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig || !(await hmacVerify(secret, body, sig))) return null;
  try {
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body))) as ArenaTicket;
    if (typeof t.exp !== "number" || t.exp < now) return null;
    return t;
  } catch {
    return null;
  }
}
