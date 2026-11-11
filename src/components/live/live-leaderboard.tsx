"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Crown, Flame } from "lucide-react";
import type { LivePlayerRow } from "@/actions/live-game.actions";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";
import { SURVIVAL_LIVES } from "@/lib/live-game/modes";
import { fireConfetti, prefersReducedMotion } from "@/lib/confetti";
import { playFanfare, playRankUp, playWhoosh } from "@/lib/sound";
import { Lives, useViewportHeight } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

// Har savoldan keyingi reyting: qatorlar avvalgi o'rnidan yangisiga suriladi, ochko sanab o'sadi,
// ko'tarilganlar va seriyadagilar belgilanadi, yetakchi almashsa — katta e'lon va fanfara.

const ROW = 76; // qator balandligi + oraliq (px)
/** Reyting ostidagi va ustidagi joy (sarlavha, tugmalar, e'lon) — qolganiga nechta qator sig'sa, shuncha */
const CHROME = 330;

function useCountUp(from: number, to: number, delay: number, duration = 900) {
  const [v, setV] = useState(() => (prefersReducedMotion() ? to : from));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        setV(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [from, to, delay, duration]);
  return v;
}

export function LiveLeaderboard({ players, mode, sound, index }: { players: LivePlayerRow[]; mode: LiveGameMode; sound: boolean; index: number }) {
  const vh = useViewportHeight();
  const SHOW = Math.max(3, Math.min(8, Math.floor((vh - CHROME) / ROW)));
  const rows = players.slice(0, SHOW);
  const leader = rows[0];
  const newLeader = Boolean(leader && index > 0 && leader.prevRank !== 1 && leader.score > 0);
  const [settled, setSettled] = useState(false);

  // Avval eski o'rinda turadi, keyin yangisiga suriladi
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (sound) {
      timers.push(setTimeout(() => playWhoosh(), 100));
      rows
        .filter((r) => r.prevRank > r.rank && r.rank > 0)
        .slice(0, 3)
        .forEach((_, i) => timers.push(setTimeout(() => playRankUp(), 900 + i * 220)));
    }
    if (newLeader) {
      timers.push(
        setTimeout(() => {
          if (sound) playFanfare();
          void fireConfetti({ particleCount: 90, spread: 70, origin: { y: 0.3 }, zIndex: 80 });
        }, 1300)
      );
    }
    return () => timers.forEach(clearTimeout);
    // Ovozlar faqat sahna ochilganda bir marta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {newLeader && leader && (
        <div className="live-banner mx-auto flex w-fit items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-6 py-3 text-slate-950 shadow-[0_0_40px_rgba(251,191,36,0.5)]">
          <Crown className="h-7 w-7" />
          <span className="text-xl font-black sm:text-3xl">Yangi yetakchi: {leader.name}!</span>
        </div>
      )}
      <ol className="relative" style={{ height: rows.length * ROW }}>
        {rows.map((r, i) => {
          const from = r.prevRank > 0 && r.prevRank <= SHOW ? r.prevRank - 1 : SHOW;
          const offset = (from - i) * ROW;
          const moved = r.prevRank > 0 ? r.prevRank - r.rank : 0;
          return (
            <Row
              key={r.id}
              row={r}
              place={i + 1}
              mode={mode}
              moved={moved}
              show={SHOW}
              style={{
                top: i * ROW,
                transform: settled ? "translateY(0)" : `translateY(${offset}px)`,
                opacity: settled || from < SHOW ? 1 : 0,
                transitionDelay: `${300 + i * 70}ms`,
              }}
            />
          );
        })}
      </ol>
      {players.length > SHOW && <p className="text-center text-sm text-slate-400">va yana {players.length - SHOW} kishi</p>}
    </div>
  );
}

function Row({ row, place, mode, moved, style }: { row: LivePlayerRow; place: number; mode: LiveGameMode; moved: number; show: number; style: React.CSSProperties }) {
  const score = useCountUp(row.score - row.lastPoints, row.score, 900);
  const top = place === 1;
  return (
    <li
      className={cn(
        "absolute inset-x-0 flex h-16 items-center gap-3 rounded-2xl px-4 shadow-lg transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:gap-4",
        top ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950" : row.eliminated ? "bg-white/[0.04] text-white/40" : "bg-white/10 text-white",
        moved > 0 && !top && "ring-2 ring-emerald-400/60"
      )}
      style={style}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-lg font-black", top ? "bg-slate-950/15" : "bg-black/25")}>
        {top ? <Crown className="h-6 w-6" /> : place}
      </span>
      <span className="min-w-0 flex-1 truncate text-lg font-black sm:text-2xl">{row.name}</span>
      {mode === "survival" && <Lives lives={row.lives} max={SURVIVAL_LIVES} />}
      {row.streak >= 3 && (
        <span className="live-pop inline-flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-1 text-sm font-black text-white" style={{ animationDelay: "1.1s" }}>
          <Flame className="h-4 w-4" />
          {row.streak}
        </span>
      )}
      {moved > 0 && (
        <span className="live-pop inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-2.5 py-1 text-sm font-black text-white" style={{ animationDelay: "1s" }}>
          <ArrowUp className="h-4 w-4" />
          {moved}
        </span>
      )}
      {moved < 0 && (
        <span className="inline-flex items-center gap-0.5 text-sm font-bold text-rose-300/80">
          <ArrowDown className="h-3.5 w-3.5" />
          {-moved}
        </span>
      )}
      {row.lastPoints > 0 && (
        <span className={cn("live-float font-mono text-sm font-black", top ? "text-emerald-800" : "text-emerald-300")} style={{ animationDelay: "0.8s" }}>
          +{formatNumberUz(row.lastPoints)}
        </span>
      )}
      <span className="w-24 text-right font-mono text-xl font-black tabular-nums sm:w-28 sm:text-2xl">{formatNumberUz(score)}</span>
    </li>
  );
}
