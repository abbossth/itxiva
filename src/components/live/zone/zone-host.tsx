"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Star } from "lucide-react";
import type { LiveZoneView } from "@/actions/live-game.actions";
import { FIELD, WAVE_MS, zonePhase, zoneWaves, type ZonePeer } from "@/lib/live-game/zone";
import { playBoom, playFanfare, playTickSound } from "@/lib/sound";
import { cn, formatNumberUz } from "@/lib/utils";
import { drawZoneField, type DrawRobot } from "./zone-draw";

// "Yashil zona": proyektor. Hamma robotlar soniyasiga ~4 marta /api/live/zone dan o'qiladi va silliq chiziladi.

export function ZoneHost({ gameId, z, sound, actions }: { gameId: string; z: LiveZoneView; sound: boolean; actions: React.ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState({ wave: 0, waves: z.final ? 5 : 3, secs: 0, countdown: 1, lock: false, alive: 0, total: 0, done: false });
  const timing = useRef({ startsInMs: z.startsInMs });

  useEffect(() => {
    const el = canvas.current;
    if (!el || z.ended) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const waves = zoneWaves(z.seed, z.final);
    const t0 = performance.now();
    const startAt = t0 + timing.current.startsInMs;
    const startMs = Date.now() + timing.current.startsInMs;
    const robots = new Map<string, { name: string; x: number; y: number; tx: number; ty: number; color: number; out: boolean; dx: number; dy: number }>();
    let raf = 0;
    let last = t0;
    let lastFetch = 0;
    let lastInfo = 0;
    let fetching = false;
    let lastTick = 99;
    let resolved = 0;

    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const pull = () => {
      if (fetching) return;
      fetching = true;
      void fetch(`/api/live/zone?gameId=${encodeURIComponent(gameId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res: { success: boolean; data?: { peers: ZonePeer[]; resolved: number } | null } | null) => {
          const d = res?.success ? res.data : null;
          if (!d) return;
          const seen = new Set<string>();
          for (const [id, name, px, py, color, out] of d.peers) {
            seen.add(id);
            const p = robots.get(id);
            if (p) {
              p.dx = px - p.tx;
              p.dy = py - p.ty;
              p.tx = px;
              p.ty = py;
              p.out = out === 1;
            } else robots.set(id, { name, x: px, y: py, tx: px, ty: py, color, out: out === 1, dx: 0, dy: 0 });
          }
          for (const id of [...robots.keys()]) if (!seen.has(id)) robots.delete(id);
          if (d.resolved > resolved) {
            resolved = d.resolved;
            if (sound) playBoom();
          }
        })
        .catch(() => {})
        .finally(() => {
          fetching = false;
        });
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const wallNow = startMs + (now - startAt);
      const phase = zonePhase(startMs, wallNow, waves.length);
      const wave = phase.wave >= 0 ? waves[phase.wave] : null;
      if (now - lastFetch > 250) {
        lastFetch = now;
        pull();
      }
      for (const p of robots.values()) {
        p.x += (p.tx - p.x) * Math.min(1, dt * 8);
        p.y += (p.ty - p.y) * Math.min(1, dt * 8);
      }
      const list: DrawRobot[] = [...robots.entries()].map(([id, p]) => ({ id, name: p.name, x: p.x, y: p.y, color: p.color, out: p.out, dx: p.dx, dy: p.dy }));
      drawZoneField(ctx, el.width, el.height, {
        wave,
        timeLeft: wave && !phase.lock ? Math.max(0, (phase.waveEndsAt - wallNow) / WAVE_MS) : null,
        lock: phase.lock && !phase.done,
        stars: wave ? wave.stars : [],
        robots: list,
        labels: "all",
        t: now / 1000,
      });
      if (now - lastInfo > 150) {
        lastInfo = now;
        const secs = Math.max(0, Math.ceil((phase.waveEndsAt - wallNow) / 1000));
        const countdown = Math.max(0, startAt - now);
        const tickSec = countdown > 0 ? Math.ceil(countdown / 1000) : phase.lock ? 99 : secs;
        if (sound && tickSec > 0 && tickSec <= 3 && tickSec < lastTick) playTickSound();
        lastTick = tickSec;
        setInfo({
          wave: Math.max(0, phase.wave),
          waves: waves.length,
          secs,
          countdown,
          lock: phase.lock,
          alive: list.filter((r) => !r.out).length,
          total: list.length,
          done: phase.done,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [gameId, z.seed, z.final, z.ended, sound]);

  useEffect(() => {
    if (z.ended && sound) playFanfare(z.final);
  }, [z.ended, z.final, sound]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 via-emerald-500 to-sky-600">
            <Bot className="h-6 w-6" />
          </span>
          <div>
            <p className="text-2xl font-black sm:text-4xl">{z.final ? "Final: Yashil zona" : "Yashil zona"}</p>
            <p className="text-sm text-slate-300">Vaqt tugaguncha yashil zonaga kiring — tashqarida qolgan robot o&apos;chadi!</p>
          </div>
        </div>
        {!z.ended && (
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-white/10 px-4 py-2 text-lg font-black">
              To&apos;lqin {info.wave + 1}/{info.waves}
            </span>
            <span className="rounded-2xl bg-white/10 px-4 py-2 text-lg font-black">🤖 {info.alive}/{info.total}</span>
            <span className={cn("min-w-20 rounded-2xl px-4 py-1 text-center font-mono text-5xl font-black", info.lock ? "bg-rose-500/30" : info.secs <= 3 ? "bg-rose-500 quiz-shake" : "bg-emerald-500/25")}>
              {info.countdown > 0 ? Math.ceil(info.countdown / 1000) : info.lock ? "⛔" : info.secs}
            </span>
          </div>
        )}
      </div>

      {z.ended ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl bg-white/5 p-4 ring-1 ring-emerald-500/30">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-emerald-300">Natijalar</p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {z.rows.map((r, i) => (
              <li key={r.id} className={cn("live-pop flex items-center gap-3 rounded-2xl px-4 py-2.5", !r.out ? "bg-emerald-500/25 ring-1 ring-emerald-400/50" : "bg-white/10")} style={{ animationDelay: `${Math.min(i, 12) * 90}ms` }}>
                <span className="w-7 text-center font-mono font-black">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-lg font-black">{r.name}</span>
                <span className="text-sm text-slate-300">{r.out ? `${r.outWave + 1}-to'lqin` : "🟢 omon"}</span>
                <span className="flex items-center gap-1 text-sm font-bold text-amber-200">
                  <Star className="h-3.5 w-3.5" />
                  {r.stars}
                </span>
                <span className="w-16 text-right font-mono font-black text-emerald-300">+{formatNumberUz(r.points)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="relative mx-auto w-full min-h-0 flex-1" style={{ maxWidth: `calc((100dvh - 14rem) * ${FIELD.w / FIELD.h})` }}>
          <canvas ref={canvas} className="h-full w-full rounded-3xl" style={{ aspectRatio: `${FIELD.w} / ${FIELD.h}` }} />
          {info.done && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="live-pop rounded-3xl bg-gradient-to-r from-emerald-400 to-sky-500 px-8 py-4 text-4xl font-black">🏁 Raund tugadi!</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </div>
  );
}
