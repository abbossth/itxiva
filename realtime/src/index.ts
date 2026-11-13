// "Kiber jang" real vaqt xonasi (Cloudflare Worker + Durable Object).
// Har jang — bitta xona (o'yin:raund). O'yinchilar WebSocket orqali ulanadi, xona soniyasiga ~15 marta hammaga kadr yuboradi,
// natijalarni (jonlar, yiqitishlar) imzo bilan Vercel'ga qaytaradi — bonuslar u yerda hisoblanadi.

import { PvpRoom } from "../../src/lib/live-game/pvp-room";
import { hmacSign, verifyTicket, type ArenaTicket } from "../../src/lib/live-game/arena-token";
import type { PvpTickInput } from "../../src/lib/live-game/pvp-types";

export interface Env {
  ARENA_ROOM: DurableObjectNamespace;
  ARENA_SECRET: string;
  RESULT_URL: string;
}

const ROOM_PATH = /^\/room\/([a-f0-9]{24})\/(\d{1,3})$/;
const FRAME_MS = 66;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("itxiva arena: ok");
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
    if (!this.room || this.room.startedAt !== t.st) this.room = new PvpRoom(t.g, t.r, t.st, t.en);

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
