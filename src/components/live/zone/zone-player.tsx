"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Star, WifiOff } from "lucide-react";
import type { LivePlayerState } from "@/actions/live-game.actions";
import {
  FIELD,
  ROBOT_R,
  SLOW_FACTOR,
  STAR_R,
  WAVE_MS,
  ZAP_STUN_MS,
  aliveAt,
  onTrap,
  zapActive,
  zonePhase,
  zoneWave,
  zoneWaveCount,
  type ZoneWave,
} from "@/lib/live-game/zone";
import { haptic } from "@/lib/haptics";
import {
  playHeartbeat,
  playSeatTaken,
  playShutdown,
  playSplash,
  playStarPickup,
  playSurvive,
  playTickSound,
  playWhoosh,
  playZap,
  playZoneAppear,
  playZoneClose,
  playZoneFull,
  unlockSound,
} from "@/lib/sound";
import { cn, formatNumberUz } from "@/lib/utils";
import { ZoneFx, drawZoneField, toField, type DrawRobot } from "./zone-draw";
import { ZoneNet } from "./zone-net";

// "Yashil zona": o'quvchi ekrani. Robot ekranga bosilgan (yoki sudralgan) joyga yuradi, klaviaturada ←↑→↓ / WASD.
// O'z roboti darhol (kechikishsiz) yuradi; joy real vaqt xonasiga ~20 marta/s yuboriladi (yo'q bo'lsa — HTTP).
// Boshqa robotlar silliq (bufer + oraliqni to'ldirish) ko'rsatiladi.

type PlayerZone = NonNullable<LivePlayerState["zone"]>;

export function ZonePlayer({ gameId, z }: { gameId: string; z: PlayerZone }) {
  if (!z.joined) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <Bot className="h-12 w-12 text-emerald-300" />
        <p className="text-2xl font-black">Yashil zona raundi ketmoqda</p>
        <p className="text-slate-300">Keyingi raundda siz ham yugurasiz!</p>
      </div>
    );
  }
  if (z.ended) return <ZoneResult z={z} />;
  return <ZoneRun key={z.round} gameId={gameId} z={z} />;
}

