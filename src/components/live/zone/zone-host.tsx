"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Star, WifiOff } from "lucide-react";
import type { LiveZoneView } from "@/actions/live-game.actions";
import { FIELD, WAVE_MS, aliveAt, zonePhase, zoneWave, zoneWaveCount, type ZoneWave } from "@/lib/live-game/zone";
import { playFanfare, playHeartbeat, playShutdown, playSurvive, playTickSound, playWhoosh, playZoneAppear, playZoneClose } from "@/lib/sound";
import { cn, formatNumberUz } from "@/lib/utils";
import { ZoneFx, drawZoneField, type DrawRobot } from "./zone-draw";
import { ZoneNet } from "./zone-net";
import { getGameLooksAction } from "@/actions/live-game.actions";
import type { GameLook } from "@/lib/character/catalog";

// "Yashil zona": proyektor. Hamma robotlar real vaqt xonasidan (tomoshabin) yoki HTTP orqali o'qiladi va silliq chiziladi.

export function ZoneHost({ gameId, z, sound, actions }: { gameId: string; z: LiveZoneView; sound: boolean; actions: React.ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const waves = zoneWaveCount(z.final);
  const [info, setInfo] = useState({ wave: 0, waves, secs: 0, countdown: 1, lock: false, alive: 0, total: 0, done: false, caps: "", offline: false });
  // Vaqt: server soatidagi boshlanish/tugash (xona soatiga moslab hisoblanadi)
  const init = useRef({ startAt: z.startAt, endAt: z.endAt, ws: z.ws ?? null });
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || z.ended) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const fx = new ZoneFx();
    const t0 = performance.now();
    const { startAt: startMs, endAt } = init.current;
    const sfx = (f: () => void) => {
      if (soundRef.current) f();
    };
    let outsThisWave = 0;
    const net = new ZoneNet({
      gameId,
      round: z.round,
      wsUrl: init.current.ws,
      meId: null,
      endAt,
      onOut: (_id, x, y) => {
        fx.burst(x, y, "#f87171", 24, 22);
        fx.burst(x, y, "#94a3b8", 10, 10);
        fx.text(x, y - 4, "💥", "#fca5a5");
        outsThisWave += 1;
      },
    });
    net.start();
    // Personajlar: o'yindagi hammaning ko'rinishi bir marta yuklanadi (robot o'rniga shular chiziladi)
    const looks = new Map<string, GameLook>();
    let looksReady = false;
    void getGameLooksAction(gameId)
      .then((r) => {
        if (r.success) for (const [id, l] of Object.entries(r.data)) looks.set(id, l);
        looksReady = r.success;
      })
      .catch(() => {});
    let raf = 0;
    let last = t0;
    let lastInfo = 0;
    let lastTick = 99;
    let shownWave = -2;
    let wasLock = false;
    let resolved = 0;
    let started = Date.now() >= startMs;
    const layouts = new Map<string, ZoneWave>();
    const prevShown = new Map<string, { x: number; y: number }>();

    const layoutFor = (w: number): ZoneWave => {
      const alive = aliveAt([...net.peers.values()].map((p) => p.o - 1), w);
      const key = `${w}:${alive}`;
      let l = layouts.get(key);
      if (!l) {
        l = zoneWave(z.seed, z.final, w, alive);
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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const wallNow = net.now();
      const phase = zonePhase(startMs, wallNow, waves);
      const wave = phase.wave >= 0 ? layoutFor(phase.wave) : null;
      net.pump(now);
      fx.step(dt);

      if (phase.wave !== shownWave && phase.wave >= 0 && !phase.done) {
        shownWave = phase.wave;
        if (wave) {
          sfx(() => playZoneAppear(wave.zones.length));
          for (const zc of wave.zones) fx.ring(zc.cx, zc.cy, "#86efac", zc.r * 1.6);
        }
      }
      if (phase.lock && !wasLock && !phase.done) sfx(playZoneClose);
      wasLock = phase.lock;
      if (net.resolved > resolved) {
        resolved = net.resolved;
        sfx(outsThisWave > 0 ? playShutdown : playSurvive);
        outsThisWave = 0;
      }

      const list: DrawRobot[] = [];
      for (const p of net.peers.values()) {
        const sh = net.shown(p.id) ?? { x: p.x, y: p.y, moving: false };
        const prev = prevShown.get(p.id);
        const ddx = prev ? sh.x - prev.x : 0;
        const ddy = prev ? sh.y - prev.y : 0;
        prevShown.set(p.id, { x: sh.x, y: sh.y });
        const mv = Math.hypot(ddx, ddy) > 0.02;
        list.push({ id: p.id, name: p.name, x: sh.x, y: sh.y, color: p.color, out: p.o > 0, dx: mv ? ddx : 0, dy: mv ? ddy : 0, seat: p.seat, moving: mv, look: looksReady ? looks.get(p.id) ?? null : undefined });
      }
      drawZoneField(ctx, el.width, el.height, {
        wave,
        sinceWaveMs: wallNow - phase.waveStartedAt,
        timeLeft: wave && !phase.lock ? Math.max(0, (phase.waveEndsAt - wallNow) / WAVE_MS) : null,
        lock: phase.lock && !phase.done,
        stars: wave ? wave.stars : [],
        robots: list,
        labels: "all",
        t: now / 1000,
        fx,
      });
      if (now - lastInfo > 150) {
        lastInfo = now;
        const secs = Math.max(0, Math.ceil((phase.waveEndsAt - wallNow) / 1000));
        const countdown = Math.max(0, startMs - wallNow);
        const tickSec = countdown > 0 ? Math.ceil(countdown / 1000) : phase.lock ? 99 : secs;
        if (tickSec > 0 && tickSec <= 3 && tickSec < lastTick) sfx(countdown > 0 ? playTickSound : playHeartbeat);
        if (countdown <= 0 && !started) {
          started = true;
          sfx(() => playWhoosh(0.6));
        }
        lastTick = tickSec;
        setInfo({
          wave: Math.max(0, phase.wave),
          waves,
          secs,
          countdown,
          lock: phase.lock,
          alive: list.filter((r) => !r.out).length,
          total: list.length,
          done: phase.done,
          caps: wave ? (wave.shared ? "Hamma uchun bitta zona" : `${wave.zones.length} ta zona · ${wave.zones.map((q) => q.cap).join(" + ")} joy`) : "",
          offline: Boolean(init.current.ws) && !net.live && now - net.lastData > 1500,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      net.stop();
    };
  }, [gameId, z.round, z.seed, z.final, z.ended, waves]);

  useEffect(() => {
    if (z.ended && soundRef.current) playFanfare(z.final);
  }, [z.ended, z.final]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 via-emerald-500 to-sky-600 shadow-lg shadow-emerald-500/30">
            <Bot className="h-6 w-6" />
          </span>
          <div>
            <p className="text-2xl font-black sm:text-4xl">{z.final ? "Final: Yashil zona" : z.mini ? "Qisqa o'yin: Yashil zona" : "Yashil zona"}</p>
            <p className="text-sm text-slate-300">
              {info.caps && !z.ended ? <span className="font-bold text-emerald-200">{info.caps}</span> : "Avval bitta umumiy zona, keyin 2–3 ta zona — joyni birinchi kirgan oladi!"}
              <span className="ml-2 text-slate-400">🟣 loy · ⚡ elektr · ⭐ +30</span>
            </p>
          </div>
        </div>
        {!z.ended && (
          <div className="flex items-center gap-3">
            {info.offline && (
              <span className="flex items-center gap-1.5 rounded-2xl bg-amber-500/20 px-3 py-2 text-sm font-bold text-amber-200">
                <WifiOff className="h-4 w-4" /> Ulanmoqda
              </span>
            )}
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
          {info.countdown > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-slate-950/50">
              <span key={Math.ceil(info.countdown / 1000)} className="quiz-count font-mono text-9xl font-black">
                {Math.ceil(info.countdown / 1000)}
              </span>
              <p className="text-xl font-bold text-emerald-200">Telefoningizda ekranga bosib robotni yurgizing!</p>
            </div>
          )}
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
