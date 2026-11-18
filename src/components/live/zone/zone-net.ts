// "Yashil zona" tarmog'i (brauzer): real vaqt xonasi (WebSocket, ~15 kadr/s) yoki HTTP yo'li (~5 marta/s).
// - Uzilsa — o'zi qayta ulanadi (kutish 0,4 → 3 s), xabar kelmay qolsa (2,5 s) "o'lik" ulanish yopilib qayta ochiladi;
//   internet qaytganda yoki sahifa qayta ko'ringanda darhol ulanadi.
// - Ulanish yo'q paytda HTTP so'rovlari bilan davom etadi (hech bo'lmasa boshqalarni ko'rsatish uchun).
// - Boshqa robotlar buferdan biroz orqada (WS: 110 ms, HTTP: 320 ms) chiziladi va kadrlar orasi to'ldiriladi —
//   tarmoq notekis bo'lsa ham sakramaydi.

import { decodeZoneMessage, type ZoneClientPeer } from "@/lib/live-game/zone-room";
import type { ZonePeer } from "@/lib/live-game/zone";
import { Smoother } from "../arena/interp";

export interface NetPeer {
  id: string;
  name: string;
  color: number;
  /** Oxirgi ma'lum joy (server) */
  x: number;
  y: number;
  /** outWave+1 (0 — tirik) */
  o: number;
  seat: number;
}

export interface NetMe {
  x: number;
  y: number;
  o: number;
  seat: number;
  /** Server joyni cheklagan bo'lsa (HTTP) — shu yerga qaytariladi */
  correct: { x: number; y: number } | null;
}

export interface ZoneNetOptions {
  gameId: string;
  round: number;
  wsUrl: string | null;
  /** O'quvchi: o'z robot id si; proyektor — null */
  meId: string | null;
  /** Raund tugashi (performance.now bo'yicha) — shundan keyin qayta ulanilmaydi */
  endAt: number;
  /** Robot o'chdi (effekt uchun) */
  onOut?: (id: string, x: number, y: number) => void;
}

const WS_DELAY = 110;
const HTTP_DELAY = 320;

export class ZoneNet {
  readonly peers = new Map<string, NetPeer>();
  readonly smooth = new Smoother(HTTP_DELAY);
  me: NetMe | null = null;
  resolved = 0;
  total = 0;
  /** Real vaqt xonasiga ulanganmi */
  live = false;
  /** Oxirgi muvaffaqiyatli ma'lumot vaqti (performance.now) */
  lastData = 0;

  private sock: WebSocket | null = null;
  private roster = new Map<number, ZoneClientPeer>();
  private stopped = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private lastHttp = 0;
  private lastSend = 0;
  private lastMsg = 0;
  private pending: { x: number; y: number; s: number } | null = null;
  private sentKey = "";

  constructor(private o: ZoneNetOptions) {}

  start() {
    this.connect();
    window.addEventListener("online", this.wake);
    document.addEventListener("visibilitychange", this.wake);
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    window.removeEventListener("online", this.wake);
    document.removeEventListener("visibilitychange", this.wake);
    try {
      this.sock?.close(1000);
    } catch {
      // yopilgan
    }
    this.sock = null;
  }

