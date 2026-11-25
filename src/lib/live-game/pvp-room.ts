// "Kiber jang" real vaqt xonasi: butun holat xotirada, o'yinchilar WebSocket orqali soniyasiga ~15–20 marta almashadi.
// Cloudflare Durable Object shu sinf ustidagi yupqa qobiq; Vercel'ga bog'liq emas (testlarda to'g'ridan-to'g'ri ishlatiladi).
// Qoidalar `pvp-server.ts` (HTTP yo'li) bilan bir xil: o'q tekkanini otgan aniqlaydi, jonni xona ayiradi.
// Xabarlar ixcham (massivlar): 25 kishilik sinfda ham Wi-Fi'ni og'irlashtirmaydi.

import { BULLET_RANGE, EMOTES, EMOTE_MS, HEART_HP, HIT_GRACE_MS, MAX_HP, MAX_REVIVES, REVIVE_GRACE_MS, REVIVE_HP, REVIVE_MS, REVIVE_R, ZONE_DAMAGE, hitDamage, MAX_PICKUPS, PICKUP_EVERY_MS, PICKUP_R, PLAYER_R, POWERS, ZONE_KILLER, freeSpot, mapOf, outsideZone, rollPower, sameTeam, zoneAt, zoneStep, type ArenaMap, type MapId, type PowerKind, type ZoneState } from "./pvp";
import type { PvpFeedView, PvpMe, PvpPeer, PvpPickup, PvpTickInput, PvpWorld } from "./pvp-types";

const POWER_LIST: PowerKind[] = ["heart", "shield", "speed", "rapid", "triple"];
type Timed = "shield" | "speed" | "rapid" | "triple";
const TIMED: Timed[] = ["shield", "speed", "rapid", "triple"];

export interface RoomJoin {
  p: string;
  n: string;
  skin: string;
  weapon: string;
  cooldown: number;
  lives: number;
  maxLives: number;
  x: number;
  y: number;
  shieldUntil: number;
  /** Jamoaviy arenada jamoa; -1 — individual */
  team?: number;
}

export interface RoomPlayer {
  id: string;
  /** Ixcham xabarlardagi raqami */
  i: number;
  name: string;
  skin: string;
  team: number;
  emote: number;
  emoteAt: number;
  weapon: string;
  cooldown: number;
  lives: number;
  maxLives: number;
  kills: number;
  hits: number;
  hitsTaken: number;
  out: boolean;
  outAt: number | null;
  killedBy: string | null;
  x: number;
  y: number;
  a: number;
  until: Record<Timed, number>;
  hitUntil: number;
  /** Zonadan tashqarida bo'lish boshlanishi / oxirgi zona zarari (0 — ichkarida) */
  zoneSince: number;
  /** Tiriltirayotgani (tugma bosib turilgan) */
  rev: { target: string; since: number } | null;
  /** Necha marta tiriltirilgan */
  revives: number;
  shots: Map<number, { x: number; y: number; a: number; at: number }>;
  used: Set<number>;
  /** Hali boshqalarga yuborilmagan o'qlar */
  fresh: { id: number; x: number; y: number; a: number; at: number }[];
  /** Shu o'yinchiga keyingi kadrda aytiladiganlar */
  accepted: number;
  claimed: PowerKind | null;
}

export interface RoomFeed {
  at: number;
  kind: "kill" | "pickup" | "revive";
  a: string;
  b?: string | null;
  power?: PowerKind | null;
}

