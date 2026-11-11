"use client";

import { useEffect, useState } from "react";
import { Crown, Users } from "lucide-react";
import Link from "@/components/ui/link";
import type { LiveHostState } from "@/actions/live-game.actions";
import { fireConfetti } from "@/lib/confetti";
import { playDrumroll, playFanfare, playFireworksSound } from "@/lib/sound";
import { liveMusic } from "@/lib/live-game/music";
import { TEAM_STYLES } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

// Final: g'oliblar birma-bir e'lon qilinadi — avval 3-o'rin, keyin 2-o'rin, oxirida 1-o'rin (baraban, fanfara, salyut).

interface Place {
  key: string;
  name: string;
  score: number;
  coins: number;
  /** Jamoaviyda: jamoa a'zolari */
  members?: string[];
  team?: number;
}

const COLUMN = [
  // Balandlik ekranga nisbatan — past ekranda ham shohsupa to'liq sig'adi
  { place: 2, pillar: "h-[15vh]", color: "from-slate-200 to-slate-400 text-slate-900" },
  { place: 1, pillar: "h-[22vh]", color: "from-amber-300 to-amber-500 text-amber-950" },
  { place: 3, pillar: "h-[10vh]", color: "from-orange-300 to-orange-500 text-orange-950" },
];

export function LivePodium({ state, sound, music }: { state: LiveHostState; sound: boolean; music: boolean }) {
  // Shohsupa va ro'yxatda faqat ochko to'plaganlar (jamoaviyda — ochkosi bor jamoalar)
  const scored = state.players.filter((p) => p.score > 0);
  const places: Place[] =
    state.mode === "team"
      ? state.standings.filter((s) => s.average > 0).slice(0, 3).map((s) => ({
          key: `t${s.team}`,
          name: s.name,
          score: s.average,
          coins: s.team === state.standings[0]?.team ? state.players.find((p) => p.team === s.team && p.coins > 0)?.coins ?? 0 : 0,
          members: state.players.filter((p) => p.team === s.team).map((p) => p.name),
          team: s.team,
        }))
      : scored.slice(0, 3).map((p) => ({ key: p.id, name: p.name, score: p.score, coins: p.coins }));

  // 0 — kutish, 3 → 3-o'rin ochildi, 2 → 2-o'rin, 1 → 1-o'rin, -1 — hammasi va ro'yxat
  const [shown, setShown] = useState<number>(() => (places.length === 0 ? -1 : 4));

  // Effekt qayta ishga tushsa (masalan, React dev rejimi), taymerlar tozalanib e'lon qaytadan boshlanadi
  useEffect(() => {
    liveMusic.play(null);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 300;
    const step = (place: number, roll: number) => {
      if (!places[place - 1]) return;
      timers.push(setTimeout(() => sound && playDrumroll(roll), t));
      t += roll * 1000 + 100;
      timers.push(setTimeout(() => setShown(place), t));
      t += 900;
    };
    step(3, 1.3);
    step(2, 1.3);
    step(1, 2.1);
    // Hech kim ochko to'plamagan bo'lsa — tantana yo'q
    if (places.length === 0) return;
    timers.push(
      setTimeout(() => {
        if (sound) {
          playFanfare(true);
          playFireworksSound([0.2, 0.7, 1.3]);
        }
        void fireConfetti({ particleCount: 180, spread: 110, origin: { y: 0.45 }, zIndex: 80 });
        timers.push(setTimeout(() => void fireConfetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, zIndex: 80 }), 400));
        timers.push(setTimeout(() => void fireConfetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, zIndex: 80 }), 700));
        if (music) timers.push(setTimeout(() => liveMusic.play("victory"), 1800));
      }, t - 900)
    );
    timers.push(setTimeout(() => setShown(-1), t + 1600));
    return () => timers.forEach(clearTimeout);
    // Faqat bir marta — e'lon qayta boshlanmasin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isShown = (place: number) => shown === -1 || place >= shown;

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <p className="text-sm font-black uppercase tracking-[0.4em] text-amber-200">{state.mode === "team" ? "G'olib jamoalar" : "G'oliblar"}</p>

      <div className="relative flex w-full max-w-4xl items-end justify-center gap-2 sm:gap-4">
        {/* 1-o'rin ortidagi aylanuvchi nur */}
        {isShown(1) && places[0] && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/4">
            <div
              className="reward-rays h-full w-full rounded-full opacity-50"
              style={{
                background: "repeating-conic-gradient(from 0deg, rgba(251,191,36,0.55) 0deg 10deg, transparent 10deg 30deg)",
                maskImage: "radial-gradient(circle, black 15%, transparent 62%)",
                WebkitMaskImage: "radial-gradient(circle, black 15%, transparent 62%)",
              }}
            />
          </div>
        )}
        {COLUMN.map(({ place, pillar, color }) => {
          const p = places[place - 1];
          if (!p) return <div key={place} className="flex-1" />;
          const open = isShown(place);
          return (
            <div key={place} className="relative flex flex-1 flex-col items-center justify-end gap-2">
              <div className={cn("flex min-h-[6rem] flex-col items-center justify-end gap-1 transition-all", open ? "live-drop" : "opacity-0")}>
                {place === 1 && open && <Crown className="h-10 w-10 text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.8)] sm:h-14 sm:w-14" />}
                <span className={cn("max-w-full truncate px-1 font-black", place === 1 ? "text-2xl sm:text-5xl" : "text-lg sm:text-3xl")}>{p.name}</span>
                <span className="font-mono text-sm text-slate-300 sm:text-lg">{formatNumberUz(p.score)} ochko</span>
                {p.coins > 0 && <span className="rounded-full bg-amber-400/20 px-3 py-0.5 text-sm font-black text-amber-200">+{p.coins} coin</span>}
                {p.members && p.members.length > 0 && (
                  <span className="inline-flex max-w-full items-center gap-1 truncate text-xs text-slate-300">
                    <Users className="h-3.5 w-3.5 shrink-0" /> {p.members.join(", ")}
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b pt-3 font-mono text-4xl font-black shadow-2xl transition-[transform] duration-700 ease-out sm:text-6xl",
                  pillar,
                  p.team !== undefined ? TEAM_STYLES[p.team]?.bar : color,
                  open ? "translate-y-0" : "translate-y-6 opacity-40"
                )}
              >
                {place}
              </div>
            </div>
          );
        })}
      </div>

      {shown === -1 && places.length === 0 && <p className="text-lg font-bold text-slate-300">Bu o&apos;yinda hech kim ochko to&apos;plamadi.</p>}

      {shown === -1 && state.mode !== "team" && scored.length > 3 && (
        <ol className="live-pop grid w-full max-w-3xl gap-1.5 sm:grid-cols-2">
          {scored.slice(3, 10).map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 text-left">
              <span className="w-6 font-mono font-black text-slate-400">{i + 4}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
              <span className="font-mono font-black">{formatNumberUz(p.score)}</span>
            </li>
          ))}
        </ol>
      )}

      {shown === -1 && (
        <Link href="/mentor/live" className="inline-flex min-h-[48px] items-center rounded-2xl bg-white/10 px-6 font-bold hover:bg-white/20">
          Yangi o&apos;yin
        </Link>
      )}
    </div>
  );
}