  private wake = () => {
    if (document.visibilityState === "hidden" || this.stopped) return;
    if (!this.live && this.o.wsUrl) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retries = 0;
      this.connect();
    }
  };

  private connect() {
    const url = this.o.wsUrl;
    if (!url || this.stopped || performance.now() > this.o.endAt + 3000) return;
    try {
      this.sock?.close();
    } catch {
      // yopilgan
    }
    let opened = false;
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      this.retry();
      return;
    }
    this.sock = sock;
    const fail = setTimeout(() => {
      if (!opened) sock.close();
    }, 4000);
    sock.onopen = () => {
      opened = true;
      clearTimeout(fail);
      this.live = true;
      this.retries = 0;
      this.lastMsg = performance.now();
      this.smooth.setDelay(WS_DELAY);
      this.sentKey = "";
    };
    sock.onmessage = (ev) => {
      this.lastMsg = performance.now();
      const f = decodeZoneMessage(String(ev.data), this.roster);
      if (!f) return;
      this.lastData = this.lastMsg;
      this.resolved = Math.max(this.resolved, f.resolved);
      const seen = new Set<string>();
      for (const [id, [x, y, o, seat]] of f.peers) {
        if (id === this.o.meId) {
          this.me = { x, y, o, seat, correct: null };
          continue;
        }
        const who = [...this.roster.values()].find((r) => r.id === id);
        this.upsert(id, who?.name ?? "", who?.color ?? 0, x, y, o, seat);
        seen.add(id);
      }
      this.total = f.peers.size;
      this.prune(seen);
    };
    sock.onclose = () => {
      clearTimeout(fail);
      if (this.sock === sock) {
        this.sock = null;
        this.live = false;
        this.smooth.setDelay(HTTP_DELAY);
      }
      if (!this.stopped) this.retry();
    };
    sock.onerror = () => {
      try {
        sock.close();
      } catch {
        // yopilgan
      }
    };
  }

  private retry() {
    if (this.stopped || performance.now() > this.o.endAt + 3000) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const wait = Math.min(3000, 400 * 2 ** this.retries);
    this.retries = Math.min(this.retries + 1, 4);
    this.retryTimer = setTimeout(() => this.connect(), wait);
  }

  private upsert(id: string, name: string, color: number, x: number, y: number, o: number, seat: number) {
    const p = this.peers.get(id);
    if (p) {
      if (p.o === 0 && o > 0) this.o.onOut?.(id, p.x, p.y);
      p.x = x;
      p.y = y;
      p.o = o;
      p.seat = seat;
      if (name) p.name = name;
    } else {
      this.peers.set(id, { id, name, color, x, y, o, seat });
    }
    this.smooth.push(id, performance.now(), x, y, 0);
  }

  private prune(seen: Set<string>) {
    for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.peers.delete(id);
    this.smooth.keep(seen);
  }

  /** O'quvchi: joyni yuborish (har kadrda chaqiriladi — o'zi siyraklashtiradi) */
  send(x: number, y: number, stars: number) {
    this.pending = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, s: stars };
  }

  /** Har kadrda: yuborish, HTTP so'rovlar va "o'lik" ulanishni aniqlash */
  pump(now: number) {
    if (this.stopped) return;
    if (this.live && this.sock && now - this.lastMsg > 2500) {
      // Xabar kelmayapti — ulanish osilib qolgan
      try {
        this.sock.close();
      } catch {
        // yopilgan
      }
      return;
    }
    if (this.live && this.sock) {
      const p = this.pending;
      if (p && this.o.meId) {
        const key = `${p.x}:${p.y}:${p.s}`;
        // O'zgarganda — 50 ms da bir, turganda — 0,5 s da bir (tezlik tekshiruvi vaqti yangilansin)
        if ((key !== this.sentKey && now - this.lastSend >= 50) || now - this.lastSend > 500) {
          this.lastSend = now;
          this.sentKey = key;
          try {
            this.sock.send(JSON.stringify({ t: "in", x: p.x, y: p.y, s: p.s }));
          } catch {
            // keyingi kadrda
          }
        }
      }
      return;
    }
    // HTTP yo'li (yoki xonaga ulanish yo'q paytda)
    if (this.inFlight || now - this.lastHttp < 200 || now > this.o.endAt + 2500) return;
    this.lastHttp = now;
    this.inFlight = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const req = this.o.meId
      ? fetch("/api/live/zone", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameId: this.o.gameId, round: this.o.round, x: this.pending?.x, y: this.pending?.y, stars: this.pending?.s ?? 0 }),
          signal: ctrl.signal,
        })
      : fetch(`/api/live/zone?gameId=${encodeURIComponent(this.o.gameId)}`, { signal: ctrl.signal, cache: "no-store" });
    const sent = this.pending ? { ...this.pending } : null;
    void req
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { success: boolean; data?: { peers: ZonePeer[]; resolved: number; out?: boolean; outWave?: number; seat?: number; total?: number; x?: number; y?: number } | null } | null) => {
        const d = res?.success ? res.data : null;
        if (!d || this.live) return;
        this.lastData = performance.now();
        this.resolved = Math.max(this.resolved, d.resolved);
        const seen = new Set<string>();
        for (const [id, name, x, y, color, o, seat] of d.peers) {
          if (id === this.o.meId) continue;
          this.upsert(id, name, color, x, y, o, seat);
          seen.add(id);
        }
        this.prune(seen);
        if (this.o.meId && typeof d.x === "number" && typeof d.y === "number") {
          // Server joyni cheklagan bo'lsa (yuborilgan joydan farq qiladi) — tuzatiladi
          const off = sent ? Math.hypot(d.x - sent.x, d.y - sent.y) > 1.5 : false;
          this.me = { x: d.x, y: d.y, o: d.out ? (d.outWave ?? 0) + 1 : 0, seat: d.seat ?? 0, correct: off ? { x: d.x, y: d.y } : null };
          this.total = d.total ?? this.peers.size + 1;
        } else {
          this.total = this.peers.size;
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        this.inFlight = false;
      });
  }

  /** Boshqa robotning ekrandagi (silliqlangan) joyi */
  shown(id: string, now: number): { x: number; y: number; moving: boolean } | null {
    return this.smooth.sample(id, now);
  }
}
