// "Yashil zona" real vaqt xonasi: butun holat xotirada, robotlar WebSocket orqali soniyasiga ~15 marta almashadi.
// Cloudflare Durable Object (realtime/src/index.ts) shu sinf ustidagi yupqa qobiq; testlarda to'g'ridan-to'g'ri ishlatiladi.
// Qoidalar `zone.ts` dagi umumiy funksiyalar (HTTP yo'li — `zone-server.ts` bilan bir xil): tezlik cheklanadi,
// zona yopiq paytda yurib bo'lmaydi, joyni birinchi kirgan oladi, to'lqin natijasini xona hisoblaydi.
// Xabarlar ixcham (massivlar): 30 kishilik sinfda ham Wi-Fi'ni og'irlashtirmaydi.

import {
  MAX_STARS,
  ROOM_GRACE_MS,
  ROOM_RESOLVE_MS,
  STARS_PER_WAVE,
  LOCK_MS,
  WAVE_MS,
  NO_SEAT,
  aliveAt,
  cappedMove,
  claimSeat,
  maxStep,
  seatCode,
  waveEndAt,
  zoneEliminated,
  zoneIndexAt,
  zoneSeats,
  zoneWave,
  zoneWaveCount,
  type ZoneSeat,
  type ZoneWave,
} from "./zone";

/** Xonaga ulanish bileti (imzolangan). k — xona turi (arena biletlari bilan adashmasin) */
export interface ZoneTicket {
  k: "zone";
  g: string;
  r: number;
  role: "player" | "watch";
  /** O'yinchi (LiveGamePlayer) id; tomoshabinda — "watch" */
  p: string;
  n: string;
  /** Rang, tezlik, joy */
  c: number;
  sp: number;
  x: number;
  y: number;
  /** O'chgan to'lqin + 1 (0 — tirik) va yulduzlar */
  o: number;
  s: number;
  seed: number;
  fin: boolean;
  /** Raund boshlanishi va tugashi (ms), bilet paytidagi hisoblangan to'lqinlar */
  st: number;
  en: number;
  res: number;
  exp: number;
}

export interface ZoneRoomPlayer {
  id: string;
  i: number;
  name: string;
  color: number;
  speed: number;
  x: number;
  y: number;
  /** Oxirgi qabul qilingan harakat vaqti (tezlik tekshiruvi) */
  at: number;
  out: boolean;
  outWave: number;
  stars: number;
  seat: ZoneSeat;
}

export interface ZoneRoomResults {
  g: string;
  r: number;
  resolved: number;
  players: { id: string; x: number; y: number; out: boolean; outWave: number; stars: number; seatWave: number; seatZone: number; seatAt: number }[];
}