export interface RoomResults {
  g: string;
  r: number;
  players: {
    id: string;
    lives: number;
    maxLives: number;
    kills: number;
    hits: number;
    hitsTaken: number;
    out: boolean;
    outAt: number | null;
    killedBy: string | null;
    x: number;
    y: number;
  }[];
  feed: RoomFeed[];
}

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export class PvpRoom {
  readonly players = new Map<string, RoomPlayer>();
  pickups: PvpPickup[];
  nextPickupAt: number;
  seq: number;
  feed: RoomFeed[] = [];
  /** Sovg'alar / lenta / ro'yxat o'zgarganda oshadi (faqat o'zgarganda yuboriladi) */
  pickupsVer = 1;
  feedVer = 0;
  rosterVer = 0;
  /** Yiqitish bo'ldi — natijani darhol saqlash kerak */
  killsDirty = false;
  readonly map: ArenaMap;

  constructor(
    readonly gameId: string,
    readonly round: number,
    readonly startedAt: number,
    readonly endsAt: number,
    private rng: () => number = Math.random,
    mapId?: string | null
  ) {
    this.map = mapOf(mapId);
    const [c, l, r] = this.map.pickups;
    this.pickups = [
      { id: 1, kind: "triple", x: c.x, y: c.y },
      { id: 2, kind: "shield", x: l.x, y: l.y },
      { id: 3, kind: "speed", x: r.x, y: r.y },
    ];
    this.seq = this.pickups.length;
    this.nextPickupAt = startedAt + PICKUP_EVERY_MS;
  }

  /** Ulanish (qayta ulansa — holati saqlanadi) */
  join(t: RoomJoin): RoomPlayer {
    const had = this.players.get(t.p);
    if (had) return had;
    const p: RoomPlayer = {
      id: t.p,
      i: this.players.size,
      name: t.n,
      skin: t.skin,
      team: typeof t.team === "number" ? t.team : -1,
      emote: -1,
      emoteAt: 0,
      weapon: t.weapon,
      cooldown: t.cooldown,
      lives: t.lives,
      maxLives: t.maxLives,
      kills: 0,
      hits: 0,
      hitsTaken: 0,
      out: t.lives <= 0,
      outAt: null,
      killedBy: null,
      x: t.x,
      y: t.y,
      a: Math.atan2(this.map.h / 2 - t.y, this.map.w / 2 - t.x),
      until: { shield: t.shieldUntil, speed: 0, rapid: 0, triple: 0 },
      hitUntil: 0,
      zoneSince: 0,
      rev: null,
      revives: 0,
      shots: new Map(),
      used: new Set(),
      fresh: [],
      accepted: 0,
      claimed: null,
    };
    this.players.set(t.p, p);
    this.rosterVer++;
    return p;
  }

  private pushFeed(f: RoomFeed) {
    this.feed.push(f);
    if (this.feed.length > 20) this.feed.splice(0, this.feed.length - 20);
    this.feedVer++;
  }

  /** O'yinchidan kelgan holat: joy, otilgan o'qlar, tekkizishlar, sovg'a */
  input(id: string, inp: PvpTickInput, now: number): void {
    const p = this.players.get(id);
    if (!p || p.out || now < this.startedAt || now > this.endsAt + 2000) return;
    p.x = Math.round(num(inp?.x, PLAYER_R, this.map.w - PLAYER_R, p.x));
    p.y = Math.round(num(inp?.y, PLAYER_R, this.map.h - PLAYER_R, p.y));
    p.a = num(inp?.a, -7, 7, p.a);
    // Emoji-reaksiya: tez-tez bosib "spam" qilinmasin (0,8 s da bir)
    const em = Number(inp?.em);
    if (Number.isInteger(em) && em >= 0 && em < EMOTES.length && now - p.emoteAt > 800) {
      p.emote = em;
      p.emoteAt = now;
    }

    for (const s of (Array.isArray(inp?.shots) ? inp.shots : []).slice(0, 10)) {
      if (!Number.isInteger(s?.id) || p.shots.has(s.id)) continue;
      const shot = { id: s.id, x: num(s.x, 0, this.map.w, p.x), y: num(s.y, 0, this.map.h, p.y), a: num(s.a, -7, 7, 0), at: now };
      p.shots.set(s.id, shot);
      p.fresh.push(shot);
    }
    for (const [sid, s] of p.shots) if (now - s.at > 3000) p.shots.delete(sid);

    for (const h of (Array.isArray(inp?.hits) ? inp.hits : []).slice(0, 8)) {
      const sid = Number(h?.shot);
      const shot = p.shots.get(sid);
      if (!shot || p.used.has(sid) || typeof h.target !== "string" || h.target === id) continue;
      const t = this.players.get(h.target);
      if (!t || t.out || sameTeam(p.team, t.team)) continue;
      if (Math.hypot(t.x - shot.x, t.y - shot.y) > BULLET_RANGE + 260) continue;
      p.used.add(sid);
      if (p.used.size > 500) p.used = new Set([...p.used].slice(-200));
      if (t.lives <= 0 || t.until.shield >= now || t.hitUntil >= now) continue;
      t.lives = Math.max(0, t.lives - hitDamage(p.weapon));
      t.rev = null;
      t.hitsTaken += 1;
      t.hitUntil = now + HIT_GRACE_MS;
      p.hits += 1;
      p.accepted += 1;
      if (t.lives <= 0) {
        t.out = true;
        t.outAt = now;
        t.killedBy = p.name;
        p.kills += 1;
        this.killsDirty = true;
        this.pushFeed({ at: now, kind: "kill", a: p.name, b: t.name });
      }
    }

    // ---- Tiriltirish: yiqilgan jamoadosh yonida tugma bosib turiladi ----
    const rv = typeof inp?.rv === "string" ? this.players.get(inp.rv) : null;
    if (rv && rv.out && rv.id !== p.id && sameTeam(p.team, rv.team) && rv.revives < MAX_REVIVES && Math.hypot(rv.x - p.x, rv.y - p.y) <= REVIVE_R) {
      if (p.rev?.target !== rv.id) p.rev = { target: rv.id, since: now };
      else if (now - p.rev.since >= REVIVE_MS) {
        rv.out = false;
        rv.outAt = null;
        rv.killedBy = null;
        rv.lives = REVIVE_HP;
        rv.revives += 1;
        rv.hitUntil = now + REVIVE_GRACE_MS;
        rv.zoneSince = 0;
        p.rev = null;
        this.killsDirty = true;
        this.pushFeed({ at: now, kind: "revive", a: p.name, b: rv.name });
      }
    } else p.rev = null;

    const claimId = Number(inp?.claim);
    if (Number.isInteger(claimId)) {
      const idx = this.pickups.findIndex((k) => k.id === claimId);
      const pick = idx >= 0 ? this.pickups[idx] : null;
      if (pick && Math.hypot(pick.x - p.x, pick.y - p.y) <= PICKUP_R + PLAYER_R + 50) {
        this.pickups.splice(idx, 1);
        this.pickupsVer++;
        if (pick.kind === "heart") {
          p.lives = Math.min(MAX_HP, p.lives + HEART_HP);
          p.maxLives = Math.max(p.maxLives, MAX_HP);
        } else p.until[pick.kind] = now + POWERS[pick.kind].ms;
        p.claimed = pick.kind;
        this.pushFeed({ at: now, kind: "pickup", a: p.name, power: pick.kind });
      }
    }
  }

  /** Vaqt o'tishi: yangi sovg'alar, toraluvchi zona zarari */
  step(now: number): void {
    if (now < this.startedAt || now > this.endsAt) return;
    const zone = zoneAt(this.map, this.startedAt, this.endsAt, now);
    for (const p of this.players.values()) {
      if (p.out) continue;
      const z = zoneStep(p.zoneSince, outsideZone(zone, p.x, p.y), now);
      p.zoneSince = z.since;
      if (!z.damage || p.lives <= 0) continue;
      p.lives = Math.max(0, p.lives - ZONE_DAMAGE);
      p.rev = null;
      p.hitsTaken += 1;
      if (p.lives <= 0) {
        p.out = true;
        p.outAt = now;
        p.killedBy = ZONE_KILLER;
        this.killsDirty = true;
        this.pushFeed({ at: now, kind: "kill", a: ZONE_KILLER, b: p.name });
      }
    }
    if (now >= this.nextPickupAt && this.pickups.length < MAX_PICKUPS) {
      const spot = freeSpot(this.pickups, this.rng, this.map);
      if (spot) {
        this.seq += 1;
        this.pickups.push({ id: this.seq, kind: rollPower(this.rng), x: spot.x, y: spot.y });
        this.pickupsVer++;
      }
      this.nextPickupAt = now + PICKUP_EVERY_MS;
    }
  }

  alive(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.out) n++;
    return n;
  }

  /** Vercel'ga saqlash uchun */
  results(): RoomResults {
    return {
      g: this.gameId,
      r: this.round,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        lives: p.lives,
        maxLives: p.maxLives,
        kills: p.kills,
        hits: p.hits,
        hitsTaken: p.hitsTaken,
        out: p.out,
        outAt: p.outAt,
        killedBy: p.killedBy,
        x: p.x,
        y: p.y,
      })),
      feed: this.feed,
    };
  }

  // ---- Ixcham xabarlar ----

  /** O'yinchilar ro'yxati (ism, qahramon) — faqat o'zgarganda */
  rosterMessage(): string {
    return JSON.stringify({ t: "r", v: this.rosterVer, l: [...this.players.values()].map((p) => [p.i, p.id, p.name, p.skin, p.team]) });
  }

  /** Kadr: barcha o'yinchilar holati, yangi o'qlar, (o'zgargan bo'lsa) sovg'alar va lenta, o'z holati */
  frame(now: number, forId: string | null, sent: { pickups: number; feed: number }): string {
    // Kimni hozir tiriltirishyapti (eng katta ulush)
    const reviving = new Map<string, number>();
    for (const p of this.players.values()) {
      if (!p.rev || p.out) continue;
      const pct = Math.min(99, Math.round(((now - p.rev.since) / REVIVE_MS) * 100));
      reviving.set(p.rev.target, Math.max(reviving.get(p.rev.target) ?? 0, pct));
    }
    const peers = [...this.players.values()].map((p) => {
      let flags = (p.out ? 1 : 0) | (p.until.shield > now ? 2 : 0);
      TIMED.forEach((k, j) => {
        if (k !== "shield" && p.until[k] > now) flags |= 4 << j;
      });
      const emote = p.emote >= 0 && now - p.emoteAt < EMOTE_MS ? p.emote : -1;
      return [p.i, p.x, p.y, Math.round(p.a * 100), p.lives, p.maxLives, flags, p.kills, emote, reviving.get(p.id) ?? 0];
    });
    const shots: number[][] = [];
    for (const p of this.players.values()) if (p.id !== forId) for (const s of p.fresh) shots.push([p.i, s.id, Math.round(s.x), Math.round(s.y), Math.round(s.a * 1000), now - s.at]);
    const msg: Record<string, unknown> = {
      t: "f",
      n: now,
      mp: this.map.id,
      s: Math.max(0, this.startedAt - now),
      e: Math.max(0, this.endsAt - now),
      p: peers,
    };
    if (now >= this.startedAt) {
      const z = zoneAt(this.map, this.startedAt, this.endsAt, now);
      msg.z = [Math.round(z.x), Math.round(z.y), Math.round(z.r), Math.round(z.tx), Math.round(z.ty), Math.round(z.tr), z.shrinking ? 1 : 0, z.nextMs];
    }
    if (shots.length > 0) msg.h = shots;
    if (sent.pickups !== this.pickupsVer) msg.k = this.pickups.map((k) => [k.id, POWER_LIST.indexOf(k.kind), k.x, k.y]);
    if (sent.feed !== this.feedVer) msg.f = this.feed.slice(-8).map((f) => [f.at, f.kind === "kill" ? 0 : f.kind === "revive" ? 2 : 1, f.a, f.b ?? null, f.power ? POWER_LIST.indexOf(f.power) : -1]);
    const me = forId ? this.players.get(forId) : null;
    if (me) {
      msg.m = [me.lives, me.maxLives, me.out ? 1 : 0, me.kills, me.hits, ...TIMED.map((k) => Math.max(0, me.until[k] - now)), me.killedBy];
      if (me.accepted) msg.ac = me.accepted;
      if (me.claimed) msg.cl = POWER_LIST.indexOf(me.claimed);
    }
    return JSON.stringify(msg);
  }

  /** Kadr hammaga yuborilgach: yangi o'qlar va shaxsiy xabarlar tozalanadi */
  flush(): void {
    for (const p of this.players.values()) {
      p.fresh = [];
      p.accepted = 0;
      p.claimed = null;
    }
  }
}

