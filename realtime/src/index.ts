// "Kiber jang" va "Yashil zona" real vaqt xonalari (Cloudflare Worker + Durable Object).
// Har jang — bitta xona (o'yin:raund). O'yinchilar WebSocket orqali ulanadi, xona soniyasiga ~15 marta hammaga kadr yuboradi,
// natijalarni (jonlar, yiqitishlar) imzo bilan Vercel'ga qaytaradi — bonuslar u yerda hisoblanadi.

import { PvpRoom } from "../../src/lib/live-game/pvp-room";
import { hmacSign, hmacVerify, verifyTicket, verifyToken, type ArenaTicket } from "../../src/lib/live-game/arena-token";
import { ZoneRoom, type ZoneTicket } from "../../src/lib/live-game/zone-room";
import type { PvpTickInput } from "../../src/lib/live-game/pvp-types";
import { VoiceRoomCore, emptyVoiceState, type VoiceAttachment, type VoiceStored } from "../../src/lib/live-game/voice-room";
import type { VoiceControl, VoiceTicket } from "../../src/lib/live-game/voice-protocol";

export interface Env {
  ARENA_ROOM: DurableObjectNamespace;
  ZONE_ROOM: DurableObjectNamespace;
  VOICE_ROOM: DurableObjectNamespace;
  ARENA_SECRET: string;
  RESULT_URL: string;
  ZONE_RESULT_URL: string;
}

const ROOM_PATH = /^\/room\/([a-f0-9]{24})\/(\d{1,3})$/;
const ZONE_PATH = /^\/zone\/([a-f0-9]{24})\/(\d{1,3})$/;
/** HTTP zaxira yo'li: WebSocket ochilmasa, o'yinchi joyini shu yerga yuboradi va kadrni oladi */
const ZONE_RELAY_PATH = /^\/zone\/([a-f0-9]{24})\/(\d{1,3})\/relay$/;
/** Ovozli suhbat: o'yin bo'yicha bitta xona; /ctl — saytdan boshqaruv (imzo bilan) */
const VOICE_PATH = /^\/voice\/([a-f0-9]{24})$/;
const VOICE_CTL_PATH = /^\/voice\/([a-f0-9]{24})\/ctl$/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "cache-control": "no-store" };
const FRAME_MS = 66;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("itxiva arena: ok");
    // Sayt "Yashil zona" xonasi bor-yo'qligini shu yerdan tekshiradi (yo'q bo'lsa — HTTP yo'li)
    if (url.pathname === "/health/zone") return new Response("ok", { headers: { "access-control-allow-origin": "*" } });
    if (url.pathname === "/health/voice") return new Response("ok", { headers: { "access-control-allow-origin": "*" } });
    const vm = url.pathname.match(VOICE_PATH) ?? url.pathname.match(VOICE_CTL_PATH);
    if (vm) {
      if (url.pathname.endsWith("/ctl") ? req.method !== "POST" : req.headers.get("Upgrade") !== "websocket") return new Response("Noto'g'ri so'rov", { status: 400 });
      return env.VOICE_ROOM.get(env.VOICE_ROOM.idFromName(vm[1])).fetch(req);
    }
    const rm = url.pathname.match(ZONE_RELAY_PATH);
    if (rm) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (req.method !== "POST") return new Response("POST kerak", { status: 405, headers: CORS });
      return env.ZONE_ROOM.get(env.ZONE_ROOM.idFromName(`${rm[1]}:${rm[2]}`)).fetch(req);
    }
    const zm = url.pathname.match(ZONE_PATH);
    if (zm) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("WebSocket kerak", { status: 426 });
      return env.ZONE_ROOM.get(env.ZONE_ROOM.idFromName(`${zm[1]}:${zm[2]}`)).fetch(req);
    }
    const m = url.pathname.match(ROOM_PATH);
    if (!m) return new Response("Topilmadi", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("WebSocket kerak", { status: 426 });
    const stub = env.ARENA_ROOM.get(env.ARENA_ROOM.idFromName(`${m[1]}:${m[2]}`));
    return stub.fetch(req);
  },
};

interface Client {
  id: string | null;
  base: { weapon: string; cooldown: number; name: string; skin: string } | null;
  sent: { pickups: number; feed: number; roster: number };
}

export class ArenaRoom implements DurableObject {
  private room: PvpRoom | null = null;
  private clients = new Map<WebSocket, Client>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSync = 0;
  private finalSent = false;

