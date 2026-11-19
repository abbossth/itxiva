// "Yashil zona" tarmog'i (brauzer).
// - Asosiy yo'l: real vaqt xonasi (WebSocket, 20 kadr/s). Uzilsa — o'zi qayta ulanadi (0,4 → 3 s), xabar kelmay qolsa
//   (2 s) "o'lik" ulanish yopiladi; internet qaytganda yoki sahifa ochilganda darhol ulanadi.
// - WebSocket ochilmasa — o'sha xonaga HTTP orqali (~8 marta/s) ulanadi: harakat va boshqalar baribir xonadan keladi.
// - Xona soati: har kadrda server vaqti keladi — telefon soati shunga moslanadi (to'lqin boshlanishi/tugashi hammada bir xil).
// - Boshqa robotlar server vaqt belgisi bo'yicha buferdan biroz orqada chiziladi (WS: 110 ms, HTTP: 300 ms) — Wi-Fi
//   kadrlarni to'p-to'p yetkazsa ham bir tekis yuradi. Kadrda bir lahza ko'rinmay qolgan robot o'chirilmaydi (3 s kutiladi).

import { decodeZoneMessage, decodeZoneObject, type ZoneClientPeer } from "@/lib/live-game/zone-room";
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
  /** Oxirgi marta ko'ringan (server vaqti) */
  seen: number;
}

export interface NetMe {
  x: number;
  y: number;
  o: number;
  seat: number;
  /** Server joyni cheklagan bo'lsa (eski HTTP yo'li) — shu yerga qaytariladi */
  correct: { x: number; y: number } | null;
}

export interface ZoneNetOptions {
  gameId: string;
  round: number;
  wsUrl: string | null;
  /** O'quvchi: o'z robot id si; proyektor — null */
  meId: string | null;
  /** Raund tugashi (server vaqti, ms) — shundan keyin qayta ulanilmaydi */
  endAt: number;
  /** Robot o'chdi (effekt uchun) */
  onOut?: (id: string, x: number, y: number) => void;
}

const WS_DELAY = 110;
const HTTP_DELAY = 300;
const FORGET_MS = 3000;

/** Telefon soati va server soati farqi: eng kam kechikkan kadrlar bo'yicha (so'nggi 60 tasi) */
class Clock {
  private samples: number[] = [];
  offset = 0;
  add(serverNow: number) {
    if (!Number.isFinite(serverNow) || serverNow <= 0) return;
    this.samples.push(serverNow - Date.now());
    if (this.samples.length > 60) this.samples.shift();
    this.offset = Math.max(...this.samples);
  }
  now() {
    return Date.now() + this.offset;
  }
}

export class ZoneNet {
  readonly peers = new Map<string, NetPeer>();
  readonly smooth = new Smoother(WS_DELAY);
  readonly clock = new Clock();
  me: NetMe | null = null;
  resolved = 0;
  total = 0;
  /** Real vaqt xonasiga WebSocket orqali ulanganmi */
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
  private relayUrl: string | null;

  constructor(private o: ZoneNetOptions) {
    this.relayUrl = (() => {
      if (!o.wsUrl) return null;
      try {
        const u = new URL(o.wsUrl);
        u.protocol = u.protocol === "wss:" ? "https:" : "http:";
        u.pathname = `${u.pathname.replace(/\/$/, "")}/relay`;
        return u.toString();
      } catch {
        return null;
      }
    })();
  }

  /** Xona (server) soatidagi hozirgi vaqt */
  now(): number {
    return this.clock.now();
  }

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

  private ended() {
    return this.now() > this.o.endAt + 3000;
  }

  private connect() {
    const url = this.o.wsUrl;
    if (!url || this.stopped || this.ended()) return;
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
      this.applyFrame(decodeZoneMessage(String(ev.data), this.roster));
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
    if (this.stopped || this.ended()) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const wait = Math.min(3000, 400 * 2 ** this.retries);
    this.retries = Math.min(this.retries + 1, 4);
    this.retryTimer = setTimeout(() => this.connect(), wait);
  }

