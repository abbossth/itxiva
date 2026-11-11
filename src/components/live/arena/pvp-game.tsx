"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Eye, Skull, Users } from "lucide-react";
import type { PvpFeedView, PvpMe, PvpTickInput, PvpTickResult, PvpWorld } from "@/lib/live-game/pvp-types";
import { decodeRoomMessage, newClientState } from "@/lib/live-game/pvp-room";
import { Smoother } from "./interp";
import {
  BASE_SPEED,
  BULLET_RANGE,
  BULLET_SPEED,
  MAP_H,
  MAP_W,
  PICKUP_R,
  PLAYER_R,
  POWERS,
  PVP_WALLS,
  fireShots,
  inBush,
  nearestTarget,
  resolve,
  skinOf,
  stepShots,
  teleportFrom,
  type PowerKind,
  type Shot,
} from "@/lib/live-game/pvp";
import { playBoom, playCorrectSound, playHurt, playShot, unlockSound } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  burst,
  colorFor,
  drawFloor,
  drawPickup,
  drawRobot,
  drawShot,
  drawTop,
  makeMapLayers,
  drawSparks,
  nameTag,
  spawnForeignShots,
  stepSparks,
  type Spark,
} from "./pvp-draw";

// "Kiber jang": hamma hammaga qarshi. Kompyuter: WASD/strelkalar + sichqoncha (nishon va otish, Space ham).
// Telefon/planshet: chap tomonda joystik, o'ng tomonni bosib turing — eng yaqin raqibga avtomatik nishon bilan otadi.

const TICK_MS = 200;
/** Real vaqt xonasiga yuborish oralig'i */
const WS_TICK_MS = 66;

type ApiResult<T> = { success: true; data: T } | { success: false; error: string };

/** Tezkor API (server action emas: navbatda kutmaydi, deploydan keyin ham ishlaydi). Osilib qolgan so'rov 2,5 s da bekor qilinadi */
export async function pvpFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(url, { ...init, cache: "no-store", signal: ctrl.signal });
    return (await r.json()) as ApiResult<T>;
  } finally {
    clearTimeout(t);
  }
}