  constructor(
    private state: DurableObjectState,
    private env: Env
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(ROOM_PATH);
    const t: ArenaTicket | null = await verifyTicket(this.env.ARENA_SECRET, url.searchParams.get("t") ?? "");
    if (!m || !t || t.g !== m[1] || t.r !== Number(m[2])) return new Response("Bilet yaroqsiz", { status: 403 });
    if (!this.room || this.room.startedAt !== t.st) this.room = new PvpRoom(t.g, t.r, t.st, t.en, Math.random, t.m ?? null);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    let id: string | null = null;
    if (t.role === "player") {
      this.room.join({ p: t.p, n: t.n, skin: t.skin, weapon: t.weapon, cooldown: t.cooldown, lives: t.lives, maxLives: t.maxLives, x: t.x, y: t.y, shieldUntil: t.shieldUntil, team: t.team ?? -1 });
      id = t.p;
    }
    this.clients.set(server, {
      id,
      base: id ? { weapon: t.weapon, cooldown: t.cooldown, name: t.n, skin: t.skin } : null,
      sent: { pickups: -1, feed: -1, roster: -1 },
    });
    server.addEventListener("message", (ev) => {
      if (!id || !this.room) return;
      let msg: (PvpTickInput & { t?: string }) | null = null;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg?.t === "in") this.room.input(id, msg, Date.now());
    });
    const drop = () => this.clients.delete(server);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);
    if (!this.timer) this.timer = setInterval(() => this.tick(), FRAME_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  private tick() {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    room.step(now);
    for (const [ws, c] of this.clients) {
      try {
        if (c.sent.roster !== room.rosterVer) {
          ws.send(room.rosterMessage());
          c.sent.roster = room.rosterVer;
        }
        ws.send(room.frame(now, c.id, c.sent));
        c.sent.pickups = room.pickupsVer;
        c.sent.feed = room.feedVer;
      } catch {
        this.clients.delete(ws);
      }
    }
    room.flush();
    // Natija Vercel'ga: yiqitishda darhol, aks holda har 2 soniyada, oxirida yakuniy
    if (now >= room.startedAt && now <= room.endsAt + 1000 && (room.killsDirty || now - this.lastSync > 2000)) {
      room.killsDirty = false;
      this.lastSync = now;
      this.state.waitUntil(this.sync(false));
    }
    if (now > room.endsAt + 1000 && !this.finalSent) {
      this.finalSent = true;
      this.state.waitUntil(this.sync(true));
    }
    // Jang tugagach xona yopiladi
    if (now > room.endsAt + 20_000 || (this.clients.size === 0 && now > room.endsAt + 2000)) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      for (const ws of this.clients.keys()) {
        try {
          ws.close(1000, "Jang tugadi");
        } catch {
          // allaqachon yopilgan
        }
      }
      this.clients.clear();
    }
  }

  private async sync(final: boolean) {
    if (!this.room) return;
    const body = JSON.stringify({ ...this.room.results(), final });
    const sig = await hmacSign(this.env.ARENA_SECRET, body);
    try {
      await fetch(this.env.RESULT_URL, { method: "POST", headers: { "content-type": "application/json", "x-arena-sig": sig }, body });
    } catch {
      // keyingi sinxronlashda
    }
  }
}

// ---- "Yashil zona" ----

const ZONE_FRAME_MS = 50;

export class ZoneRoomDO implements DurableObject {
  private room: ZoneRoom | null = null;
  private clients = new Map<WebSocket, { id: string | null; roster: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSync = 0;
  private finalSent = false;

  constructor(
    private state: DurableObjectState,
    private env: Env
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const relay = url.pathname.match(ZONE_RELAY_PATH);
    const m = relay ?? url.pathname.match(ZONE_PATH);
    const t = await verifyToken<ZoneTicket>(this.env.ARENA_SECRET, url.searchParams.get("t") ?? "");
    if (!m || !t || t.k !== "zone" || t.g !== m[1] || t.r !== Number(m[2])) return new Response("Bilet yaroqsiz", { status: 403, headers: relay ? CORS : undefined });
    if (!this.room || this.room.startedAt !== t.st) {
      this.room = new ZoneRoom(t.g, t.r, t.seed, t.fin, t.st, t.en, t.res);
      this.finalSent = false;
    }
    // HTTP zaxira: joy qabul qilinadi va darhol ro'yxat + kadr qaytariladi (xona taymeri ham ishga tushadi)
    if (relay) {
      if (t.role === "player") {
        this.room.join(t);
        try {
          const body = (await req.json()) as { x?: unknown; y?: unknown; s?: unknown };
          this.room.input(t.p, body ?? {}, Date.now());
        } catch {
          // bo'sh so'rov — faqat kadr
        }
      }
      if (!this.timer) this.timer = setInterval(() => this.tick(), ZONE_FRAME_MS);
      return new Response(this.room.relayMessage(Date.now()), { headers: { ...CORS, "content-type": "application/json" } });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    let id: string | null = null;
    if (t.role === "player") {
      this.room.join(t);
      id = t.p;
    }
    this.clients.set(server, { id, roster: -1 });
    server.addEventListener("message", (ev) => {
      if (!id || !this.room) return;
      let msg: { t?: string; x?: unknown; y?: unknown; s?: unknown } | null = null;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg?.t === "in") this.room.input(id, msg, Date.now());
    });
    const drop = () => this.clients.delete(server);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);
    if (!this.timer) this.timer = setInterval(() => this.tick(), ZONE_FRAME_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  private tick() {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    room.step(now);
    const frame = room.frame(now);
    let roster: string | null = null;
    for (const [ws, c] of this.clients) {
      try {
        if (c.roster !== room.rosterVer) {
          roster ??= room.rosterMessage();
          ws.send(roster);
          c.roster = room.rosterVer;
        }
        ws.send(frame);
      } catch {
        this.clients.delete(ws);
      }
    }
    // Natija saytga: to'lqin hisoblanganda darhol, aks holda har 2 soniyada, oxirida yakuniy
    if (now >= room.startedAt && now <= room.endsAt + 1000 && (room.dirty || now - this.lastSync > 2000)) {
      room.dirty = false;
      this.lastSync = now;
      this.state.waitUntil(this.sync());
    }
    if (now > room.endsAt + 500 && !this.finalSent) {
      this.finalSent = true;
      this.state.waitUntil(this.sync());
    }
    if (now > room.endsAt + 20_000 || (this.clients.size === 0 && now > room.endsAt + 2000)) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      for (const ws of this.clients.keys()) {
        try {
          ws.close(1000, "Raund tugadi");
        } catch {
          // allaqachon yopilgan
        }
      }
      this.clients.clear();
    }
  }

  private async sync() {
    if (!this.room) return;
    const body = JSON.stringify(this.room.results());
    const sig = await hmacSign(this.env.ARENA_SECRET, body);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(this.env.ZONE_RESULT_URL, { method: "POST", headers: { "content-type": "application/json", "x-arena-sig": sig }, body });
        if (r.ok || r.status === 409) return;
      } catch {
        // qayta urinib ko'riladi
      }
    }
  }
}