function ZoneResult({ z }: { z: PlayerZone }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">{z.final ? "Final" : z.mini ? "Qisqa o'yin" : "Raund"} tugadi</p>
      <p className="live-pop text-4xl font-black">{z.out ? `${z.outWave + 1}-to'lqinda o'chdingiz` : "🟢 Oxirigacha omon qoldingiz!"}</p>
      {z.place > 0 && <p className="text-2xl font-black">{z.place}-o&apos;rin</p>}
      {z.points > 0 && <p className="live-pop font-mono text-4xl font-black text-emerald-300">+{formatNumberUz(z.points)}</p>}
      <ol className="w-full max-w-md space-y-1.5 text-left">
        {z.top.map((r, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">
            <span className="w-6 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {r.survivor && <span>🟢</span>}
            <span className="font-mono text-slate-300">+{formatNumberUz(r.points)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface Hud {
  wave: number;
  waves: number;
  secs: number;
  countdown: number;
  lock: boolean;
  /** 0 — zonada emas, >0 — joyli, <0 — joy yetmadi */
  seat: number;
  stars: number;
  alive: number;
  total: number;
  out: boolean;
  done: boolean;
  stunned: boolean;
  slowed: boolean;
  offline: boolean;
}

type Banner = { text: string; tone: "good" | "bad" | "info"; key: number };

/** Ro'yxat matni: "6 + 3 + 3 joy" */
const capsText = (w: ZoneWave) => (w.shared ? "Hamma uchun bitta zona!" : `${w.zones.length} ta zona: ${w.zones.map((z) => z.cap).join(" + ")} joy`);

function ZoneRun({ gameId, z }: { gameId: string; z: PlayerZone }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const waves = zoneWaveCount(z.final);
  const [hud, setHud] = useState<Hud>({ wave: 0, waves, secs: 0, countdown: 1, lock: false, seat: 0, stars: 0, alive: z.total, total: z.total, out: z.out, done: false, stunned: false, slowed: false, offline: false });
  const [banner, setBanner] = useState<Banner | null>(null);
  const bannerKey = useRef(0);
  // O'yin holati (kadrlar orasida, React'dan tashqarida)
  const sim = useRef({
    x: z.x,
    y: z.y,
    dx: 0,
    dy: 0,
    target: null as { x: number; y: number } | null,
    keys: { up: false, down: false, left: false, right: false },
  });
  // Vaqt va manzil: sahifa ochilgan paytdagi qiymatlar (har yangilanishda sahna qayta qurilmasin)
  // Vaqt: server soatidagi boshlanish/tugash (xona soatiga moslab hisoblanadi — hamma telefonda bir xil)
  const init = useRef({ startAt: z.startAt, endAt: z.endAt, ws: z.ws, playerId: z.playerId, out: z.out });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const s = sim.current;
    const fx = new ZoneFx();
    const t0 = performance.now();
    const { startAt: startMs, endAt, ws, playerId } = init.current;
    const say = (text: string, tone: Banner["tone"]) => setBanner({ text, tone, key: ++bannerKey.current });

    const net = new ZoneNet({
      gameId,
      round: z.round,
      wsUrl: ws,
      meId: playerId || null,
      endAt,
      onOut: (_id, x, y) => {
        fx.burst(x, y, "#f87171", 22, 22);
        fx.burst(x, y, "#94a3b8", 10, 10);
      },
    });
    net.start();

    let raf = 0;
    let last = t0;
    let lastHud = 0;
    let lastBeat = 99;
    let lastCount = 99;
    let shownWave = -2;
    let wasLock = false;
    let resolved = 0;
    let out = init.current.out;
    let mySeat = 0;
    let stars = 0;
    const taken = new Set<number>();
    let stunUntil = 0;
    let zapImmuneUntil = 0;
    let inSlow = false;
    const layouts = new Map<string, ZoneWave>();
    const prevShown = new Map<string, { x: number; y: number }>();

    const layoutFor = (w: number): ZoneWave => {
      const outs = [...net.peers.values()].map((p) => p.o - 1);
      outs.push(out ? (net.me?.o ?? 1) - 1 : -1);
      const key = `${w}:${aliveAt(outs, w)}`;
      let l = layouts.get(key);
      if (!l) {
        l = zoneWave(z.seed, z.final, w, aliveAt(outs, w));
        layouts.set(key, l);
      }
      return l;
    };

    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Kuchsiz telefonda kadrlar siyrak bo'lsa ham robot sekinlashib qolmasin
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      const wallNow = net.now();
      const phase = zonePhase(startMs, wallNow, waves);
      const wave = phase.wave >= 0 ? layoutFor(phase.wave) : null;
      const since = wallNow - phase.waveStartedAt;

      // Server: o'z holati (o'chdimi, joy)
      const me = net.me;
      if (me) {
        if (me.correct) {
          s.x = me.correct.x;
          s.y = me.correct.y;
          s.target = null;
          me.correct = null;
        }
        if (me.o > 0 && !out) {
          out = true;
          fx.burst(s.x, s.y, "#f87171", 30, 26);
          fx.burst(s.x, s.y, "#fde047", 12, 16);
          playShutdown();
          haptic([120, 60, 160]);
          say(mySeat < 0 ? "💥 Zona to'la edi — robot o'chdi!" : "💥 Joysiz qoldingiz — robot o'chdi!", "bad");
        }
        if (!out && !phase.lock && me.seat !== mySeat) {
          if (me.seat > 0) {
            playSeatTaken();
            haptic([20, 30, 20]);
            fx.ring(s.x, s.y, "#4ade80", 5);
            fx.text(s.x, s.y - 4, "Joy olindi!", "#86efac");
          } else if (me.seat < 0) {
            playZoneFull();
            haptic([60]);
            say("⛔ Bu zona to'la! Boshqasiga yuguring", "bad");
          }
        }
        mySeat = me.seat;
      }
      if (net.resolved > resolved) {
        resolved = net.resolved;
        if (!out) {
          playSurvive();
          haptic([30, 30, 30]);
          fx.burst(s.x, s.y, "#4ade80", 18, 16);
          say(`🟢 Omon qoldingiz! ${resolved}/${waves}`, "good");
        }
      }

      // To'lqin boshlandi / yopildi
      if (phase.wave !== shownWave && phase.wave >= 0 && !phase.done) {
        shownWave = phase.wave;
        if (wave) {
          playZoneAppear(wave.zones.length);
          for (const zc of wave.zones) fx.ring(zc.cx, zc.cy, "#86efac", zc.r * 1.6);
          if (!out) say(capsText(wave), "info");
        }
        taken.clear();
      }
      if (phase.lock && !wasLock && !phase.done) playZoneClose();
      wasLock = phase.lock;

      const moving = phase.wave >= 0 && !phase.lock && !phase.done && !out;
      const stunned = now < stunUntil;

      // Harakat: klaviatura yo'nalishi yoki bosilgan nuqtaga
      let vx = (s.keys.right ? 1 : 0) - (s.keys.left ? 1 : 0);
      let vy = (s.keys.down ? 1 : 0) - (s.keys.up ? 1 : 0);
      if (vx || vy) s.target = null;
      else if (s.target) {
        vx = s.target.x - s.x;
        vy = s.target.y - s.y;
        if (Math.hypot(vx, vy) < 0.3) {
          s.target = null;
          vx = 0;
          vy = 0;
        }
      }
      const len = Math.hypot(vx, vy);
      let walking = false;
      if (wave && moving) {
        // Tuzoqlar: loy — sekin; yoniq elektr — qotib qoladi
        let slow = false;
        for (const tr of wave.traps) {
          if (!onTrap(s.x, s.y, tr)) continue;
          if (tr.kind === "slow") slow = true;
          else if (zapActive(tr, since) && now > zapImmuneUntil) {
            stunUntil = now + ZAP_STUN_MS;
            zapImmuneUntil = stunUntil + 700;
            playZap();
            haptic([80, 40, 80]);
            fx.burst(s.x, s.y, "#fde047", 20, 20);
            fx.text(s.x, s.y - 4, "⚡ Tok urdi!", "#fde047");
          }
        }
        if (slow && !inSlow) {
          playSplash();
          fx.burst(s.x, s.y, "#c084fc", 10, 8);
        }
        inSlow = slow;
        if (!stunned && now >= stunUntil && len > 0) {
          // Nuqtaga — undan o'tib ketmasdan; klaviaturada — doim to'liq tezlikda (diagonalda ham)
          const speed = z.speed * (slow ? SLOW_FACTOR : 1);
          const stepLen = Math.min(s.target ? len : Infinity, speed * dt);
          s.x = Math.max(0, Math.min(FIELD.w, s.x + (vx / len) * stepLen));
          s.y = Math.max(0, Math.min(FIELD.h, s.y + (vy / len) * stepLen));
          s.dx = vx;
          s.dy = vy;
          walking = stepLen > 0;
          // Yulduz yig'ish
          for (const st of wave.stars) {
            if (taken.has(st.id)) continue;
            if (Math.hypot(st.x - s.x, st.y - s.y) < STAR_R + ROBOT_R) {
              taken.add(st.id);
              stars += 1;
              playStarPickup();
              haptic([10]);
              fx.burst(st.x, st.y, "#fde047", 14, 14);
              fx.text(st.x, st.y - 3, "+30", "#fde047");
            }
          }
        }
      }
      net.send(s.x, s.y, stars);
      net.pump(now);
      fx.step(dt);

      const robots: DrawRobot[] = [];
      for (const p of net.peers.values()) {
        const sh = net.shown(p.id) ?? { x: p.x, y: p.y, moving: false };
        const prev = prevShown.get(p.id);
        const ddx = prev ? sh.x - prev.x : 0;
        const ddy = prev ? sh.y - prev.y : 0;
        prevShown.set(p.id, { x: sh.x, y: sh.y });
        const mv = Math.hypot(ddx, ddy) > 0.02;
        robots.push({ id: p.id, name: p.name, x: sh.x, y: sh.y, color: p.color, out: p.o > 0, dx: mv ? ddx : 0, dy: mv ? ddy : 0, seat: p.seat, moving: mv });
      }
      robots.push({ id: "me", name: "Siz", x: s.x, y: s.y, color: z.color, out, me: true, dx: s.dx, dy: s.dy, seat: mySeat, stunned: now < stunUntil, moving: walking });

      // Yo'l ko'rsatkich: joyim bo'lmasa — eng yaqin bo'sh zonaga
      let guide: { x: number; y: number } | null = null;
      if (wave && moving && mySeat <= 0) {
        const seatedIn = wave.zones.map((_, zi) => robots.filter((r) => !r.out && r.seat === zi + 1).length);
        let best = Infinity;
        wave.zones.forEach((zc, zi) => {
          if (zc.cap > 0 && seatedIn[zi] >= zc.cap) return;
          const d = Math.hypot(zc.cx - s.x, zc.cy - s.y);
          if (d < best) {
            best = d;
            guide = { x: zc.cx, y: zc.cy };
          }
        });
      }

      drawZoneField(ctx, el.width, el.height, {
        wave,
        sinceWaveMs: since,
        timeLeft: wave && !phase.lock ? Math.max(0, (phase.waveEndsAt - wallNow) / WAVE_MS) : null,
        lock: phase.lock && !phase.done,
        stars: wave ? wave.stars.filter((st) => !taken.has(st.id)) : [],
        robots,
        labels: "near",
        guide,
        target: s.target,
        t: now / 1000,
        fx,
      });

      if (now - lastHud > 120) {
        lastHud = now;
        const secs = Math.max(0, Math.ceil((phase.waveEndsAt - wallNow) / 1000));
        const countdown = Math.max(0, startMs - wallNow);
        // Sanoq: 3-2-1 va "start"
        const cnt = Math.ceil(countdown / 1000);
        if (cnt !== lastCount) {
          if (cnt > 0 && cnt <= 3) playTickSound();
          if (cnt === 0 && lastCount <= 3) playWhoosh(0.6);
          lastCount = cnt;
        }
        // Oxirgi 3 soniya — yurak urishi
        if (moving && secs <= 3 && secs > 0 && secs < lastBeat) {
          playHeartbeat();
          if (mySeat <= 0) haptic([25]);
        }
        lastBeat = phase.lock ? 99 : secs;
        const outs = [...net.peers.values()].map((p) => p.o - 1);
        outs.push(out ? (net.me?.o ?? 1) - 1 : -1);
        setHud({
          wave: Math.max(0, phase.wave),
          waves,
          secs,
          countdown,
          lock: phase.lock,
          seat: mySeat,
          stars,
          alive: aliveAt(outs, Math.min(waves, resolved)),
          total: Math.max(outs.length, net.total),
          out,
          done: phase.done,
          stunned: now < stunUntil,
          slowed: inSlow && moving,
          offline: Boolean(ws) && !net.live && now - net.lastData > 1500,
        });
      }
    };
    raf = requestAnimationFrame(loop);

    const setKey = (e: KeyboardEvent, on: boolean) => {
      const k = e.key.toLowerCase();
      const map: Record<string, keyof typeof s.keys> = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
      const dir = map[k];
      if (!dir) return;
      e.preventDefault();
      s.keys[dir] = on;
    };
    const down = (e: KeyboardEvent) => setKey(e, true);
    const up = (e: KeyboardEvent) => setKey(e, false);
    const blur = () => {
      s.keys = { up: false, down: false, left: false, right: false };
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      net.stop();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [gameId, z.round, z.seed, z.final, z.speed, z.color, waves]);

  // Bosilgan / sudralgan joyga yurish
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = canvas.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    sim.current.target = toField(r.width, r.height, e.clientX - r.left, e.clientY - r.top);
  };

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1800);
    return () => clearTimeout(t);
  }, [banner]);

  const status = hud.out
    ? { text: "👀 O'chdingiz — tomosha qiling", cls: "bg-slate-800/90" }
    : hud.stunned
    ? { text: "⚡ Tok urdi — qotib qoldingiz!", cls: "bg-amber-500 text-slate-950" }
    : hud.seat > 0
    ? { text: "✅ Joy olindi — zonadan chiqmang!", cls: "bg-emerald-500 text-white" }
    : hud.seat < 0
    ? { text: "⛔ Zona to'la — boshqasiga!", cls: "bg-rose-600 text-white" }
    : hud.slowed
    ? { text: "🟣 Loy — sekin yuryapsiz", cls: "bg-purple-600 text-white" }
    : { text: "🏃 Zonaga yuguring!", cls: "bg-rose-500/90 text-white" };

  return (
    <div className="flex flex-col gap-2" onPointerDown={unlockSound}>
      <div className="flex items-center justify-between gap-2 text-sm font-bold">
        <span className="rounded-xl bg-white/10 px-3 py-1.5">
          To&apos;lqin {hud.wave + 1}/{hud.waves}
        </span>
        <span className="rounded-xl bg-white/10 px-3 py-1.5">🤖 {hud.alive}/{hud.total}</span>
        <span className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-amber-200">
          <Star className="h-4 w-4" /> {hud.stars}
        </span>
        <span className={cn("min-w-14 rounded-xl px-3 py-1.5 text-center font-mono text-xl font-black", hud.lock ? "bg-rose-500/30" : hud.secs <= 3 ? "quiz-shake bg-rose-500 text-white" : "bg-emerald-500/25")}>
          {hud.countdown > 0 ? "—" : hud.lock ? "⛔" : hud.secs}
        </span>
      </div>
      <div className="relative w-full overflow-hidden rounded-3xl ring-1 ring-emerald-400/30" style={{ aspectRatio: `${FIELD.w} / ${FIELD.h}`, maxHeight: "calc(100dvh - 12rem)" }}>
        <canvas
          ref={canvas}
          className="h-full w-full touch-none select-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            point(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0 || e.pointerType === "touch") point(e);
          }}
        />
        {hud.countdown > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/55 px-4 text-center">
            <p className="text-sm font-black uppercase tracking-[0.35em] text-emerald-300">{z.final ? "Final" : z.mini ? "Qisqa o'yin · Yashil zona" : "Yashil zona"}</p>
            <span key={Math.ceil(hud.countdown / 1000)} className="quiz-count font-mono text-7xl font-black">
              {Math.ceil(hud.countdown / 1000)}
            </span>
            <p className="max-w-sm text-sm font-semibold text-slate-200">
              Ekranga bosing — robot o&apos;sha joyga yuradi (yoki ←↑→↓). Avval hamma uchun bitta zona, keyin 2–3 ta zona: joyni birinchi kirgan oladi!
            </p>
            <p className="text-xs font-bold text-slate-300">🟣 loy sekinlatadi · ⚡ yoniq elektrga tegsangiz qotib qolasiz · ⭐ = +30</p>
          </div>
        )}
        {!hud.countdown && !hud.done && !hud.lock && (
          <p className={cn("pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-sm font-black shadow-lg", status.cls)}>{status.text}</p>
        )}
        {hud.offline && !hud.done && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-amber-200">
            <WifiOff className="h-3.5 w-3.5" /> Aloqa tiklanmoqda…
          </p>
        )}
        {banner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <p
              key={banner.key}
              className={cn(
                "live-pop rounded-3xl px-6 py-3 text-center text-2xl font-black shadow-2xl",
                banner.tone === "good" ? "bg-emerald-500" : banner.tone === "bad" ? "bg-rose-600" : "bg-sky-600/95"
              )}
            >
              {banner.text}
            </p>
          </div>
        )}
        {hud.done && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/40">
            <p className="live-pop rounded-3xl bg-gradient-to-r from-emerald-400 to-sky-500 px-6 py-3 text-3xl font-black">🏁 Raund tugadi!</p>
          </div>
        )}
      </div>
    </div>
  );
}
