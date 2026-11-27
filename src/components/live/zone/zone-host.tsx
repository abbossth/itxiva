"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Star, Users, WifiOff } from "lucide-react";
import type { LiveZoneView } from "@/actions/live-game.actions";
import { FIELD, WAVE_MS, aliveAt, zonePhase, zoneWave, zoneWaveCount, type ZoneWave } from "@/lib/live-game/zone";
import { playSfx, type SfxName } from "@/lib/game/sfx";
import { gameFont } from "@/lib/game/font";
import { theme, themeCssVars } from "@/lib/game/theme";
import { CharacterSvg } from "@/components/character/character-svg";
import { cn, formatNumberUz } from "@/lib/utils";
import { zoneLooks } from "./zone-looks";
import { ZoneFx, drawZoneField, type DrawRobot } from "./zone-draw";
import { ZoneNet } from "./zone-net";
import { getGameLooksAction } from "@/actions/live-game.actions";
import type { GameLook } from "@/lib/character/catalog";

// "Yashil zona": proyektor. Hamma robotlar real vaqt xonasidan (tomoshabin) yoki HTTP orqali o'qiladi va silliq chiziladi.

export function ZoneHost({ gameId, z, sound, actions }: { gameId: string; z: LiveZoneView; sound: boolean; actions: React.ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const waves = zoneWaveCount(z.final);
  const [info, setInfo] = useState({ wave: 0, waves, secs: 0, frac: 1, countdown: 1, lock: false, alive: 0, total: 0, done: false, caps: "", offline: false });
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
    const sfx = (name: SfxName, arg?: number) => {
      if (soundRef.current) playSfx(name, arg);
    };
    let outsThisWave = 0;
    const net = new ZoneNet({
      gameId,
      round: z.round,
      wsUrl: init.current.ws,
      meId: null,
      endAt,
      onOut: (_id, x, y) => {
        fx.burst(x, y, theme.palette.dangerLight, 20, 22, "spark");
        fx.burst(x, y, theme.palette.muted, 10, 10);
        fx.text(x, y - 5, "💥", theme.palette.dangerLight);
        fx.shake.add(2);
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
        if (r.success) zoneLooks.set(gameId, looks);
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

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const r = el.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const wallNow = net.now();
      const phase = zonePhase(startMs, wallNow, waves);
      const wave = phase.wave >= 0 ? layoutFor(phase.wave) : null;
      net.pump(now);
      fx.step(dt);

      if (phase.wave !== shownWave && phase.wave >= 0 && !phase.done) {
        shownWave = phase.wave;
        if (wave) {
          sfx("appear", wave.zones.length);
          for (const zc of wave.zones) fx.ring(zc.cx, zc.cy, theme.zone.safeLight, zc.r * 1.6);
        }
      }
      if (phase.lock && !wasLock && !phase.done) sfx("close");
      wasLock = phase.lock;
      if (net.resolved > resolved) {
        resolved = net.resolved;
        sfx(outsThisWave > 0 ? "out" : "survive");
        outsThisWave = 0;
        fx.cheer += 1;
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
        dpr,
      });
      if (now - lastInfo > 150) {
        lastInfo = now;
        const secs = Math.max(0, Math.ceil((phase.waveEndsAt - wallNow) / 1000));
        const countdown = Math.max(0, startMs - wallNow);
        const tickSec = countdown > 0 ? Math.ceil(countdown / 1000) : phase.lock ? 99 : secs;
        if (tickSec > 0 && tickSec <= 3 && tickSec < lastTick) sfx(countdown > 0 ? "tick" : "heartbeat");
        if (countdown <= 0 && !started) {
          started = true;
          sfx("whoosh", 0.6);
        }
        lastTick = tickSec;
        setInfo({
          wave: Math.max(0, phase.wave),
          waves,
          secs,
          frac: wave && !phase.lock ? Math.max(0, (phase.waveEndsAt - wallNow) / WAVE_MS) : 1,
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
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible") {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      net.stop();
    };
  }, [gameId, z.round, z.seed, z.final, z.ended, waves]);

  useEffect(() => {
    if (z.ended && soundRef.current) playSfx(z.final ? "winGrand" : "win");
  }, [z.ended, z.final]);

  const looks = zoneLooks.get(gameId);
  const timerCls = info.countdown > 0 || info.lock ? "bg-(--g-panel)" : info.frac <= 0.1 ? "game-pulse bg-(--g-danger)" : info.frac <= 0.3 ? "bg-(--g-warning)" : "bg-(--g-success)/30";
  const panel = "flex items-center gap-2 rounded-2xl bg-(--g-panel) px-4 py-2 text-lg font-black shadow-[0_8px_20px_-12px_var(--g-shadow)] ring-1 ring-white/10";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3 game-ui", gameFont.className, gameFont.variable)} style={themeCssVars()}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-(--g-success) to-(--g-info) shadow-lg ring-2 ring-(--g-outline)">
            <Bot className="h-6 w-6" />
          </span>
          <div>
            <p className="text-2xl font-black sm:text-4xl">{z.final ? "Final: Yashil zona" : z.mini ? "Qisqa o'yin: Yashil zona" : "Yashil zona"}</p>
            <p className="text-sm text-white/75">
              {info.caps && !z.ended ? <span className="font-bold text-(--g-success-light)">{info.caps}</span> : "Avval bitta umumiy zona, keyin 2–3 ta zona — joyni birinchi kirgan oladi!"}
              <span className="ml-2 text-white/55">🟣 loy · ⚡ elektr · ⭐ +30</span>
            </p>
          </div>
        </div>
        {!z.ended && (
          <div className="flex items-center gap-3">
            {info.offline && (
              <span className="flex items-center gap-1.5 rounded-2xl bg-(--g-accent)/20 px-3 py-2 text-sm font-bold text-(--g-accent-light)">
                <WifiOff className="h-4 w-4" /> Ulanmoqda
              </span>
            )}
            <span className={panel}>
              <span className="text-white/60">To&apos;lqin</span>
              <span className="tabular-nums">
                {info.wave + 1}/{info.waves}
              </span>
            </span>
            <span className={panel}>
              <Users className="h-5 w-5 text-(--g-success-light)" />
              <span className="tabular-nums">
                {info.alive}/{info.total}
              </span>
            </span>
            <span className={cn("min-w-20 rounded-2xl px-4 py-1 text-center text-5xl font-black tabular-nums ring-2 ring-(--g-outline) transition-colors", timerCls)}>
              {info.countdown > 0 ? Math.ceil(info.countdown / 1000) : info.lock ? "⛔" : info.secs}
            </span>
          </div>
        )}
      </div>

      {z.ended ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl bg-(--g-panel) p-4 ring-1 ring-(--g-success)/30">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-(--g-success-light)">Natijalar</p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {z.rows.map((r, i) => {
              const look = looks?.get(r.id);
              return (
                <li key={r.id} className={cn("live-pop flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-[0_8px_20px_-14px_var(--g-shadow)]", !r.out ? "bg-(--g-success)/25 ring-1 ring-(--g-success)/50" : "bg-(--g-panel)")} style={{ animationDelay: `${Math.min(i, 12) * 90}ms` }}>
                  <span className="w-7 text-center font-black tabular-nums">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                  {look !== undefined && (
                    <span className="-my-1 shrink-0">
                      <CharacterSvg look={look} size={34} headOnly still mood={r.out ? "sad" : "happy"} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-lg font-black">{r.name}</span>
                  <span className="text-sm text-white/70">{r.out ? `${r.outWave + 1}-to'lqin` : "🟢 omon"}</span>
                  <span className="flex items-center gap-1 text-sm font-bold text-(--g-accent-light)">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {r.stars}
                  </span>
                  <span className="w-16 text-right font-black tabular-nums text-(--g-success-light)">+{formatNumberUz(r.points)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="relative mx-auto w-full min-h-0 flex-1" style={{ maxWidth: `calc((100dvh - 14rem) * ${FIELD.w / FIELD.h})` }}>
          <canvas ref={canvas} className="h-full w-full rounded-3xl shadow-[0_24px_60px_-24px_var(--g-shadow)] ring-2 ring-(--g-outline)" style={{ aspectRatio: `${FIELD.w} / ${FIELD.h}` }} />
          {info.countdown > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-(--g-outline)/55">
              <span key={Math.ceil(info.countdown / 1000)} className="quiz-count text-9xl font-black tabular-nums">
                {Math.ceil(info.countdown / 1000)}
              </span>
              <p className="text-xl font-bold text-(--g-success-light)">Telefoningizda ekranga bosib robotni yurgizing!</p>
            </div>
          )}
          {info.done && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="live-pop rounded-3xl bg-linear-to-r from-(--g-success) to-(--g-info) px-8 py-4 text-4xl font-black ring-4 ring-(--g-outline)">🏁 Raund tugadi!</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </div>
  );
}