// ---- Ovozli suhbat ----
// WebSocket Hibernation: hech kim gapirmasa xona uxlaydi (pul sarflanmaydi), ulanishlar uzilmaydi.
// Ovoz saqlanmaydi — kelgan paket darhol ruxsati borlarga uzatiladi.

export class VoiceRoomDO implements DurableObject {
  private core: VoiceRoomCore<WebSocket> | null = null;

  constructor(
    private state: DurableObjectState,
    private env: Env
  ) {
    state.blockConcurrencyWhile(async () => {
      const stored = (await state.storage.get<VoiceStored>("s")) ?? emptyVoiceState();
      this.core = new VoiceRoomCore<WebSocket>(stored);
      for (const ws of state.getWebSockets()) {
        const a = ws.deserializeAttachment() as VoiceAttachment | null;
        if (a) this.core.restore(ws, a);
      }
    });
  }

  private get room(): VoiceRoomCore<WebSocket> {
    return (this.core ??= new VoiceRoomCore<WebSocket>(emptyVoiceState()));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ctl = url.pathname.match(VOICE_CTL_PATH);
    if (ctl) {
      const raw = await req.text();
      const sig = req.headers.get("x-arena-sig") ?? "";
      if (!(await hmacVerify(this.env.ARENA_SECRET, raw, sig))) return new Response("Imzo noto'g'ri", { status: 401 });
      let msg: VoiceControl;
      try {
        msg = JSON.parse(raw);
      } catch {
        return new Response("Noto'g'ri", { status: 400 });
      }
      if (msg?.g !== ctl[1]) return new Response("Noto'g'ri", { status: 400 });
      const changed = this.room.control(msg);
      if (changed) {
        await this.state.storage.put("s", changed);
        this.broadcastRoster();
        await this.scheduleUnlock();
      }
      return new Response("ok");
    }

    const m = url.pathname.match(VOICE_PATH);
    const t = await verifyToken<VoiceTicket>(this.env.ARENA_SECRET, url.searchParams.get("t") ?? "");
    if (!m || !t || t.k !== "voice" || t.g !== m[1]) return new Response("Bilet yaroqsiz", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const joined = this.room.join(server, t);
    if (!joined) return new Response("Xona to'la", { status: 429 });
    this.state.acceptWebSocket(server);
    server.serializeAttachment(joined.attachment);
    await this.state.storage.put("s", joined.stored);
    for (const old of joined.replaced) {
      try {
        old.close(4000, "Boshqa oynada ochildi");
      } catch {
        // allaqachon yopilgan
      }
    }
    server.send(JSON.stringify({ t: "hello", s: joined.attachment.s }));
    this.broadcastRoster();
    await this.scheduleUnlock();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data === "string") {
      const changed = this.room.message(ws, data);
      if (changed) {
        ws.serializeAttachment(changed);
        this.broadcastRoster();
      }
      return;
    }
    for (const [to, packet] of this.room.audio(ws, new Uint8Array(data), Date.now())) {
      try {
        to.send(packet);
      } catch {
        // uzilgan — close hodisasida olib tashlanadi
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.room.leave(ws);
    this.broadcastRoster();
  }

  async webSocketError(ws: WebSocket) {
    this.room.leave(ws);
    this.broadcastRoster();
  }

  /** Savol muddati tugaganda qulf o'zi ochiladi — hammaga yangi ro'yxat */
  async alarm() {
    this.broadcastRoster();
  }

  private async scheduleUnlock() {
    const { phase } = this.room.state;
    if (phase.q !== null && phase.until > Date.now()) await this.state.storage.setAlarm(phase.until + 50);
  }

  private broadcastRoster() {
    const roster = this.room.roster(Date.now());
    for (const ws of this.room.members.keys()) {
      try {
        ws.send(roster);
      } catch {
        // uzilgan
      }
    }
  }
}