// ---- Brauzer tomoni: ixcham xabarni oddiy ko'rinishga aylantirish ----

export interface RoomClientState {
  roster: Map<number, { id: string; name: string; skin: string; team: number; cooldown?: number }>;
  pickups: PvpPickup[];
  feed: PvpFeedView[];
  feedRaw: [number, number, string, string | null, number][];
}

export const newClientState = (): RoomClientState => ({ roster: new Map(), pickups: [], feed: [], feedRaw: [] });

export interface DecodedFrame {
  world: PvpWorld;
  me: PvpMe | null;
  accepted: number;
  claimed: PowerKind | null;
}

/** Xabarni qo'llash: ro'yxat bo'lsa — eslab qoladi (null qaytadi), kadr bo'lsa — dunyo */
export function decodeRoomMessage(
  raw: string,
  st: RoomClientState,
  meId: string | null,
  meBase: { weapon: string; cooldown: number; name: string; skin: string } | null
): DecodedFrame | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (m.t === "r") {
    st.roster = new Map((m.l as [number, string, string, string, number?][]).map(([i, id, name, skin, team]) => [i, { id, name, skin, team: typeof team === "number" ? team : -1 }]));
    return null;
  }
  if (m.t !== "f") return null;
  const now = Number(m.n);
  if (m.k) st.pickups = (m.k as number[][]).map(([id, kind, x, y]) => ({ id, kind: POWER_LIST[kind] ?? "heart", x, y }));
  if (m.f) st.feedRaw = m.f as RoomClientState["feedRaw"];
  st.feed = [...st.feedRaw]
    .reverse()
    .map(([at, kind, a, b, power]) => ({ key: `${at}:${kind}:${a}:${b ?? power}`, kind: kind === 0 ? ("kill" as const) : kind === 2 ? ("revive" as const) : ("pickup" as const), a, b, power: power >= 0 ? POWER_LIST[power] : null, ago: now - at }));
  const shotsBy = new Map<number, PvpPeer["shots"]>();
  for (const [i, id, x, y, a, age] of (m.h as number[][] | undefined) ?? []) {
    const list = shotsBy.get(i) ?? [];
    list.push({ id, x, y, a: a / 1000, age });
    shotsBy.set(i, list);
  }
  const peers: PvpPeer[] = [];
  for (const [i, x, y, a, lives, maxLives, flags, kills, emote, revive] of m.p as number[][]) {
    const r = st.roster.get(i);
    if (!r) continue;
    const powers: PowerKind[] = [];
    TIMED.forEach((k, j) => {
      if (k === "shield" ? flags & 2 : flags & (4 << j)) powers.push(k);
    });
    peers.push({
      id: r.id,
      name: r.name,
      skin: r.skin,
      x,
      y,
      a: a / 100,
      lives,
      maxLives,
      out: Boolean(flags & 1),
      kills,
      shield: Boolean(flags & 2),
      powers,
      shots: shotsBy.get(i) ?? [],
      isMe: r.id === meId,
      team: r.team,
      emote: typeof emote === "number" ? emote : -1,
      revive: typeof revive === "number" ? revive : 0,
    });
  }
  const world: PvpWorld = {
    startsInMs: Number(m.s) || 0,
    remainingMs: Number(m.e) || 0,
    ended: false,
    peers,
    pickups: st.pickups,
    feed: st.feed,
    alive: peers.filter((p) => !p.out).length,
    total: peers.length,
    map: (typeof m.mp === "string" ? m.mp : "neon") as MapId,
    zone: zoneOfMsg(m.z),
  };
  let me: PvpMe | null = null;
  const mm = m.m as (number | string | null)[] | undefined;
  const mine = peers.find((p) => p.isMe);
  if (mm && meId && meBase) {
    const [lives, maxLives, out, kills, hits, shield, speed, rapid, triple, killedBy] = mm;
    me = {
      id: meId,
      name: meBase.name,
      skin: meBase.skin,
      weapon: meBase.weapon,
      cooldown: meBase.cooldown,
      lives: Number(lives),
      maxLives: Number(maxLives),
      out: Boolean(out),
      killedBy: (killedBy as string | null) ?? null,
      kills: Number(kills),
      hits: Number(hits),
      x: mine?.x ?? 0,
      y: mine?.y ?? 0,
      powers: { shield: Number(shield), speed: Number(speed), rapid: Number(rapid), triple: Number(triple) },
      points: 0,
      place: 0,
    };
  }
  return { world, me, accepted: Number(m.ac) || 0, claimed: typeof m.cl === "number" ? POWER_LIST[m.cl] ?? null : null };
}

function zoneOfMsg(z: unknown): ZoneState | null {
  if (!Array.isArray(z) || z.length < 8) return null;
  const [x, y, r, tx, ty, tr, sh, nextMs] = z.map(Number);
  return { x, y, r, tx, ty, tr, shrinking: sh === 1, nextMs };
}
