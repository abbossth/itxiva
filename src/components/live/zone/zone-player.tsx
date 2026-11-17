"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Star } from "lucide-react";
import type { LivePlayerState } from "@/actions/live-game.actions";
import { FIELD, STAR_R, ROBOT_R, WAVE_MS, insideZone, zonePhase, zoneWaves, type ZonePeer } from "@/lib/live-game/zone";
import { haptic } from "@/lib/haptics";
import { playBoom, playCheckInSound, playCorrectSound, playTickSound } from "@/lib/sound";
import { cn, formatNumberUz } from "@/lib/utils";
import { drawZoneField, toField, type DrawRobot } from "./zone-draw";

// "Yashil zona": o'quvchi ekrani. Robot ekranga bosilgan (yoki sudralgan) joyga yuradi, klaviaturada ←↑→↓ / WASD.
// Joy soniyasiga ~4 marta serverga yuboriladi; boshqa robotlar javobdan olinadi va silliq ko'rsatiladi.

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
      <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">{z.final ? "Final" : "Raund"} tugadi</p>
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
  inside: boolean;
  stars: number;
  alive: number;
  total: number;
  out: boolean;
  done: boolean;
}

function ZoneRun({ gameId, z }: { gameId: string; z: PlayerZone }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<Hud>({ wave: 0, waves: z.final ? 5 : 3, secs: 0, countdown: 1, lock: false, inside: false, stars: 0, alive: z.total, total: z.total, out: z.out, done: false });
  const [banner, setBanner] = useState<{ text: string; good: boolean; key: number } | null>(null);
  // O'yin holati (kadrlar orasida, React'dan tashqarida)
  const sim = useRef({
    x: z.x,
    y: z.y,
    dx: 0,
    dy: 0,
    target: null as { x: number; y: number } | null,
    keys: { up: false, down: false, left: false, right: false },
    stars: 0,
    taken: new Set<number>(),
    out: z.out,
    resolved: 0,
    peers: new Map<string, { name: string; x: number; y: number; tx: number; ty: number; color: number; out: boolean; dx: number; dy: number }>(),
    alive: z.total,
    total: z.total,
    sending: false,
  });
  // Vaqt: sahifa ochilgan paytdagi qiymatlar (har yangilanishda sahna qayta qurilmasin)
  const timing = useRef({ startsInMs: z.startsInMs, remainingMs: z.remainingMs });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const s = sim.current;
    const waves = zoneWaves(z.seed, z.final);
    const t0 = performance.now();
    const { startsInMs, remainingMs } = timing.current;
    const startAt = t0 + startsInMs;
    const endAt = t0 + remainingMs;
    const startMs = Date.now() + startsInMs;
    let raf = 0;
    let last = t0;
    let lastSend = 0;
    let lastHud = 0;
    let lastTickSec = 99;

    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const send = () => {
      if (s.sending) return;
      s.sending = true;
      const sent = { x: s.x, y: s.y };
      void fetch("/api/live/zone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, round: z.round, x: sent.x, y: sent.y, stars: s.stars }),
        keepalive: true,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((res: { success: boolean; data?: { peers: ZonePeer[]; resolved: number; out: boolean; outWave: number; alive: number; total: number; x: number; y: number } } | null) => {
          const d = res?.success ? res.data : null;
          if (!d) return;
          const seen = new Set<string>();
          for (const [id, name, px, py, color, out] of d.peers) {
            seen.add(id);
            const p = s.peers.get(id);
            if (p) {
              p.dx = px - p.tx;
              p.dy = py - p.ty;
              p.tx = px;
              p.ty = py;
              p.out = out === 1;
            } else {
              s.peers.set(id, { name, x: px, y: py, tx: px, ty: py, color, out: out === 1, dx: 0, dy: 0 });
            }
          }
          for (const id of [...s.peers.keys()]) if (!seen.has(id)) s.peers.delete(id);
          // Server joyni cheklagan bo'lsa (yuborilgan joydan farq qiladi) — tuzatiladi. Javob kelguncha robot
          // yurib ulgurgan bo'ladi, shuning uchun hozirgi joy bilan emas, yuborilgani bilan solishtiriladi
          if (Math.hypot(d.x - sent.x, d.y - sent.y) > 1.5) {
            s.x = d.x;
            s.y = d.y;
            s.target = null;
          }
          s.alive = d.alive;
          s.total = d.total;
          if (d.resolved > s.resolved) {
            const wasOut = s.out;
            s.resolved = d.resolved;
            s.out = d.out;
            if (d.out && !wasOut) {
              setBanner({ text: "💥 Zonadan tashqarida qoldingiz!", good: false, key: d.resolved });
              playBoom();
              haptic([120, 60, 120]);
            } else if (!d.out) {
              setBanner({ text: `🟢 Omon qoldingiz! ${d.resolved}-to'lqin`, good: true, key: d.resolved });
              playCorrectSound();
              haptic([30, 30, 30]);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          s.sending = false;
        });
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Kuchsiz telefonda kadrlar siyrak bo'lsa ham robot sekinlashib qolmasin
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      const wallNow = startMs + (now - startAt);
      const phase = zonePhase(startMs, wallNow, waves.length);
      const wave = phase.wave >= 0 ? waves[phase.wave] : null;
      const moving = phase.wave >= 0 && !phase.lock && !phase.done && !s.out;

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
      if (moving && len > 0) {
        // Nuqtaga — undan o'tib ketmasdan; klaviaturada — doim to'liq tezlikda (diagonalda ham)
        const stepLen = Math.min(s.target ? len : Infinity, z.speed * dt);
        s.x = Math.max(0, Math.min(FIELD.w, s.x + (vx / len) * stepLen));
        s.y = Math.max(0, Math.min(FIELD.h, s.y + (vy / len) * stepLen));
        s.dx = vx;
        s.dy = vy;
        // Yulduz yig'ish
        if (wave) {
          for (const st of wave.stars) {
            if (s.taken.has(st.id)) continue;
            if (Math.hypot(st.x - s.x, st.y - s.y) < STAR_R + ROBOT_R) {
              s.taken.add(st.id);
              s.stars += 1;
              playCheckInSound(1);
              haptic([10]);
            }
          }
        }
      }

      // Boshqa robotlar silliq
      for (const p of s.peers.values()) {
        p.x += (p.tx - p.x) * Math.min(1, dt * 8);
        p.y += (p.ty - p.y) * Math.min(1, dt * 8);
      }

      // Sanoq paytida ham so'raladi — boshqa robotlar startdan oldin ko'rinsin (yurish server tomonda bloklangan)
      if (now - lastSend > 250 && now <= endAt + 2500) {
        lastSend = now;
        send();
      }

      const robots: DrawRobot[] = [...s.peers.entries()].map(([id, p]) => ({ id, name: p.name, x: p.x, y: p.y, color: p.color, out: p.out, dx: p.dx, dy: p.dy }));
      robots.push({ id: "me", name: "Siz", x: s.x, y: s.y, color: z.color, out: s.out, me: true, dx: s.dx, dy: s.dy });
      drawZoneField(ctx, el.width, el.height, {
        wave,
        timeLeft: wave && !phase.lock ? Math.max(0, (phase.waveEndsAt - wallNow) / WAVE_MS) : null,
        lock: phase.lock && !phase.done,
        stars: wave ? wave.stars.filter((st) => !s.taken.has(st.id)) : [],
        robots,
        labels: "near",
        t: now / 1000,
      });

      if (now - lastHud > 120) {
        lastHud = now;
        const secs = Math.max(0, Math.ceil((phase.waveEndsAt - wallNow) / 1000));
        if (moving && secs <= 3 && secs > 0 && secs < lastTickSec) playTickSound();
        lastTickSec = phase.lock ? 99 : secs;
        setHud({
          wave: Math.max(0, phase.wave),
          waves: waves.length,
          secs,
          countdown: Math.max(0, startAt - now),
          lock: phase.lock,
          inside: wave ? insideZone(s.x, s.y, wave) : false,
          stars: s.stars,
          alive: s.alive,
          total: s.total,
          out: s.out,
          done: phase.done,
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
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [gameId, z.round, z.seed, z.final, z.speed, z.color]);

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm font-bold">
        <span className="rounded-xl bg-white/10 px-3 py-1.5">
          To&apos;lqin {hud.wave + 1}/{hud.waves}
        </span>
        <span className="rounded-xl bg-white/10 px-3 py-1.5">🤖 {hud.alive}/{hud.total}</span>
        <span className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-amber-200">
          <Star className="h-4 w-4" /> {hud.stars}
        </span>
        <span className={cn("min-w-14 rounded-xl px-3 py-1.5 text-center font-mono text-xl font-black", hud.lock ? "bg-rose-500/30" : hud.secs <= 3 ? "bg-rose-500 text-white" : "bg-emerald-500/25")}>
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
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/50 text-center">
            <p className="text-sm font-black uppercase tracking-[0.35em] text-emerald-300">{z.final ? "Final" : "Yashil zona"}</p>
            <span key={Math.ceil(hud.countdown / 1000)} className="quiz-count font-mono text-7xl font-black">
              {Math.ceil(hud.countdown / 1000)}
            </span>
            <p className="max-w-xs text-sm font-semibold text-slate-200">Ekranga bosing — robot o&apos;sha joyga yuradi (yoki ←↑→↓). Vaqt tugaguncha yashil zonaga kiring!</p>
          </div>
        )}
        {!hud.countdown && !hud.out && !hud.done && !hud.lock && (
          <p
            className={cn(
              "pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-4 py-1 text-sm font-black",
              hud.inside ? "bg-emerald-500 text-white" : "bg-rose-500/90 text-white"
            )}
          >
            {hud.inside ? "✅ Zonadasiz" : "🏃 Zonaga yuguring!"}
          </p>
        )}
        {hud.out && !hud.done && (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-800/90 px-4 py-1 text-sm font-black">
            👀 O&apos;chdingiz — tomosha qiling
          </p>
        )}
        {banner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p key={banner.key} className={cn("live-pop rounded-3xl px-6 py-3 text-2xl font-black shadow-2xl", banner.good ? "bg-emerald-500" : "bg-rose-600")}>
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