const sendTick = (gameId: string, input: PvpTickInput) =>
  pvpFetch<PvpTickResult>("/api/live/pvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId, input }) });
/** Butadagi raqib shu masofadan yaqin bo'lsagina ko'rinadi */
const BUSH_SEE = 170;

interface Hud {
  lives: number;
  maxLives: number;
  kills: number;
  alive: number;
  total: number;
  left: number;
  powers: { kind: PowerKind; s: number }[];
  feed: PvpFeedView[];
  out: boolean;
  killedBy: string | null;
  spectating: string | null;
}

export function PvpGame({
  gameId,
  myName,
  init,
  startsInMs,
  remainingMs,
  sound = true,
  ws: wsUrl = null,
}: {
  gameId: string;
  myName: string;
  init: { lives: number; maxLives: number; skin: string; weapon: string; cooldown: number; playerId: string };
  /** Real vaqt xonasi manzili (bo'lmasa — HTTP so'rovlar) */
  ws?: string | null;
  startsInMs: number;
  remainingMs: number;
  sound?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({
    lives: init.lives,
    maxLives: init.maxLives,
    kills: 0,
    alive: 0,
    total: 0,
    left: Math.ceil(remainingMs / 1000),
    powers: [],
    feed: [],
    out: false,
    killedBy: null,
    spectating: null,
  });
  const [phase, setPhase] = useState<"intro" | "play" | "done">(startsInMs > 0 ? "intro" : "play");
  const [intro, setIntro] = useState(Math.ceil(startsInMs / 1000));
  const [banner, setBanner] = useState<{ text: string; tone: "kill" | "power" | "hurt" } | null>(null);
  const [touch, setTouch] = useState(false);

  const timing = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => {
    const now = performance.now();
    timing.current = { start: now + startsInMs, end: now + startsInMs + remainingMs };
    // Faqat birinchi qiymatlar — keyingi so'rovlar o'yinni qaytadan boshlamasin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layers = makeMapLayers();
    // ---- Holat ----
    let meId = "";
    let me: PvpMe | null = null;
    let powersAt = performance.now();
    const pos = { x: 0, y: 0, a: 0, ready: false };
    let world: PvpWorld | null = null;
    const shown = new Map<string, { x: number; y: number; a: number; moving: boolean }>();
    const myShots: Shot[] = [];
    const foreign: Shot[] = [];
    const seenShots = new Map<string, number>();
    const sparks: Spark[] = [];
    const pendingShots: { id: number; x: number; y: number; a: number }[] = [];
    const pendingHits: { target: string; shot: number }[] = [];
    let claim: number | null = null;
    const claimed = new Set<number>();
    // Sahifa yangilansa ham o'q raqamlari takrorlanmasin (server ishlatilganlarini eslab qoladi)
    let shotSeq = Math.floor(Date.now() / 10) % 1_000_000_000;
    let lastFire = 0;
    let lastTeleport = 0;
    let flashUntil = 0;
    let shake = 0;
    let inFlight = false;
    let lastTick = 0;
    let lastHud = 0;
    let lastShotSound = 0;
    let feedSeen = new Set<string>();
    let spectate = 0;
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;
    const say = (text: string, tone: "kill" | "power" | "hurt") => {
      setBanner({ text, tone });
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => setBanner(null), 1600);
    };

    // ---- Kiritish ----
    const keys = new Set<string>();
    let mouse: { x: number; y: number } | null = null;
    let mouseFire = false;
    let touchFire = false;
    let usingTouch = false;
    let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
    let fireId: number | null = null;
    let view = { scale: 1, w: 0, h: 0, dpr: 1, cx: 0, cy: 0 };
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      // Telefonda ~650, kompyuterda ~1100 piksel maydon ko'rinadi
      const scale = Math.max(0.42, Math.min(1.3, Math.min(r.width / 1100, r.height / 640), Math.min(r.width, r.height) / 600));
      view = { ...view, scale, w: r.width, h: r.height, dpr };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toWorld = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left - view.w / 2) / view.scale + view.cx, y: (clientY - r.top - view.h / 2) / view.scale + view.cy };
    };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
        if (down) keys.add(k);
        else keys.delete(k);
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const onDown = (e: PointerEvent) => {
      unlockSound();
      if (e.pointerType === "mouse") {
        usingTouch = false;
        if (me?.out) spectate++;
        mouse = { x: e.clientX, y: e.clientY };
        mouseFire = true;
        return;
      }
      usingTouch = true;
      setTouch(true);
      if (me?.out) {
        spectate++;
        return;
      }
      const r = canvas.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 2 && !stick) stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      else {
        fireId = e.pointerId;
        touchFire = true;
      }
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        mouse = { x: e.clientX, y: e.clientY };
        return;
      }
      if (stick && e.pointerId === stick.id) {
        stick.x = e.clientX;
        stick.y = e.clientY;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        mouseFire = false;
        return;
      }
      if (stick && e.pointerId === stick.id) stick = null;
      if (e.pointerId === fireId) {
        fireId = null;
        touchFire = false;
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    const powerLeft = (k: Exclude<PowerKind, "heart">, now: number) => Math.max(0, (me?.powers[k] ?? 0) - (now - powersAt));

    /** Boshqalar: ko'rinib turganlari (butadagilar faqat yaqindan) */
    const visiblePeers = () =>
      (world?.peers ?? []).filter((p) => {
        if (p.isMe || p.out) return false;
        const s = shown.get(p.id) ?? p;
        return !inBush(s.x, s.y) || Math.hypot(s.x - pos.x, s.y - pos.y) < BUSH_SEE || Boolean(me?.out);
      });

    // ---- Server bilan almashish ----
    // Raqiblar bir oz orqada, ikki ma'lum holat orasi to'ldirilib chiziladi (real vaqtda ~0,1 s, HTTP'da ~0,35 s)
    const smooth = new Smoother(wsUrl ? 120 : 350);
    let claimSentAt = 0;

    /** Kelgan yangilanish (xonadan yoki HTTP'dan): o'z holati, dunyo, sovg'a natijasi */
    const apply = (data: { world: PvpWorld; me: PvpMe | null; claimed: PowerKind | null }, sentClaim: number | null) => {
      const prev = me;
      if (data.me) me = data.me;
      if (!me) return;
      meId = me.id;
      powersAt = performance.now();
      world = data.world;
      const at = performance.now();
      for (const p of world.peers) if (!p.isMe) smooth.push(p.id, at, p.x, p.y, p.a);
      smooth.keep(new Set(world.peers.map((p) => p.id)));
      if (!pos.ready) {
        const mine = world.peers.find((p) => p.isMe);
        pos.x = mine?.x ?? me.x;
        pos.y = mine?.y ?? me.y;
        pos.ready = true;
      }
      if (data.claimed) {
        const def = POWERS[data.claimed];
        say(`${def.icon} ${def.label}!`, "power");
        if (sound) playCorrectSound();
        haptic([10, 30, 10]);
        claim = null;
      } else if (sentClaim !== null) {
        // HTTP: javob keldi, olinmadi. Xonada: sovg'a yo'qoldi yoki 1,2 s o'tdi
        const gone = !world.pickups.some((k) => k.id === sentClaim);
        if (!wsReady || gone || performance.now() - claimSentAt > 1200) {
          claim = null;
          if (!gone) claimed.delete(sentClaim);
        }
      }
      if (prev) {
        if (me.lives < prev.lives) {
          flashUntil = performance.now() + 300;
          shake = 14;
          burst(sparks, pos.x, pos.y, "#f87171", 12);
          if (sound) playHurt();
          haptic([70]);
          if (!me.out) say(`-1 jon · ${me.lives} qoldi`, "hurt");
        }
        if (me.kills > prev.kills) {
          if (sound) playBoom();
          haptic([20, 40, 20]);
        }
        if (me.out && !prev.out) {
          if (sound) playBoom();
          burst(sparks, pos.x, pos.y, skinOf(me.skin).body, 40);
        }
      }
      // Yangi "yiqitdi" xabarlari: portlash va banner
      const fresh = new Set(world.feed.map((f) => f.key));
      for (const f of world.feed) {
        if (feedSeen.has(f.key) || f.ago > 4000) continue;
        if (f.kind === "kill") {
          const victim = world.peers.find((p) => p.name === f.b);
          if (victim) burst(sparks, victim.x, victim.y, skinOf(victim.skin).body, 34);
          if (f.a === me.name) say(`💥 ${f.b} yiqitildi!`, "kill");
          else if (sound && f.b !== me.name) playBoom();
        }
      }
      feedSeen = fresh;
      // Boshqalarning o'qlari
      spawnForeignShots(
        foreign,
        seenShots,
        world.peers.filter((p) => !p.isMe),
        performance.now(),
        BULLET_SPEED,
        BULLET_RANGE
      );
      for (const p of world.peers) if (!shown.has(p.id)) shown.set(p.id, { x: p.x, y: p.y, a: p.a, moving: false });
      for (const id of [...shown.keys()]) if (!world.peers.some((p) => p.id === id)) shown.delete(id);
    };

    // Real vaqt xonasi (WebSocket). 4 s da ulanmasa yoki uzilib qayta ulanmasa — HTTP so'rovlarga o'tiladi
    let socket: WebSocket | null = null;
    let wsReady = false;
    let useHttp = !wsUrl;
    let retries = 0;
    let closed = false;
    const room = newClientState();
    const meBase = { weapon: init.weapon, cooldown: init.cooldown, name: myName, skin: init.skin };
    const connect = () => {
      if (!wsUrl || closed) return;
      let opened = false;
      const sock = new WebSocket(wsUrl);
      socket = sock;
      const fail = setTimeout(() => {
        if (!opened) sock.close();
      }, 4000);
      sock.onopen = () => {
        opened = true;
        wsReady = true;
        retries = 0;
        clearTimeout(fail);
        smooth.setDelay(120);
      };
      sock.onmessage = (ev) => {
        const d = decodeRoomMessage(String(ev.data), room, init.playerId, meBase);
        if (d) apply(d, claim);
      };
      sock.onclose = () => {
        clearTimeout(fail);
        wsReady = false;
        if (closed) return;
        if (retries < 3) {
          retries++;
          setTimeout(connect, 800 * retries);
        } else {
          useHttp = true;
          smooth.setDelay(350);
        }
      };
    };
    connect();

    const tick = () => {
      if (wsReady && socket) {
        const shots = pendingShots.splice(0, 10);
        const hits = pendingHits.splice(0, 8);
        const sendClaim = claim !== null && claimSentAt === 0 ? claim : null;
        if (sendClaim !== null) claimSentAt = performance.now();
        socket.send(JSON.stringify({ t: "in", x: Math.round(pos.x), y: Math.round(pos.y), a: Number(pos.a.toFixed(2)), shots, hits, claim: sendClaim }));
        if (claim === null) claimSentAt = 0;
        return;
      }
      if (!useHttp || inFlight) return;
      inFlight = true;
      const shots = pendingShots.splice(0, 10);
      const hits = pendingHits.splice(0, 8);
      const sentClaim = claim;
      void sendTick(gameId, { x: Math.round(pos.x), y: Math.round(pos.y), a: Number(pos.a.toFixed(2)), shots, hits, claim: sentClaim })
        .then((r) => {
          if (r.success) apply(r.data, sentClaim);
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    };

    // ---- Chizish ----
    const draw = (t: number, now: number) => {
      const { scale, w, h, dpr } = view;
      // Kamera: o'zi (yoki chiqqan bo'lsa — kuzatilayotgan o'yinchi)
      let fx = pos.x;
      let fy = pos.y;
      let specName: string | null = null;
      if (me?.out && world) {
        const alive = world.peers.filter((p) => !p.out);
        if (alive.length > 0) {
          const target = alive[spectate % alive.length];
          const s = shown.get(target.id) ?? target;
          fx = s.x;
          fy = s.y;
          specName = target.name;
        }
      }
      if (!pos.ready && !me) {
        fx = MAP_W / 2;
        fy = MAP_H / 2;
      }
      const halfW = w / 2 / scale;
      const halfH = h / 2 / scale;
      view.cx += ((halfW * 2 >= MAP_W ? MAP_W / 2 : Math.max(halfW, Math.min(MAP_W - halfW, fx))) - view.cx) * (view.cx === 0 ? 1 : 0.2);
      view.cy += ((halfH * 2 >= MAP_H ? MAP_H / 2 : Math.max(halfH, Math.min(MAP_H - halfH, fy))) - view.cy) * (view.cy === 0 ? 1 : 0.2);
      const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#070b18";
      ctx.fillRect(0, 0, w, h);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w / 2 - view.cx * scale + sx), dpr * (h / 2 - view.cy * scale + sy));
      drawFloor(ctx, t, layers);
      for (const p of world?.pickups ?? []) if (!claimed.has(p.id)) drawPickup(ctx, p, t);

      // Boshqalar
      const vis = new Set(visiblePeers().map((p) => p.id));
      for (const p of world?.peers ?? []) {
        if (p.isMe) continue;
        const s = shown.get(p.id) ?? p;
        if (!p.out && !vis.has(p.id)) continue;
        drawRobot(ctx, { x: s.x, y: s.y, a: s.a, skin: p.skin, shield: p.shield, powers: p.powers, out: p.out, moving: (s as { moving?: boolean }).moving, ghost: inBush(s.x, s.y) }, t);
      }
      // O'zi
      if (me && pos.ready) {
        const powers = (["shield", "speed", "rapid", "triple"] as const).filter((k) => powerLeft(k, now) > 0);
        const moving = keys.size > 0 || Boolean(stick);
        drawRobot(ctx, { x: pos.x, y: pos.y, a: pos.a, skin: me.skin, shield: powers.includes("shield"), powers, flash: now < flashUntil, out: me.out, moving, ghost: inBush(pos.x, pos.y) }, t);
      }
      // O'qlar
      for (const s of foreign) drawShot(ctx, s, colorFor(s.owner));
      for (const s of myShots) drawShot(ctx, s, "#fde047");
      drawSparks(ctx, sparks);
      drawTop(ctx, t, layers);
      // Ismlar — butalar ustida
      for (const p of world?.peers ?? []) {
        if (p.isMe || (!p.out && !vis.has(p.id))) continue;
        const s = shown.get(p.id) ?? p;
        nameTag(ctx, `${p.out ? "💀 " : ""}${p.name}`, s.x, s.y - PLAYER_R - 14, colorFor(p.id), p.lives, p.maxLives);
      }
      if (me && pos.ready && !me.out) nameTag(ctx, `${myName} (siz)`, pos.x, pos.y - PLAYER_R - 14, "#fde047", me.lives, me.maxLives);

      // ---- Ekran qatlami ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Kichik xarita
      const mmW = Math.min(190, w * 0.3);
      const mmH = (mmW * MAP_H) / MAP_W;
      const mx0 = w - mmW - 10;
      const my0 = h - mmH - 10;
      const k = mmW / MAP_W;
      ctx.fillStyle = "rgba(2,6,23,0.72)";
      ctx.fillRect(mx0, my0, mmW, mmH);
      ctx.strokeStyle = "rgba(192,132,252,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx0, my0, mmW, mmH);
      ctx.fillStyle = "rgba(56,189,248,0.6)";
      for (const wl of PVP_WALLS) ctx.fillRect(mx0 + wl.x * k, my0 + wl.y * k, Math.max(1, wl.w * k), Math.max(1, wl.h * k));
      for (const p of world?.pickups ?? []) {
        if (claimed.has(p.id)) continue;
        ctx.fillStyle = POWERS[p.kind].color;
        ctx.fillRect(mx0 + p.x * k - 2, my0 + p.y * k - 2, 4, 4);
      }
      for (const p of world?.peers ?? []) {
        if (p.isMe || p.out || !vis.has(p.id)) continue;
        const s = shown.get(p.id) ?? p;
        ctx.fillStyle = colorFor(p.id);
        ctx.beginPath();
        ctx.arc(mx0 + s.x * k, my0 + s.y * k, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pos.ready && me && !me.out) {
        ctx.fillStyle = "#fde047";
        ctx.beginPath();
        ctx.arc(mx0 + pos.x * k, my0 + pos.y * k, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.strokeRect(mx0 + (view.cx - halfW) * k, my0 + (view.cy - halfH) * k, halfW * 2 * k, halfH * 2 * k);
      // Joystik va otish tugmasi
      if (usingTouch && !me?.out) {
        const r = canvas.getBoundingClientRect();
        if (stick) {
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(stick.ox - r.left, stick.oy - r.top, 56, 0, Math.PI * 2);
          ctx.stroke();
          const dx = Math.max(-56, Math.min(56, stick.x - stick.ox));
          const dy = Math.max(-56, Math.min(56, stick.y - stick.oy));
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.beginPath();
          ctx.arc(stick.ox - r.left + dx, stick.oy - r.top + dy, 26, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = touchFire ? "rgba(244,63,94,0.55)" : "rgba(244,63,94,0.28)";
        ctx.beginPath();
        ctx.arc(w - mmW - 70, h - 70, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "bold 28px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText("🎯", w - mmW - 70, h - 70);
      }
      return specName;
    };

    // ---- Asosiy sikl ----
    let ended = false;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const tm = timing.current!;
      if (now - lastTick > (wsReady ? WS_TICK_MS : TICK_MS)) {
        lastTick = now;
        tick();
      }
      const started = now >= tm.start;
      if (!started) setIntro(Math.ceil((tm.start - now) / 1000));
      else setPhase((p) => (p === "intro" ? "play" : p));

      // Harakat va otish
      if (started && pos.ready && me && !me.out && !ended) {
        let mx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
        let my = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
        if (stick) {
          mx = Math.max(-1, Math.min(1, (stick.x - stick.ox) / 56));
          my = Math.max(-1, Math.min(1, (stick.y - stick.oy) / 56));
        }
        const len = Math.hypot(mx, my);
        if (len > 1) {
          mx /= len;
          my /= len;
        }
        const speed = BASE_SPEED * (powerLeft("speed", now) > 0 ? 1.45 : 1);
        const np = resolve(pos.x + mx * speed * dt, pos.y + my * speed * dt);
        pos.x = np.x;
        pos.y = np.y;
        if (len > 0.1 && now - lastTeleport > 900) {
          const tp = teleportFrom(pos.x, pos.y, mx, my);
          if (tp) {
            lastTeleport = now;
            burst(sparks, pos.x, pos.y, "#e879f9", 16);
            pos.x = tp.x;
            pos.y = tp.y;
            burst(sparks, pos.x, pos.y, "#22d3ee", 16);
          }
        }
        // Nishon
        const firing = mouseFire || touchFire || keys.has(" ");
        if (!usingTouch && mouse) {
          const wpt = toWorld(mouse.x, mouse.y);
          pos.a = Math.atan2(wpt.y - pos.y, wpt.x - pos.x);
        } else {
          const target = nearestTarget(pos.x, pos.y, visiblePeers().map((p) => shown.get(p.id) ?? p));
          if (target && (firing || len < 0.1)) pos.a = Math.atan2(target.y - pos.y, target.x - pos.x);
          else if (len > 0.1) pos.a = Math.atan2(my, mx);
        }
        const cooldown = (me.cooldown || 0.36) * (powerLeft("rapid", now) > 0 ? 0.5 : 1) * 1000;
        if (firing && now - lastFire >= cooldown) {
          lastFire = now;
          const shots = fireShots(meId, pos.x, pos.y, pos.a, powerLeft("triple", now) > 0, () => shotSeq++);
          myShots.push(...shots);
          for (const s of shots) pendingShots.push({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), a: Number(pos.a.toFixed(3)) });
          if (sound && now - lastShotSound > 60) {
            lastShotSound = now;
            playShot();
          }
        }
        // Sovg'a
        if (claim === null) {
          for (const p of world?.pickups ?? []) {
            if (claimed.has(p.id)) continue;
            if (Math.hypot(p.x - pos.x, p.y - pos.y) <= PICKUP_R + PLAYER_R + 6) {
              claim = p.id;
              claimed.add(p.id);
              burst(sparks, p.x, p.y, POWERS[p.kind].color, 18);
              break;
            }
          }
        }
      }
      // Boshqalar: buferdan silliq (ikki ma'lum holat orasi to'ldiriladi)
      for (const p of world?.peers ?? []) {
        if (p.isMe) continue;
        const v = smooth.sample(p.id, now);
        const s = shown.get(p.id);
        if (v && s) Object.assign(s, v);
      }
      // O'qlar
      const targets = (world?.peers ?? []).filter((p) => !p.isMe && !p.out).map((p) => ({ id: p.id, ...(shown.get(p.id) ?? p) }));
      const mine = stepShots(myShots, dt, targets);
      myShots.length = 0;
      myShots.push(...mine.shots);
      for (const hit of mine.hits) {
        pendingHits.push({ target: hit.target, shot: hit.shot });
        const victim = world?.peers.find((p) => p.id === hit.target);
        burst(sparks, hit.x, hit.y, victim?.shield ? "#38bdf8" : "#fde047", 10);
      }
      for (const wpt of mine.walls) burst(sparks, wpt.x, wpt.y, "#94a3b8", 4);
      const everyone = [...targets, ...(me && !me.out && pos.ready ? [{ id: meId, x: pos.x, y: pos.y }] : [])];
      const theirs = stepShots(foreign, dt, everyone);
      foreign.length = 0;
      foreign.push(...theirs.shots);
      for (const hit of theirs.hits) burst(sparks, hit.x, hit.y, colorFor(hit.owner), 6);
      stepSparks(sparks, dt);
      if (shake > 0) shake = Math.max(0, shake - dt * 40);

      const specName = draw(t, now);
      if (now - lastHud > 120) {
        lastHud = now;
        const powers = (["shield", "speed", "rapid", "triple"] as const)
          .map((kind) => ({ kind, s: Math.ceil(powerLeft(kind, now) / 1000) }))
          .filter((p) => p.s > 0);
        setHud({
          lives: me?.lives ?? init.lives,
          maxLives: me?.maxLives ?? init.maxLives,
          kills: me?.kills ?? 0,
          alive: world?.alive ?? 0,
          total: world?.total ?? 0,
          left: Math.max(0, Math.ceil((tm.end - now) / 1000)),
          powers,
          feed: (world?.feed ?? []).filter((f) => f.ago < 7000).slice(0, 4),
          out: Boolean(me?.out),
          killedBy: me?.killedBy ?? null,
          spectating: specName,
        });
      }
      if (!ended && (world?.ended || now >= tm.end + 1500)) {
        ended = true;
        setPhase("done");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      closed = true;
      socket?.close();
      if (bannerTimer) clearTimeout(bannerTimer);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // O'yin bir marta yaratiladi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skin = skinOf(init.skin);
  return (
    <div ref={wrapRef} className="relative h-full min-h-[300px] w-full flex-1 select-none overflow-hidden rounded-2xl touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair" />
      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2 text-white sm:p-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 rounded-xl bg-black/55 px-3 py-1.5 text-lg backdrop-blur">
            {Array.from({ length: Math.max(hud.maxLives, hud.lives) }, (_, i) => (
              <span key={i} className={cn("transition-all", i < hud.lives ? "text-rose-500" : "scale-75 opacity-25 grayscale")}>
                ❤
              </span>
            ))}
          </div>
          {hud.powers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {hud.powers.map((p) => (
                <span key={p.kind} className="live-pop rounded-lg bg-black/55 px-2 py-1 text-xs font-black backdrop-blur" style={{ color: POWERS[p.kind].color }}>
                  {POWERS[p.kind].icon} {POWERS[p.kind].label} {p.s}s
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-sm font-black">
          <span className="inline-flex items-center gap-1 rounded-xl bg-black/55 px-3 py-1.5 backdrop-blur">
            <Users className="h-4 w-4 text-emerald-300" /> {hud.alive}/{hud.total}
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-black/55 px-3 py-1.5 backdrop-blur">
            <Skull className="h-4 w-4 text-fuchsia-300" /> {hud.kills}
          </span>
          <span className={cn("rounded-xl bg-black/55 px-3 py-1.5 font-mono backdrop-blur", hud.left <= 10 && "text-rose-300 quiz-shake")}>{hud.left}s</span>
        </div>
      </div>
      {/* Kim kimni yiqitdi */}
      <div className="pointer-events-none absolute left-2 top-24 flex max-w-[60%] flex-col gap-1 sm:left-3">
        {hud.feed.map((f) => (
          <span key={f.key} className="live-pop truncate rounded-lg bg-black/55 px-2 py-1 text-xs font-bold text-white backdrop-blur">
            {f.kind === "kill" ? (
              <>
                <b className="text-amber-300">{f.a}</b> 💥 <b className="text-rose-300">{f.b}</b>
              </>
            ) : (
              <>
                <b className="text-sky-300">{f.a}</b> {f.power ? `${POWERS[f.power].icon} ${POWERS[f.power].label}` : ""}
              </>
            )}
          </span>
        ))}
      </div>
      {phase === "intro" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-4 text-center text-white backdrop-blur-sm">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-fuchsia-300">Kiber jang · hamma hammaga qarshi</p>
          <span key={intro} className="quiz-count font-mono text-8xl font-black">
            {Math.max(1, intro)}
          </span>
          <p className="text-lg font-black">
            Qahramoningiz: <span style={{ color: skin.body }}>{skin.name}</span> · {init.lives} ❤ · {init.weapon}
          </p>
          <p className="max-w-md text-sm text-slate-200">
            {touch ? "Chap tomon — yurish, o'ng tomonni bosib turing — otish (o'zi nishonga oladi)" : "WASD / strelkalar — yurish, sichqoncha — nishon va otish (Space ham)"}
          </p>
          <p className="max-w-md text-xs text-slate-300">
            3 marta o&apos;q yegan o&apos;yindan chiqadi. Xaritadagi ❤ 🛡 ⚡ 🔥 ✳ sovg&apos;alarni oling, butaga yashiring, teleportdan foydalaning!
          </p>
        </div>
      )}
      {banner && phase === "play" && (
        <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center">
          <span
            className={cn(
              "live-banner rounded-2xl px-6 py-3 text-2xl font-black text-white sm:text-3xl",
              banner.tone === "kill" ? "bg-amber-500" : banner.tone === "hurt" ? "bg-rose-600" : "bg-sky-600"
            )}
          >
            {banner.text}
          </span>
        </div>
      )}
      {hud.out && phase !== "done" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-1 text-center text-white">
          <span className="rounded-2xl bg-rose-600/90 px-5 py-2 text-lg font-black">
            <Skull className="mr-1 inline h-5 w-5" /> Siz chiqdingiz{hud.killedBy ? ` — ${hud.killedBy} yiqitdi` : ""}
          </span>
          {hud.spectating && (
            <span className="rounded-xl bg-black/60 px-3 py-1 text-sm font-bold">
              <Eye className="mr-1 inline h-4 w-4" /> {hud.spectating} ni kuzatyapsiz{touch ? " (bosing — keyingisi)" : ""}
            </span>
          )}
        </div>
      )}
      {phase === "done" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
          <Crosshair className="h-14 w-14 text-amber-300" />
          <p className="text-3xl font-black">Jang tugadi!</p>
        </div>
      )}
    </div>
  );
}

