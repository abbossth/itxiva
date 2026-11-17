"use client";

import { useEffect, useRef } from "react";
import { Gem, Rocket } from "lucide-react";
import type { LiveGalaxyView } from "@/actions/live-game.actions";
import { SHIP_COLORS } from "@/lib/live-game/galaxy";
import { playFanfare, playTickSound } from "@/lib/sound";
import { useCountdown } from "../live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

// "Galaktika poygasi 3D": proyektor. Har bir kema o'z yo'lagida — yetakchiga nisbatan qayerdaligi ko'rinadi.

export function GalaxyHost({ g, sound, actions }: { g: LiveGalaxyView; sound: boolean; actions: React.ReactNode }) {
  const starts = useCountdown(g.startsInMs, g.startsInMs > 0);
  const remaining = useCountdown(g.remainingMs, !g.ended && g.startsInMs === 0);
  const lastTick = useRef(99);
  useEffect(() => {
    const secs = Math.ceil((starts > 0 ? starts : remaining) / 1000);
    if (sound && secs > 0 && secs <= 3 && secs < lastTick.current) playTickSound();
    lastTick.current = secs;
  }, [starts, remaining, sound]);
  useEffect(() => {
    if (g.ended && sound) playFanfare(g.final);
  }, [g.ended, g.final, sound]);

  const rows = g.rows.slice(0, 12);
  const lead = Math.max(1, ...rows.map((r) => r.d));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500">
            <Rocket className="h-6 w-6" />
          </span>
          <div>
            <p className="text-2xl font-black sm:text-4xl">{g.final ? "Final: Galaktika poygasi" : "Galaktika poygasi 3D"}</p>
            <p className="text-sm text-slate-300">Telefonda: ← → burilish, turbo · asteroidlardan qoching, 💎 yig&apos;ing</p>
          </div>
        </div>
        {starts > 0 ? (
          <span key={Math.ceil(starts / 1000)} className="quiz-count font-mono text-7xl font-black">
            {Math.ceil(starts / 1000)}
          </span>
        ) : !g.ended ? (
          <span className={cn("font-mono text-5xl font-black tabular-nums sm:text-7xl", remaining <= 5000 && "text-rose-400 quiz-shake")}>{Math.ceil(remaining / 1000)}</span>
        ) : (
          <span className="live-pop rounded-full bg-emerald-500 px-4 py-2 text-lg font-black">🏁 Marra!</span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.25),transparent_60%),linear-gradient(180deg,#05031c,#0b0630)] p-4 ring-1 ring-violet-500/30">
        {/* Yulduzlar */}
        <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(1px_1px_at_20%_30%,#fff,transparent),radial-gradient(1px_1px_at_70%_20%,#c4b5fd,transparent),radial-gradient(1.5px_1.5px_at_40%_80%,#67e8f9,transparent),radial-gradient(1px_1px_at_85%_65%,#fff,transparent),radial-gradient(1px_1px_at_10%_75%,#f0abfc,transparent)]" />
        {rows.length === 0 && <p className="relative py-16 text-center text-xl text-slate-300">Kemalar startga chiqmoqda…</p>}
        <ol className="relative flex h-full flex-col justify-around gap-1.5">
          {rows.map((r, i) => {
            const color = SHIP_COLORS[r.ship % SHIP_COLORS.length];
            const pos = Math.max(2, Math.min(92, (r.d / lead) * 90));
            return (
              <li key={r.id} className="flex min-h-[34px] items-center gap-3">
                <span className="w-7 text-right font-mono text-lg font-black text-slate-400">{i === 0 ? "👑" : i + 1}</span>
                <span className="w-28 shrink-0 truncate text-base font-black sm:w-40 sm:text-lg">{r.name}</span>
                <div className="relative h-8 flex-1 rounded-full bg-white/5">
                  <div className="absolute inset-y-[45%] left-0 rounded-full opacity-60" style={{ width: `${pos}%`, background: `linear-gradient(90deg, transparent, ${color})` }} />
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl transition-[left] duration-700 ease-out"
                    style={{ left: `${pos}%`, filter: `drop-shadow(0 0 8px ${color})` }}
                  >
                    🚀
                  </span>
                </div>
                <span className="w-24 text-right font-mono text-base font-black">{formatNumberUz(r.d)} m</span>
                <span className="flex w-12 items-center justify-end gap-1 font-mono text-sm font-bold text-cyan-300">
                  <Gem className="h-3.5 w-3.5" />
                  {r.orbs}
                </span>
                {g.ended && <span className="live-pop w-20 text-right font-mono font-black text-emerald-300">+{formatNumberUz(r.points)}</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </div>
  );
}
