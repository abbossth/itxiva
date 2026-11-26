"use client";

import { useEffect, useRef, useState } from "react";
import { Scoreboard, byScore, type BoardRow } from "./arena-scoreboard";
import { getGameLooksAction } from "@/actions/live-game.actions";
import type { GameLook } from "@/lib/character/catalog";
import { Crosshair, Eye, Skull, Users } from "lucide-react";
import type { PvpFeedView, PvpMe, PvpPeer, PvpTickInput, PvpTickResult, PvpWorld } from "@/lib/live-game/pvp-types";
import { decodeRoomMessage, newClientState } from "@/lib/live-game/pvp-room";
import { Smoother } from "./interp";
import {
  BASE_SPEED,
  BULLET_RANGE,
  BULLET_SPEED,
  DASH_COOLDOWN_MS,
  DASH_MS,
  DASH_SPEED,
  EMOTES,
  EMOTE_MS,
  PAD_BOOST,
  PICKUP_R,
  PLAYER_R,
  POWERS,
  fireShots,
  inBush,
  mapOf,
  onPad,
  nearestTarget,
  resolve,
  sameTeam,
  skinOf,
  stepShots,
  teamColor,
  teleportFrom,
  ZONE_DAMAGE_MS,
  MAX_HP,
  REVIVE_R,
  REVIVE_HP,
  DOWNED_SPEED,
  outsideZone,
  type PowerKind,
  type Shot,
  type ZoneState,
} from "@/lib/live-game/pvp";
import { playBoom, playCorrectSound, playHurt, playShot, unlockSound } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { TEAM_NAMES } from "@/lib/live-game/modes";
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
  drawEmote,
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
  /** Jamoaviy arena: har jamoaning tirik a'zolari */
  teams: { team: number; alive: number }[];
  /** Tiriltirish: yonimdagi yiqilgan jamoadosh (ism va %), meni tiriltirishyaptimi (%) */
  revive: { name: string; pct: number; dead: boolean } | null;
  /** O'zi o'lgan, lekin jamoadosh hali tiriltira oladi */
  revivable: boolean;
  myRevive: number;
  /** O'zi yiqilgan (jamoaviy jang) */
  downed: boolean;
  /** Toraluvchi zona: holati va keyingi o'zgarishgacha soniya; o'zi tashqaridami */
  zone: { shrinking: boolean; s: number; outside: boolean; final: boolean } | null;
  /** Statistika jadvali (Tab bosib turilganda / 📊 tugmasi) — yopiq bo'lsa null */
  board: BoardRow[] | null;
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
  init: { lives: number; maxLives: number; skin: string; weapon: string; cooldown: number; playerId: string; /** Jamoaviy arenada o'z jamoasi; -1 — individual */ team?: number; /** Jang xaritasi */ map?: string };
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
    teams: [],
    board: null,
    zone: null,
    revive: null,
    revivable: false,
    myRevive: 0,
    downed: false,
  });
  const myTeam = typeof init.team === "number" ? init.team : -1;
  const [phase, setPhase] = useState<"intro" | "play" | "done">(startsInMs > 0 ? "intro" : "play");
  const [intro, setIntro] = useState(Math.ceil(startsInMs / 1000));
  const [banner, setBanner] = useState<{ text: string; tone: "kill" | "power" | "hurt" } | null>(null);
  const [touch, setTouch] = useState(false);

  const timing = useRef<{ start: number; end: number } | null>(null);
  // Ekrandagi tugmalar (sakrash, emoji) o'yin siklidagi funksiyalarni chaqiradi
  const controls = useRef<{ dash: () => void; emote: (i: number) => void; board: (open: boolean) => void; revive: (on: boolean) => void } | null>(null);
  // Statistika jadvali: kompyuterda Tab bosib turilganda, telefonda 📊 tugmasi bilan
  const [boardOpen, setBoardOpen] = useState(false);
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

    const map = mapOf(init.map);
    const layers = makeMapLayers(map);
    // ---- Holat ----
    let meId = "";
    let me: PvpMe | null = null;
    let powersAt = performance.now();
    const pos = { x: 0, y: 0, a: 0, ready: false };
    let world: PvpWorld | null = null;
    // Zona: oxirgi kelgan holat va qachon kelgani — oraliqda torayish brauzerda davom ettiriladi (silliq)
    let zoneMsg: { z: ZoneState; at: number } | null = null;
    const zoneNow = (now: number): ZoneState | null => {
      if (!zoneMsg) return null;
      const { z, at } = zoneMsg;
      if (!z.shrinking || z.nextMs <= 0) return z;
      const u = Math.min(1, (now - at) / z.nextMs);
      return { ...z, x: z.x + (z.tx - z.x) * u, y: z.y + (z.ty - z.y) * u, r: z.r + (z.tr - z.r) * u, nextMs: Math.max(0, z.nextMs - (now - at)) };
    };
    let zoneWarnAt = 0;
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
    // Sakrash (dash), emoji-reaksiya, oyoq ostidagi chang, boshqalar o'q uzgan vaqt
    let dashUntil = 0;
    let lastDash = -1e9;
    let dashDir = { x: 1, y: 0 };
    let pendingEmote: number | null = null;
    let myEmote: { e: number; at: number } | null = null;
    let lastDust = 0;
    const peerFired = new Map<string, number>();
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
      if (k === "tab") {
        // Brauzer fokusni boshqa elementga o'tkazmasin
        e.preventDefault();
        if (!e.repeat) showBoard(down);
        return;
      }
      if (down && (k === "shift" || k === "e")) {
        e.preventDefault();
        dashReq = true;
        return;
      }
      if (k === "f") {
        e.preventDefault();
        reviveHeld = down;
        return;
      }
      if (down && /^[1-4]$/.test(k)) {
        emote(Number(k) - 1);
        return;
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
        if (down) keys.add(k);
        else keys.delete(k);
      }
    };
    // Tugmalar (telefon) va klavish bir xil yo'l bilan: sakrash so'rovi va emoji
    let dashReq = false;
    // Tiriltirish tugmasi (F yoki 🩹) bosib turilgan
    let reviveHeld = false;
    function emote(i: number) {
      if (i < 0 || i >= EMOTES.length || (myEmote && performance.now() - myEmote.at < 800)) return;
      pendingEmote = i;
      myEmote = { e: i, at: performance.now() };
      haptic([10]);
    }
    let boardShown = false;
    function showBoard(open: boolean) {
      boardShown = open;
      setBoardOpen(open);
      lastHud = 0; // jadval darhol yangilansin
    }
    // Oyna fokusni yo'qotsa (Alt+Tab) — Tab qo'yib yuborilganini bilmaymiz: jadval yopiladi
    const onBlur = () => boardShown && showBoard(false);
    window.addEventListener("blur", onBlur);
    controls.current = {
      dash: () => {
        dashReq = true;
      },
      emote,
      board: showBoard,
      revive: (on: boolean) => {
        reviveHeld = on;
      },
    };
    /** Yonimdagi yiqilgan jamoadosh (tiriltirish mumkin bo'lgan) */
    const downedNear = () => {
      if (myTeam < 0 || !me || me.out || me.downed || !pos.ready || !world) return null;
      let best: PvpPeer | null = null;
      let bd = REVIVE_R * REVIVE_R;
      for (const p of world.peers) {
        if (p.isMe || !((p.downed && !p.out) || p.revivable) || !sameTeam(myTeam, p.team)) continue;
        const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
        if (d <= bd) {
          bd = d;
          best = p;
        }
      }
      return best;
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

    // Jamoaviy arena: jamoadoshga o'q tegmaydi, avtomatik nishon faqat raqibni oladi
    const teamOf = (id: string) => (id === meId ? myTeam : world?.peers.find((p) => p.id === id)?.team ?? -1);
    const isAlly = (id: string) => sameTeam(myTeam, teamOf(id));
    const allyShot = (owner: string, target: string) => sameTeam(teamOf(owner), teamOf(target));

    /** Boshqalar: ko'rinib turganlari (butadagilar faqat yaqindan; jamoadoshlar — doim) */
    const visiblePeers = () =>
      (world?.peers ?? []).filter((p) => {
        if (p.isMe || p.out) return false;
        const s = shown.get(p.id) ?? p;
        return sameTeam(myTeam, p.team) || !inBush(s.x, s.y, map) || Math.hypot(s.x - pos.x, s.y - pos.y) < BUSH_SEE || Boolean(me?.out);
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
      if (world.zone) zoneMsg = { z: world.zone, at };
      for (const p of world.peers) if (!p.isMe && p.shots.some((sh) => sh.age < 160)) peerFired.set(p.id, at);
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
          if (!me.out && !me.downed) say(`−${prev.lives - me.lives} HP`, "hurt");
        }
        if (me.downed && !prev.downed && !me.out) {
          say("🩸 Yiqildingiz! Jamoadosh qutqarsin", "hurt");
          haptic([80, 40, 80]);
        }
        if (prev.downed && !me.downed && !me.out) {
          say(`🩹 Qutqarildingiz! ${me.lives} HP`, "power");
          burst(sparks, pos.x, pos.y, "#4ade80", 30);
          if (sound) playCorrectSound();
          haptic([20, 40, 20]);
        }
        if (prev.out && !me.out) {
          // Jamoadosh tiriltirdi: yiqilgan joydan davom etadi
          const mine = world.peers.find((p) => p.isMe);
          pos.x = mine?.x ?? me.x;
          pos.y = mine?.y ?? me.y;
          say(`🩹 Tiriltirildingiz! ${me.lives} HP`, "power");
          burst(sparks, pos.x, pos.y, "#4ade80", 30);
          if (sound) playCorrectSound();
          haptic([20, 40, 20]);
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
        } else if (f.kind === "down" && myTeam >= 0 && !me.out && !me.downed && f.b !== me.name) {
          // Jamoadosh yiqildi: qayerga borib nima bosishni aytamiz
          const mate = world.peers.find((p) => p.name === f.b && !p.isMe);
          if (mate && sameTeam(myTeam, mate.team)) {
            say(`🩸 ${f.b} yiqildi — yoniga borib ${usingTouch ? "🩹 ni" : "F ni"} bosib turing`, "hurt");
            haptic([40, 60, 40]);
          }
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

    // Real vaqt xonasi (WebSocket). 4 s da ulanmasa yoki uzilsa — darhol HTTP so'rovlari bilan davom etiladi,
    // orqa fonda esa xonaga qayta ulanishga urinib turiladi (0,8 → 5 s); ulangach yana WebSocket'ga qaytadi.
    // 2,5 s xabar kelmasa — ulanish "osilgan" deb yopiladi. Internet qaytsa / sahifa ochilsa — darhol ulanadi.
    let socket: WebSocket | null = null;
    let wsReady = false;
    let useHttp = !wsUrl;
    let retries = 0;
    let closed = false;
    let lastMsg = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const room = newClientState();
    const meBase = { weapon: init.weapon, cooldown: init.cooldown, name: myName, skin: init.skin };
    // Personajlar: robot o'rniga o'quvchilarning o'z personaji chiziladi
    const looks = new Map<string, GameLook>();
    let looksReady = false;
    void getGameLooksAction(gameId)
      .then((r) => {
        if (r.success) for (const [id, l] of Object.entries(r.data)) looks.set(id, l);
        looksReady = r.success;
      })
      .catch(() => {});
    const lookOf = (id: string) => (looksReady ? looks.get(id) ?? null : undefined);
    const connect = () => {
      if (!wsUrl || closed) return;
      let opened = false;
      let sock: WebSocket;
      try {
        sock = new WebSocket(wsUrl);
      } catch {
        useHttp = true;
        return;
      }
      socket = sock;
      const fail = setTimeout(() => {
        if (!opened) sock.close();
      }, 4000);
      sock.onopen = () => {
        opened = true;
        wsReady = true;
        useHttp = false;
        retries = 0;
        lastMsg = performance.now();
        clearTimeout(fail);
        smooth.setDelay(120);
      };
      sock.onmessage = (ev) => {
        lastMsg = performance.now();
        const d = decodeRoomMessage(String(ev.data), room, init.playerId, meBase);
        if (d) apply(d, claim);
      };
      sock.onclose = () => {
        clearTimeout(fail);
        if (socket === sock) {
          socket = null;
          wsReady = false;
        }
        if (closed) return;
        // Ulanish yo'q paytda o'yin to'xtamasin — HTTP bilan davom
        useHttp = true;
        smooth.setDelay(350);
        retries = Math.min(retries + 1, 6);
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, Math.min(5000, 800 * retries));
      };
      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          // yopilgan
        }
      };
    };
    const wake = () => {
      if (document.visibilityState === "hidden" || closed || wsReady || !wsUrl) return;
      if (retryTimer) clearTimeout(retryTimer);
      retries = 0;
      connect();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    const stale = setInterval(() => {
      if (wsReady && socket && performance.now() - lastMsg > 2500) socket.close();
    }, 1000);
    connect();

    const tick = () => {
      if (wsReady && socket) {
        const shots = pendingShots.splice(0, 10);
        const hits = pendingHits.splice(0, 8);
        const sendClaim = claim !== null && claimSentAt === 0 ? claim : null;
        if (sendClaim !== null) claimSentAt = performance.now();
        const em = pendingEmote;
        pendingEmote = null;
        const rv = reviveHeld ? downedNear()?.id ?? null : null;
        socket.send(JSON.stringify({ t: "in", x: Math.round(pos.x), y: Math.round(pos.y), a: Number(pos.a.toFixed(2)), shots, hits, claim: sendClaim, ...(em !== null ? { em } : {}), ...(rv ? { rv } : {}) }));
        if (claim === null) claimSentAt = 0;
        return;
      }
      if (!useHttp || inFlight) return;
      inFlight = true;
      const shots = pendingShots.splice(0, 10);
      const hits = pendingHits.splice(0, 8);
      const sentClaim = claim;
      const em = pendingEmote;
      pendingEmote = null;
      const rv = reviveHeld ? downedNear()?.id ?? null : null;
      void sendTick(gameId, { x: Math.round(pos.x), y: Math.round(pos.y), a: Number(pos.a.toFixed(2)), shots, hits, claim: sentClaim, ...(em !== null ? { em } : {}), ...(rv ? { rv } : {}) })
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
        fx = map.w / 2;
        fy = map.h / 2;
      }
      const halfW = w / 2 / scale;
      const halfH = h / 2 / scale;
      view.cx += ((halfW * 2 >= map.w ? map.w / 2 : Math.max(halfW, Math.min(map.w - halfW, fx))) - view.cx) * (view.cx === 0 ? 1 : 0.2);
      view.cy += ((halfH * 2 >= map.h ? map.h / 2 : Math.max(halfH, Math.min(map.h - halfH, fy))) - view.cy) * (view.cy === 0 ? 1 : 0.2);
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
        drawRobot(
          ctx,
          { x: s.x, y: s.y, a: s.a, skin: p.skin, shield: p.shield, powers: p.powers, out: p.out, moving: (s as { moving?: boolean }).moving, ghost: inBush(s.x, s.y, map) || Boolean(p.downed), ring: teamColor(p.team), fired: now - (peerFired.get(p.id) ?? -1e9) < 110, look: lookOf(p.id) },
          t
        );
      }
      // O'zi
      if (me && pos.ready) {
        const powers = (["shield", "speed", "rapid", "triple"] as const).filter((k) => powerLeft(k, now) > 0);
        const moving = keys.size > 0 || Boolean(stick);
        drawRobot(
          ctx,
          { x: pos.x, y: pos.y, a: pos.a, skin: me.skin, shield: powers.includes("shield"), powers, flash: now < flashUntil, out: me.out, moving, ghost: inBush(pos.x, pos.y, map) || Boolean(me.downed), ring: teamColor(myTeam), fired: now - lastFire < 90, dash: now < dashUntil, look: lookOf(init.playerId) },
          t
        );
      }
      // Yiqilgan jamoadoshlar: 🩹 belgisi va tiriltirish halqasi
      if (myTeam >= 0) {
        for (const p of world?.peers ?? []) {
          if (!((p.downed && !p.out) || p.revivable) || !sameTeam(myTeam, p.team)) continue;
          const s = p.isMe ? { x: pos.x, y: pos.y } : shown.get(p.id) ?? p;
          ctx.save();
          ctx.lineWidth = 5;
          ctx.strokeStyle = "rgba(74,222,128,0.25)";
          ctx.beginPath();
          ctx.arc(s.x, s.y, PLAYER_R + 16, 0, Math.PI * 2);
          ctx.stroke();
          if ((p.revive ?? 0) > 0) {
            ctx.strokeStyle = "#4ade80";
            ctx.shadowColor = "#4ade80";
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(s.x, s.y, PLAYER_R + 16, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (p.revive ?? 0)) / 100);
            ctx.stroke();
          }
          ctx.shadowBlur = 0;
          ctx.font = "22px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = 0.7 + Math.sin(t * 5) * 0.3;
          ctx.fillText("🩹", s.x, s.y - PLAYER_R - 30);
          ctx.restore();
        }
      }
      // O'qlar
      for (const s of foreign) drawShot(ctx, s, colorFor(s.owner));
      for (const s of myShots) drawShot(ctx, s, "#fde047");
      drawSparks(ctx, sparks);
      drawTop(ctx, t, layers);
      // Toraluvchi zona: tashqarisi binafsha "bo'ron", chegara yonib turadi, keyingi doira — oq punktir
      const zone = zoneNow(now);
      if (zone) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-600, -600, map.w + 1200, map.h + 1200);
        ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2, true);
        ctx.fillStyle = `rgba(147,51,234,${0.2 + Math.sin(t * 2) * 0.04})`;
        ctx.fill("evenodd");
        ctx.lineWidth = 6;
        ctx.strokeStyle = `rgba(216,180,254,${0.75 + Math.sin(t * 6) * 0.2})`;
        ctx.shadowColor = "#c084fc";
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (zone.tr < zone.r - 2) {
          ctx.setLineDash([18, 14]);
          ctx.lineDashOffset = -t * 30;
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath();
          ctx.arc(zone.tx, zone.ty, zone.tr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Tashqarida bo'lsa — o'zining yonida xavfsiz tomonga ko'rsatkich
        if (me && pos.ready && !me.out && outsideZone(zone, pos.x, pos.y)) {
          const ang = Math.atan2(zone.y - pos.y, zone.x - pos.x);
          ctx.translate(pos.x + Math.cos(ang) * (PLAYER_R + 34), pos.y + Math.sin(ang) * (PLAYER_R + 34));
          ctx.rotate(ang);
          ctx.fillStyle = "#f5d0fe";
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(-10, -11);
          ctx.lineTo(-4, 0);
          ctx.lineTo(-10, 11);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      // Ismlar — butalar ustida
      for (const p of world?.peers ?? []) {
        if (p.isMe || (!p.out && !vis.has(p.id))) continue;
        const s = shown.get(p.id) ?? p;
        nameTag(ctx, `${p.out ? "💀 " : ""}${sameTeam(myTeam, p.team) ? "🤝 " : ""}${p.name}`, s.x, s.y - PLAYER_R - 14, teamColor(p.team) ?? colorFor(p.id), 0, 0);
      }
      if (me && pos.ready && !me.out) nameTag(ctx, `${myName} (siz)`, pos.x, pos.y - PLAYER_R - 14, "#fde047", 0, 0);
      // Emoji-reaksiyalar
      for (const p of world?.peers ?? []) {
        if (p.isMe || p.out || p.emote < 0 || !vis.has(p.id)) continue;
        const s = shown.get(p.id) ?? p;
        drawEmote(ctx, p.emote, s.x, s.y - PLAYER_R - 78, t);
      }
      if (myEmote && now - myEmote.at < EMOTE_MS && pos.ready && me && !me.out) drawEmote(ctx, myEmote.e, pos.x, pos.y - PLAYER_R - 78, t);

      // ---- Ekran qatlami ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Ekrandan tashqaridagi yiqilgan jamoadosh: chetda yashil ko'rsatkich
      if (myTeam >= 0 && me && !me.out && !me.downed) {
        for (const p of world?.peers ?? []) {
          if (p.isMe || !((p.downed && !p.out) || p.revivable) || !sameTeam(myTeam, p.team)) continue;
          const s = shown.get(p.id) ?? p;
          const px = (s.x - view.cx) * scale + w / 2;
          const py = (s.y - view.cy) * scale + h / 2;
          if (px > 24 && px < w - 24 && py > 24 && py < h - 24) continue;
          const m = 30;
          const ex = Math.max(m, Math.min(w - m, px));
          const ey = Math.max(m + 40, Math.min(h - m, py));
          const ang = Math.atan2(py - h / 2, px - w / 2);
          ctx.save();
          ctx.translate(ex, ey);
          ctx.fillStyle = `rgba(22,163,74,${0.75 + Math.sin(t * 6) * 0.2})`;
          ctx.beginPath();
          ctx.arc(0, 0, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.rotate(ang);
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.moveTo(26, 0);
          ctx.lineTo(16, -7);
          ctx.lineTo(16, 7);
          ctx.closePath();
          ctx.fill();
          ctx.rotate(-ang);
          ctx.font = "16px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🩹", 0, 1);
          ctx.restore();
        }
      }
      // Kichik xarita
      const mmW = Math.min(190, w * 0.3);
      const mmH = (mmW * map.h) / map.w;
      const mx0 = w - mmW - 10;
      const my0 = h - mmH - 10;
      const k = mmW / map.w;
      ctx.fillStyle = "rgba(2,6,23,0.72)";
      ctx.fillRect(mx0, my0, mmW, mmH);
      ctx.strokeStyle = "rgba(192,132,252,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx0, my0, mmW, mmH);
      ctx.fillStyle = "rgba(56,189,248,0.6)";
      for (const wl of map.walls) ctx.fillRect(mx0 + wl.x * k, my0 + wl.y * k, Math.max(1, wl.w * k), Math.max(1, wl.h * k));
      for (const p of world?.pickups ?? []) {
        if (claimed.has(p.id)) continue;
        ctx.fillStyle = POWERS[p.kind].color;
        ctx.fillRect(mx0 + p.x * k - 2, my0 + p.y * k - 2, 4, 4);
      }
      for (const p of world?.peers ?? []) {
        if (p.isMe || p.out || !vis.has(p.id)) continue;
        const s = shown.get(p.id) ?? p;
        ctx.fillStyle = teamColor(p.team) ?? colorFor(p.id);
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
      if (zone) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(mx0, my0, mmW, mmH);
        ctx.clip();
        ctx.strokeStyle = "#d8b4fe";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx0 + zone.x * k, my0 + zone.y * k, zone.r * k, 0, Math.PI * 2);
        ctx.stroke();
        if (zone.tr < zone.r - 2) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(mx0 + zone.tx * k, my0 + zone.ty * k, zone.tr * k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
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
        // Sakrash: harakat yo'nalishida (turgan bo'lsa — nishon tomonga) qisqa tez siljish
        if (dashReq) {
          dashReq = false;
          if (now - lastDash >= DASH_COOLDOWN_MS) {
            lastDash = now;
            dashUntil = now + DASH_MS;
            dashDir = len > 0.1 ? { x: mx / Math.max(len, 1e-6), y: my / Math.max(len, 1e-6) } : { x: Math.cos(pos.a), y: Math.sin(pos.a) };
            burst(sparks, pos.x, pos.y, "#e0f2fe", 10);
            haptic([15]);
          }
        }
        const boost = (powerLeft("speed", now) > 0 ? 1.45 : 1) * (onPad(pos.x, pos.y, map) ? PAD_BOOST : 1);
        const speed = BASE_SPEED * boost * (me.downed ? DOWNED_SPEED : 1);
        const dashing = now < dashUntil;
        const vx = dashing ? dashDir.x * BASE_SPEED * DASH_SPEED : mx * speed;
        const vy = dashing ? dashDir.y * BASE_SPEED * DASH_SPEED : my * speed;
        const np = resolve(pos.x + vx * dt, pos.y + vy * dt, PLAYER_R, map);
        pos.x = np.x;
        pos.y = np.y;
        // Oyoq ostidan chang (tezlik yo'lagida — rangli)
        if ((len > 0.1 || dashing) && now - lastDust > (dashing ? 25 : 90)) {
          lastDust = now;
          sparks.push({ x: pos.x - Math.cos(pos.a) * 14 + (Math.random() - 0.5) * 10, y: pos.y + 16, vx: (Math.random() - 0.5) * 40, vy: -20, life: 0.35, color: onPad(pos.x, pos.y, map) ? `rgb(${map.theme.pad})` : "rgba(148,163,184,0.7)" });
        }
        if ((len > 0.1 || dashing) && now - lastTeleport > 900) {
          const tp = teleportFrom(pos.x, pos.y, dashing ? dashDir.x : mx, dashing ? dashDir.y : my, map);
          if (tp) {
            lastTeleport = now;
            burst(sparks, pos.x, pos.y, "#e879f9", 16);
            pos.x = tp.x;
            pos.y = tp.y;
            burst(sparks, pos.x, pos.y, "#22d3ee", 16);
          }
        }
        // Nishon
        const firing = !me.downed && (mouseFire || touchFire || keys.has(" "));
        if (!usingTouch && mouse) {
          const wpt = toWorld(mouse.x, mouse.y);
          pos.a = Math.atan2(wpt.y - pos.y, wpt.x - pos.x);
        } else {
          const target = nearestTarget(pos.x, pos.y, visiblePeers().filter((p) => !isAlly(p.id)).map((p) => shown.get(p.id) ?? p));
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
        if (claim === null && !me.downed) {
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
      // O'z o'qlari jamoadoshlar ustidan o'tib ketadi
      const mine = stepShots(myShots, dt, targets.filter((p) => !isAlly(p.id)), undefined, map);
      myShots.length = 0;
      myShots.push(...mine.shots);
      for (const hit of mine.hits) {
        pendingHits.push({ target: hit.target, shot: hit.shot });
        const victim = world?.peers.find((p) => p.id === hit.target);
        burst(sparks, hit.x, hit.y, victim?.shield ? "#38bdf8" : "#fde047", 10);
      }
      for (const wpt of mine.walls) burst(sparks, wpt.x, wpt.y, "#94a3b8", 4);
      const everyone = [...targets, ...(me && !me.out && pos.ready ? [{ id: meId, x: pos.x, y: pos.y }] : [])];
      const theirs = stepShots(foreign, dt, everyone, allyShot, map);
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
          teams:
            myTeam >= 0
              ? [...new Set((world?.peers ?? []).map((p) => p.team).filter((x) => x >= 0))]
                  .sort((a, b) => a - b)
                  .map((team) => ({ team, alive: (world?.peers ?? []).filter((p) => p.team === team && !p.out).length }))
              : [],
          revive: (() => {
            const d = downedNear();
            return d ? { name: d.name, pct: d.revive ?? 0, dead: Boolean(d.out) } : null;
          })(),
          myRevive: me?.downed || me?.out ? world?.peers.find((p) => p.isMe)?.revive ?? 0 : 0,
          revivable: Boolean(me?.out && world?.peers.find((p) => p.isMe)?.revivable),
          downed: Boolean(me?.downed && !me.out),
          zone: (() => {
            const z = zoneNow(now);
            if (!z) return null;
            const outside = Boolean(me && pos.ready && !me.out && outsideZone(z, pos.x, pos.y));
            // Tashqarida: ogohlantirish (titrash/ovoz bilan) — har zarar oralig'ida bir marta
            if (outside && now - zoneWarnAt > ZONE_DAMAGE_MS) {
              zoneWarnAt = now;
              haptic([30, 40, 30]);
            }
            return { shrinking: z.shrinking, s: Math.ceil(z.nextMs / 1000), outside, final: z.nextMs <= 0 };
          })(),
          board: boardShown
            ? (world?.peers ?? [])
                .map((p): BoardRow => {
                  // O'zi — eng yangi holat o'z hisobidan
                  const mine = p.isMe && me;
                  const lives = mine ? me!.lives : p.lives;
                  const maxLives = mine ? me!.maxLives : p.maxLives;
                  const out = mine ? me!.out : p.out;
                  return {
                    id: p.id,
                    name: p.isMe ? myName : p.name,
                    kills: mine ? me!.kills : p.kills,
                    deaths: out ? 1 : 0,
                    lives: out ? 0 : lives,
                    maxLives,
                    out,
                    team: p.team,
                    isMe: p.isMe,
                    look: lookOf(p.id),
                  };
                })
                .sort(byScore)
            : null,
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
      clearInterval(stale);
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      if (bannerTimer) clearTimeout(bannerTimer);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
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
          <HpBar hp={hud.out ? 0 : hud.lives} max={Math.max(MAX_HP, hud.maxLives)} />
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
        {hud.zone && !hud.zone.final && phase === "play" && (
          <div className="flex w-full justify-center sm:w-auto">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-black backdrop-blur",
                hud.zone.shrinking ? "bg-fuchsia-600/80 text-white" : "bg-black/55 text-fuchsia-200"
              )}
            >
              🌀 {hud.zone.shrinking ? `Zona torayapti · ${hud.zone.s}s` : `Zona ${hud.zone.s}s dan keyin torayadi`}
            </span>
          </div>
        )}
        {hud.teams.length > 0 && (
          <div className="flex w-full flex-wrap justify-center gap-1.5 text-xs font-black sm:w-auto">
            {hud.teams.map((t) => (
              <span
                key={t.team}
                className={cn("inline-flex items-center gap-1 rounded-lg bg-black/55 px-2 py-1 backdrop-blur", t.team === myTeam && "ring-2 ring-white/70")}
                style={{ color: teamColor(t.team) ?? undefined }}
              >
                {t.team === myTeam ? "🤝 " : ""}
                {TEAM_NAMES[t.team] ?? `${t.team + 1}-jamoa`}: {t.alive}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Emoji-reaksiyalar va sakrash */}
      {phase === "play" && !hud.out && (
        <>
          <div className="absolute left-1/2 top-14 flex -translate-x-1/2 gap-1.5 sm:top-3">
            {EMOTES.map((e, i) => (
              <button
                key={e}
                type="button"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  controls.current?.emote(i);
                }}
                aria-label={`Reaksiya ${e}`}
                title={touch ? undefined : `${i + 1} tugmasi`}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-black/45 text-xl backdrop-blur transition-transform active:scale-90"
              >
                {e}
              </button>
            ))}
          </div>
          <button
            type="button"
            onPointerDown={(ev) => {
              ev.stopPropagation();
              controls.current?.dash();
            }}
            aria-label="Sakrash"
            title={touch ? undefined : "Shift"}
            className="absolute bottom-[150px] right-4 flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-full bg-sky-500/40 text-2xl font-black text-white ring-2 ring-sky-300/60 backdrop-blur transition-transform active:scale-90"
          >
            💨<span className="text-[9px] font-black uppercase tracking-wider">sakrash</span>
          </button>
        </>
      )}
      {phase !== "intro" && (
        <button
          type="button"
          onPointerDown={(ev) => {
            ev.stopPropagation();
            controls.current?.board(!boardOpen);
          }}
          aria-label="Statistika"
          aria-pressed={boardOpen}
          title={touch ? undefined : "Tab — bosib turing"}
          className={cn(
            "absolute right-2 top-14 z-20 flex h-10 cursor-pointer items-center gap-1 rounded-xl px-2.5 text-sm font-black text-white backdrop-blur transition active:scale-90 sm:right-3",
            boardOpen ? "bg-amber-400 text-slate-950" : "bg-black/55"
          )}
        >
          📊 {!touch && <kbd className="rounded bg-white/15 px-1 font-mono text-[10px]">Tab</kbd>}
        </button>
      )}
      {hud.board && <Scoreboard rows={hud.board} myTeam={myTeam} left={hud.left} />}
      {/* Kim kimni yiqitdi */}
      <div className="pointer-events-none absolute left-2 top-24 flex max-w-[60%] flex-col gap-1 sm:left-3">
        {hud.feed.map((f) => (
          <span key={f.key} className="live-pop truncate rounded-lg bg-black/55 px-2 py-1 text-xs font-bold text-white backdrop-blur">
            {f.kind === "down" ? (
              <>
                <b className="text-amber-300">{f.a}</b> 🔻 <b className="text-rose-200">{f.b}</b> yiqildi
              </>
            ) : f.kind === "revive" ? (
              <>
                <b className="text-emerald-300">{f.a}</b> 🩹 <b className="text-emerald-200">{f.b}</b>
              </>
            ) : f.kind === "kill" ? (
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
          <p className="text-xs font-black uppercase tracking-[0.4em] text-fuchsia-300">{myTeam >= 0 ? "Kiber jang · jamoaviy" : "Kiber jang · hamma hammaga qarshi"}</p>
          <p className="rounded-full bg-white/10 px-4 py-1 text-sm font-black">
            Xarita: {mapOf(init.map).emoji} {mapOf(init.map).name}
          </p>
          {myTeam >= 0 && (
            <p className="rounded-2xl px-4 py-1.5 text-xl font-black text-slate-950" style={{ background: teamColor(myTeam) ?? undefined }}>
              Jamoangiz: {TEAM_NAMES[myTeam] ?? `${myTeam + 1}-jamoa`} — jamoadoshlarga o&apos;q tegmaydi
            </p>
          )}
          <span key={intro} className="quiz-count font-mono text-8xl font-black">
            {Math.max(1, intro)}
          </span>
          <p className="text-lg font-black">
            Qahramoningiz: <span style={{ color: skin.body }}>{skin.name}</span> · {MAX_HP} HP · {init.weapon}
          </p>
          <p className="max-w-md text-sm text-slate-200">
            {touch
              ? "Chap tomon — yurish, o'ng tomonni bosib turing — otish (o'zi nishonga oladi), 💨 — sakrash"
              : "WASD / strelkalar — yurish, sichqoncha — nishon va otish (Space ham), Shift — sakrash, 1–4 — reaksiya, Tab — statistika"}
          </p>
          <p className="max-w-md text-xs text-slate-300">
            Sog&apos;lig&apos;ingiz 100 HP — har o&apos;q 16–20 HP oladi (faqat o&apos;zingiz ko&apos;rasiz).{myTeam >= 0 ? " HP 10 ga tushsa yiqilasiz — jamoadosh yoningizga kelib F (🩹) ni 5 soniya bosib tursa, 50 HP bilan turasiz. O'lsangiz ham 30 soniya ichida tiriltirishi mumkin (5 soniya, 30 HP)!" : ""} Xaritadagi ❤ 🛡 ⚡ 🔥 ✳ sovg&apos;alarni oling, butaga yashiring, teleportdan foydalaning!
            <br />
            🌀 Vaqt o&apos;tgan sari xavfsiz doira torayadi — tashqarida qolsangiz jon ketadi. Oq punktir — keyingi doira.
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
      {hud.zone?.outside && phase === "play" && !hud.out && (
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_20px_rgba(168,85,247,0.55)]">
          <div className="absolute inset-x-0 top-[22%] flex justify-center">
            <span className="quiz-shake rounded-2xl bg-fuchsia-700/90 px-5 py-2 text-base font-black text-white sm:text-lg">
              ⚠️ Zonadan tashqaridasiz — doiraga kiring! (har {ZONE_DAMAGE_MS / 1000}s da −1 ❤)
            </span>
          </div>
        </div>
      )}
      {hud.revive && phase === "play" && !hud.out && (
        <button
          type="button"
          onPointerDown={(ev) => {
            ev.stopPropagation();
            controls.current?.revive(true);
          }}
          onPointerUp={() => controls.current?.revive(false)}
          onPointerLeave={() => controls.current?.revive(false)}
          onPointerCancel={() => controls.current?.revive(false)}
          aria-label={`${hud.revive.name}ni tiriltirish`}
          className="absolute bottom-[230px] left-1/2 z-20 flex -translate-x-1/2 cursor-pointer select-none flex-col items-center gap-1 rounded-2xl bg-emerald-600/85 px-5 py-2.5 font-black text-white shadow-xl ring-2 ring-emerald-300/70 backdrop-blur active:scale-95 sm:bottom-24"
        >
          <span className="text-sm">
            🩹 {hud.revive.name} — {touch ? "5 soniya bosib turing" : "F ni 5 soniya bosib turing"}
          </span>
          <span className="h-2 w-44 overflow-hidden rounded-full bg-white/25">
            <span className="block h-full rounded-full bg-white transition-[width] duration-150" style={{ width: `${hud.revive.pct}%` }} />
          </span>
        </button>
      )}
      {hud.downed && phase === "play" && (
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_90px_24px_rgba(225,29,72,0.55)]">
          <div className="absolute inset-x-0 top-[30%] flex flex-col items-center gap-1.5 px-4 text-center">
            <span className="rounded-2xl bg-rose-700/90 px-5 py-2 text-lg font-black text-white">🩸 Yiqildingiz — {hud.lives} HP</span>
            <span className="rounded-xl bg-black/65 px-3 py-1.5 text-sm font-bold text-white">
              {hud.myRevive > 0
                ? `🩹 Sizni qutqarishyapti… ${hud.myRevive}%`
                : `Ota olmaysiz, HP kamaymoqda. Jamoadoshingiz yoningizga kelib qutqarsa — ${REVIVE_HP} HP bilan turasiz`}
            </span>
          </div>
        </div>
      )}
      {hud.out && hud.revivable && phase !== "done" && (
        <div className="pointer-events-none absolute inset-x-0 top-[36%] flex justify-center px-4">
          <span className="rounded-2xl bg-emerald-700/90 px-4 py-2 text-center text-sm font-black text-white">
            {hud.myRevive > 0 ? `🩹 Sizni tiriltirishyapti… ${hud.myRevive}%` : "🩹 Jamoadoshingiz 30 soniya ichida yoningizga kelib sizni tiriltira oladi"}
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



/** Sog'liq polosasi (faqat o'yinchining o'zi ko'radi): yashil → sariq → qizil, zarar izi bilan */
function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  const color = pct > 60 ? "from-emerald-400 to-lime-300" : pct > 30 ? "from-amber-400 to-yellow-300" : "from-rose-600 to-rose-400";
  return (
    <div className="w-44 rounded-xl bg-black/60 px-2.5 py-1.5 backdrop-blur sm:w-56" role="meter" aria-label="Sog'liq" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}>
      <div className="mb-1 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-white/80">
        <span>❤ HP</span>
        <span className={cn("font-mono text-sm", pct <= 30 ? "text-rose-300" : "text-white")}>
          {Math.round(hp)}
          <span className="text-white/50">/{max}</span>
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-white/15">
        {/* Zarar izi: oq qism sekinroq qisqaradi */}
        <span className="absolute inset-y-0 left-0 rounded-full bg-white/70 transition-[width] delay-200 duration-700" style={{ width: `${pct}%` }} />
        <span className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-[width] duration-150", color, pct <= 30 && "animate-pulse")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