const SPAN = WAVE_MS + LOCK_MS;

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export class ZoneRoom {
  readonly players = new Map<string, ZoneRoomPlayer>();
  resolved: number;
  readonly waves: number;
  /** Ro'yxat o'zgarganda oshadi (faqat o'zgarganda yuboriladi) */
  rosterVer = 0;
  /** Natija o'zgardi — darhol saqlash kerak */
  dirty = false;
  private layouts = new Map<number, ZoneWave>();

  constructor(
    readonly gameId: string,
    readonly round: number,
    readonly seed: number,
    readonly final: boolean,
    readonly startedAt: number,
    readonly endsAt: number,
    resolved = 0
  ) {
    this.waves = zoneWaveCount(final);
    this.resolved = Math.max(0, Math.min(this.waves, resolved));
  }

  /** w-to'lqin xaritasi (oldingisi hisoblangach — o'zgarmaydi, keshlanadi) */
  layout(w: number): ZoneWave {
    const c = this.layouts.get(w);
    if (c) return c;
    const outs: number[] = [];
    for (const p of this.players.values()) outs.push(p.out ? p.outWave : -1);
    const l = zoneWave(this.seed, this.final, w, aliveAt(outs, w));
    if (w <= this.resolved) this.layouts.set(w, l);
    return l;
  }

  /** Ulanish (qayta ulansa — holati saqlanadi). Kech ulangan (bilet bergan paytdan keyin to'lqin o'tib ketgan) — o'chgan */
  join(t: Pick<ZoneTicket, "p" | "n" | "c" | "sp" | "x" | "y" | "o" | "s" | "res">): ZoneRoomPlayer {
    const had = this.players.get(t.p);
    if (had) return had;
    let outWave = t.o > 0 ? t.o - 1 : -1;
    if (outWave < 0 && this.resolved > Math.max(0, t.res)) outWave = Math.max(0, t.res);
    const p: ZoneRoomPlayer = {
      id: t.p,
      i: this.players.size,
      name: String(t.n ?? "").slice(0, 40),
      color: Math.max(0, Math.floor(Number(t.c) || 0)),
      speed: num(t.sp, 5, 40, 15),
      x: num(t.x, 0, 100, 50),
      y: num(t.y, 0, 62, 31),
      at: 0,
      out: outWave >= 0,
      outWave,
      stars: num(t.s, 0, MAX_STARS, 0),
      seat: NO_SEAT,
    };
    this.players.set(t.p, p);
    this.rosterVer++;
    return p;
  }

  /** Hozir yurish mumkin bo'lgan to'lqin (-1 — mumkin emas) */
  private movingWave(now: number): number {
    if (now < this.startedAt) return -1;
    const w = Math.floor((now - this.startedAt) / SPAN);
    if (w >= this.waves || w < this.resolved) return -1;
    const within = now - (this.startedAt + w * SPAN);
    if (within <= WAVE_MS + ROOM_GRACE_MS) return w;
    return -1;
  }

  /** O'yinchidan kelgan joy va yulduzlar */
  input(id: string, inp: { x?: unknown; y?: unknown; s?: unknown }, now: number): void {
    this.step(now);
    const p = this.players.get(id);
    if (!p || p.out) return;
    const w = this.movingWave(now);
    if (w < 0) {
      p.at = now;
      return;
    }
    const want = { x: num(inp?.x, 0, 100, p.x), y: num(inp?.y, 0, 62, p.y) };
    const next = cappedMove(p.x, p.y, want.x, want.y, maxStep(p.speed, p.at ? now - p.at : 250));
    p.x = next.x;
    p.y = next.y;
    p.at = now;
    p.seat = claimSeat(p.seat, w, zoneIndexAt(p.x, p.y, this.layout(w)), now);
    const stars = Math.floor(num(inp?.s, 0, Math.min(MAX_STARS, (w + 1) * STARS_PER_WAVE), p.stars));
    if (stars > p.stars) p.stars = stars;
  }

  /** Vaqti kelgan to'lqinlar natijasi. Qaytaradi: shu qadamda o'chganlar */
  step(now: number): string[] {
    const gone: string[] = [];
    while (this.resolved < this.waves && now >= waveEndAt(this.startedAt, this.resolved) + ROOM_RESOLVE_MS) {
      const w = this.resolved;
      const lay = this.layout(w);
      const list = [...this.players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, out: p.out, seat: p.seat }));
      for (const id of zoneEliminated(w, lay, list)) {
        const p = this.players.get(id);
        if (!p) continue;
        p.out = true;
        p.outWave = w;
        gone.push(id);
      }
      this.resolved = w + 1;
      // Keyingi to'lqin xaritasi endi aniq (tiriklar soni ma'lum)
      this.layouts.delete(w + 1);
      this.dirty = true;
    }
    return gone;
  }

  /** Ekrandagi to'lqin (vaqt bo'yicha) */
  shownWave(now: number): number {
    if (now < this.startedAt) return -1;
    return Math.min(this.waves - 1, Math.floor((now - this.startedAt) / SPAN));
  }

  rosterMessage(): string {
    return JSON.stringify({ t: "r", p: [...this.players.values()].map((p) => [p.i, p.id, p.name, p.color]) });
  }

  /** Kadr: [raqam, x×10, y×10, outWave+1, joy] */
  frame(now: number): string {
    const w = this.shownWave(now);
    const seats = w >= 0 ? zoneSeats(w, this.layout(w), [...this.players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, out: p.out, seat: p.seat }))) : null;
    const p = [...this.players.values()].map((q) => [q.i, Math.round(q.x * 10), Math.round(q.y * 10), q.out ? q.outWave + 1 : 0, seats ? seatCode(seats.get(q.id)) : 0]);
    return JSON.stringify({ t: "f", n: now, r: this.resolved, p });
  }

  results(): ZoneRoomResults {
    return {
      g: this.gameId,
      r: this.round,
      resolved: this.resolved,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        out: p.out,
        outWave: p.outWave,
        stars: p.stars,
        seatWave: p.seat.wave,
        seatZone: p.seat.zone,
        seatAt: p.seat.at,
      })),
    };
  }
}

/** Brauzer tomoni: xona xabarlaridan ro'yxat va kadrlarni yig'ish */
export interface ZoneClientPeer {
  id: string;
  name: string;
  color: number;
}

export interface ZoneRoomFrame {
  now: number;
  resolved: number;
  /** id → [x, y, outWave+1, joy] */
  peers: Map<string, [number, number, number, number]>;
}

export function decodeZoneMessage(raw: string, roster: Map<number, ZoneClientPeer>): ZoneRoomFrame | null {
  let m: { t?: string; n?: number; r?: number; p?: unknown[] } | null = null;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || !Array.isArray(m.p)) return null;
  if (m.t === "r") {
    for (const row of m.p as [number, string, string, number][]) roster.set(row[0], { id: row[1], name: row[2], color: row[3] });
    return null;
  }
  if (m.t !== "f") return null;
  const peers = new Map<string, [number, number, number, number]>();
  for (const row of m.p as [number, number, number, number, number][]) {
    const who = roster.get(row[0]);
    if (who) peers.set(who.id, [row[1] / 10, row[2] / 10, row[3], row[4]]);
  }
  return { now: Number(m.n) || 0, resolved: Number(m.r) || 0, peers };
}