  /** Xona kadri (WebSocket yoki HTTP zaxira): joylar server vaqt belgisi bilan buferga yoziladi */
  private applyFrame(f: ReturnType<typeof decodeZoneMessage>) {
    if (!f) return;
    this.lastData = performance.now();
    this.clock.add(f.now);
    const t = f.now || this.now();
    this.resolved = Math.max(this.resolved, f.resolved);
    for (const [id, [x, y, o, seat]] of f.peers) {
      if (id === this.o.meId) {
        this.me = { x, y, o, seat, correct: null };
        continue;
      }
      const who = this.rosterById(id);
      this.upsert(id, who?.name ?? "", who?.color ?? 0, x, y, o, seat, t);
    }
    this.total = f.peers.size;
    this.forget(t);
  }

  private rosterById(id: string): ZoneClientPeer | undefined {
    for (const r of this.roster.values()) if (r.id === id) return r;
    return undefined;
  }

  private upsert(id: string, name: string, color: number, x: number, y: number, o: number, seat: number, t: number) {
    const p = this.peers.get(id);
    if (p) {
      if (p.o === 0 && o > 0) this.o.onOut?.(id, p.x, p.y);
      p.x = x;
      p.y = y;
      p.o = o;
      p.seat = seat;
      p.seen = t;
      if (name) p.name = name;
      if (color || !p.color) p.color = color;
    } else {
      this.peers.set(id, { id, name, color, x, y, o, seat, seen: t });
    }
    this.smooth.push(id, t, x, y, 0);
  }

  /** Uzoq vaqt kadrlarda bo'lmagan robotni o'chirish (bir lahzalik yo'qolish — miltillamasin) */
  private forget(t: number) {
    const keep = new Set<string>();
    for (const [id, p] of this.peers) {
      if (t - p.seen > FORGET_MS) this.peers.delete(id);
      else keep.add(id);
    }
    this.smooth.keep(keep);
  }

  /** O'quvchi: joyni yuborish (har kadrda chaqiriladi — o'zi siyraklashtiradi) */
  send(x: number, y: number, stars: number) {
    this.pending = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, s: stars };
  }

  /** Har kadrda: yuborish, HTTP so'rovlar va "o'lik" ulanishni aniqlash */
  pump(now: number) {
    if (this.stopped) return;
    if (this.live && this.sock && now - this.lastMsg > 2000) {
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
        // O'zgarganda — 40 ms da bir, turganda — 0,5 s da bir (tezlik tekshiruvi vaqti yangilansin)
        if ((key !== this.sentKey && now - this.lastSend >= 40) || now - this.lastSend > 500) {
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
    // Zaxira: HTTP (xona bo'lsa — to'g'ridan-to'g'ri xonaga, aks holda sayt orqali)
    const gap = this.relayUrl ? 120 : 200;
    if (this.inFlight || now - this.lastHttp < gap || this.ended()) return;
    this.lastHttp = now;
    this.inFlight = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const done = () => {
      clearTimeout(timer);
      this.inFlight = false;
    };
    if (this.relayUrl) {
      // text/plain — brauzer qo'shimcha (preflight) so'rov yubormaydi
      void fetch(this.relayUrl, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(this.o.meId && this.pending ? this.pending : {}),
        signal: ctrl.signal,
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { roster?: unknown; frame?: unknown } | null) => {
          if (!d || this.live) return;
          decodeZoneObject(d.roster as never, this.roster);
          this.applyFrame(decodeZoneObject(d.frame as never, this.roster));
        })
        .catch(() => {})
        .finally(done);
      return;
    }
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
      .then((res: { success: boolean; data?: { peers: ZonePeer[]; resolved: number; out?: boolean; outWave?: number; seat?: number; total?: number; x?: number; y?: number; now?: number } | null } | null) => {
        const d = res?.success ? res.data : null;
        if (!d || this.live) return;
        this.lastData = performance.now();
        if (d.now) this.clock.add(d.now);
        const t = d.now ?? this.now();
        this.resolved = Math.max(this.resolved, d.resolved);
        for (const [id, name, x, y, color, o, seat] of d.peers) {
          if (id === this.o.meId) continue;
          this.upsert(id, name, color, x, y, o, seat, t);
        }
        this.forget(t);
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
      .finally(done);
  }

  /** Boshqa robotning ekrandagi (silliqlangan) joyi — xona soati bo'yicha */
  shown(id: string): { x: number; y: number; moving: boolean } | null {
    return this.smooth.sample(id, this.now());
  }
}
