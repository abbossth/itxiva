"use client";

import { useEffect, useState } from "react";
import { Crown, Users } from "lucide-react";
import Link from "@/components/ui/link";
import type { LiveHostState } from "@/actions/live-game.actions";
import type { GameLook } from "@/lib/character/catalog";
import { fireConfetti } from "@/lib/confetti";
import { playDrumroll, playFireworksSound, playPodiumIntro, playPodiumReveal } from "@/lib/sound";
import { liveMusic } from "@/lib/live-game/music";
import { CharacterSvg } from "@/components/character/character-svg";
import { TEAM_STYLES, useViewportHeight } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

// Final: g'oliblar sahnasi. Sahna chiroqlari aylanib turadi, ustunlar ustida — sirli siluetlar.
// Avval 3-o'rin, keyin 2-o'rin, oxirida 1-o'rin ochiladi: baraban sadosi → personaj ustunga sakrab chiqadi
// (timpani, mis fanfara, tarelka, olqish) → oxirida salyut va hamma g'oliblar raqsga tushadi.

interface Place {
  key: string;
  name: string;
  score: number;
  coins: number;
  /** Jamoaviyda: jamoa a'zolari */
  members?: { name: string; look: GameLook | null }[];
  team?: number;
  look?: GameLook | null;
}

const COLUMN = [
  // Balandlik ekranga nisbatan — past ekranda ham shohsupa to'liq sig'adi
  { place: 2 as const, face: "from-slate-200 via-slate-300 to-slate-500", top: "bg-slate-100", text: "text-slate-800", medal: "🥈", glow: "rgba(226,232,240,0.55)" },
  { place: 1 as const, face: "from-amber-200 via-amber-400 to-amber-600", top: "bg-amber-100", text: "text-amber-950", medal: "🥇", glow: "rgba(251,191,36,0.7)" },
  { place: 3 as const, face: "from-orange-200 via-orange-400 to-orange-700", top: "bg-orange-100", text: "text-orange-950", medal: "🥉", glow: "rgba(251,146,60,0.55)" },
];

/** Aylanib turuvchi sahna chiroqlari */
function Spotlights({ focus }: { focus: boolean }) {
  const beams = [
    { x: "6%", color: "rgba(244,114,182,0.24)", dur: 7, delay: 0 },
    { x: "28%", color: "rgba(96,165,250,0.24)", dur: 9, delay: 1.2 },
    { x: "62%", color: "rgba(250,204,21,0.22)", dur: 8, delay: 0.6 },
    { x: "86%", color: "rgba(167,139,250,0.24)", dur: 10, delay: 1.8 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {beams.map((b, i) => (
        <div
          key={i}
          className={cn("podium-beam absolute -top-10 h-[120%] w-40", focus && "podium-beam-fast")}
          style={{ left: b.x, background: `linear-gradient(to bottom, ${b.color}, transparent 85%)`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}
        />
      ))}
      {/* Sahna poli */}
      <div className="absolute inset-x-[-10%] bottom-0 h-[30%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.35),transparent_70%)]" />
    </div>
  );
}

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
          members: state.players.filter((p) => p.team === s.team).map((p) => ({ name: p.name, look: p.look })),
          team: s.team,
        }))
      : scored.slice(0, 3).map((p) => ({ key: p.id, name: p.name, score: p.score, coins: p.coins, look: p.look }));

  // 4 — kutish, 3 → 3-o'rin ochildi, 2 → 2-o'rin, 1 → 1-o'rin, -1 — hammasi va ro'yxat
  const [shown, setShown] = useState<number>(() => (places.length === 0 ? -1 : 4));
  // Hozir baraban chalinayotgan o'rin (siluet titraydi)
  const [rolling, setRolling] = useState<number | null>(null);

  // Effekt qayta ishga tushsa (masalan, React dev rejimi), taymerlar tozalanib e'lon qaytadan boshlanadi
  useEffect(() => {
    liveMusic.play(null);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (sound && places.length > 0) playPodiumIntro();
    let t = 900;
    const step = (place: 1 | 2 | 3, roll: number) => {
      if (!places[place - 1]) return;
      const startAt = t;
      timers.push(
        setTimeout(() => {
          setRolling(place);
          if (sound) playDrumroll(roll);
        }, startAt)
      );
      t += roll * 1000 + 60;
      timers.push(
        setTimeout(() => {
          setRolling(null);
          setShown(place);
          if (sound) playPodiumReveal(place);
          void fireConfetti({ particleCount: place === 1 ? 60 : 35, spread: 50, startVelocity: 35, origin: { x: place === 1 ? 0.5 : place === 2 ? 0.3 : 0.7, y: 0.55 }, zIndex: 80 });
        }, t)
      );
      t += place === 1 ? 600 : 1300;
    };
    step(3, 1.3);
    step(2, 1.4);
    step(1, 2.4);
    // Hech kim ochko to'plamagan bo'lsa — tantana yo'q
    if (places.length === 0) return;
    timers.push(
      setTimeout(() => {
        if (sound) playFireworksSound([0.1, 0.6, 1.1, 1.7, 2.3]);
        void fireConfetti({ particleCount: 200, spread: 120, origin: { y: 0.45 }, zIndex: 80 });
        timers.push(setTimeout(() => void fireConfetti({ particleCount: 90, angle: 60, spread: 65, origin: { x: 0, y: 0.75 }, zIndex: 80 }), 400));
        timers.push(setTimeout(() => void fireConfetti({ particleCount: 90, angle: 120, spread: 65, origin: { x: 1, y: 0.75 }, zIndex: 80 }), 700));
        timers.push(setTimeout(() => void fireConfetti({ particleCount: 70, spread: 360, startVelocity: 25, origin: { x: 0.5, y: 0.25 }, zIndex: 80 }), 1300));
        if (music) timers.push(setTimeout(() => liveMusic.play("victory"), 2600));
      }, t)
    );
    timers.push(setTimeout(() => setShown(-1), t + 1800));
    return () => timers.forEach(clearTimeout);
    // Faqat bir marta — e'lon qayta boshlanmasin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isShown = (place: number) => shown === -1 || place >= shown;
  // O'lchamlar ekran balandligidan: hammasi (ro'yxat va tugma bilan) skrollsiz sig'adi
  const vh = useViewportHeight();
  const charBig = Math.round(Math.min(170, Math.max(80, vh * 0.17)));
  const charSmall = Math.round(charBig * 0.74);
  // Ustunda medal, ism va ochko sig'ishi kerak — balandlik undan past bo'lmaydi
  const pillarH = { 1: Math.max(96, Math.round(vh * 0.19)), 2: Math.max(84, Math.round(vh * 0.15)), 3: Math.max(76, Math.round(vh * 0.12)) } as const;
  const rest = shown === -1 && state.mode !== "team" ? scored.slice(3, vh > 820 ? 12 : 9) : [];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-between gap-3 overflow-hidden pb-1 text-center">
      <Spotlights focus={rolling !== null || shown === -1} />
      <div className="relative flex w-full items-center justify-center">
        <p className="text-sm font-black uppercase tracking-[0.4em] text-amber-200 drop-shadow">{state.mode === "team" ? "G'olib jamoalar" : "G'oliblar"}</p>
        {shown === -1 && (
          <Link href="/mentor/live" className="live-pop absolute right-0 inline-flex min-h-[40px] items-center rounded-2xl bg-white/15 px-4 text-sm font-bold ring-1 ring-white/20 backdrop-blur hover:bg-white/25">
            Yangi o&apos;yin
          </Link>
        )}
      </div>

      <div className="relative flex min-h-0 w-full max-w-5xl flex-1 items-end justify-center gap-2 sm:gap-5">
        {/* 1-o'rin ortidagi aylanuvchi nur */}
        {isShown(1) && places[0] && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-[18%]">
            <div
              className="reward-rays h-full w-full rounded-full opacity-60"
              style={{
                background: "repeating-conic-gradient(from 0deg, rgba(251,191,36,0.55) 0deg 10deg, transparent 10deg 30deg)",
                maskImage: "radial-gradient(circle, black 15%, transparent 62%)",
                WebkitMaskImage: "radial-gradient(circle, black 15%, transparent 62%)",
              }}
            />
          </div>
        )}
        {COLUMN.map(({ place, face, top, text, medal, glow }) => {
          const p = places[place - 1];
          if (!p) return <div key={place} className="flex-1" />;
          const open = isShown(place);
          const isRolling = rolling === place;
          const big = place === 1;
          return (
            <div key={place} className="relative flex flex-1 flex-col items-center justify-end">
              {/* Personaj (yoki ochilishidan oldin — sirli siluet) */}
              <div className="relative z-10 -mb-3 flex flex-col items-center">
                {open && big && <Crown className="podium-crown h-12 w-12 text-amber-300 drop-shadow-[0_0_16px_rgba(251,191,36,0.9)] sm:h-16 sm:w-16" />}
                {open ? (
                  <div className="live-drop relative">
                    <span aria-hidden className="podium-burst absolute -inset-[20%] -z-10 rounded-full" style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 65%)` }} />
                    {p.team === undefined ? (
                      <CharacterSvg look={p.look} size={big ? charBig : charSmall} mood={shown === place ? "cheer" : "happy"} pedestal={false} className="drop-shadow-[0_14px_22px_rgba(0,0,0,0.5)]" />
                    ) : (
                      <div className="flex items-end -space-x-4">
                        {(p.members ?? []).slice(0, 5).map((m, k) => (
                          <CharacterSvg key={k} look={m.look} size={Math.round((big ? charBig : charSmall) * 0.55)} mood={shown === place ? "cheer" : "happy"} pedestal={false} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={cn("relative opacity-80", isRolling ? "podium-shake" : "podium-mystery")}>
                    <div style={{ filter: "brightness(0) drop-shadow(0 0 12px rgba(167,139,250,0.8))" }}>
                      <CharacterSvg look={p.team === undefined ? p.look : null} size={big ? charBig : charSmall} pedestal={false} still />
                    </div>
                    <span className="absolute inset-0 flex items-center justify-center text-6xl font-black text-violet-200/80">?</span>
                  </div>
                )}
              </div>
              {/* Ustun: yuqori yuza va old tomoni (medal, ism, ochko) */}
              <div className={cn("relative w-full transition-all duration-700 ease-out", open ? "translate-y-0" : "translate-y-4")}>
                <div className={cn("mx-auto h-5 w-full rounded-[50%] opacity-95", top)} />
                <div
                  className={cn(
                    "relative -mt-2.5 flex w-full flex-col items-center justify-start gap-0.5 overflow-hidden rounded-b-xl bg-gradient-to-b px-2 pb-2 pt-2 shadow-2xl",
                    // Jamoa rangi faqat e'lon qilingach — oldindan ustun rangidan g'olib bilinib qolmasin
                    p.team !== undefined && open ? TEAM_STYLES[p.team]?.bar : face,
                    text
                  )}
                  style={{ minHeight: pillarH[place], ...(open ? { boxShadow: `0 0 60px ${glow}` } : {}) }}
                >
                  <span className="reward-shine pointer-events-none absolute inset-0" />
                  <span className={cn("font-mono font-black leading-none", vh < 760 ? "text-3xl" : big ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl")}>{open ? medal : place}</span>
                  {open ? (
                    <div className="live-intro-up flex w-full flex-col items-center">
                      <span className={cn("max-w-full truncate font-black", vh < 760 ? "text-base sm:text-xl" : big ? "text-xl sm:text-3xl" : "text-base sm:text-2xl")}>{p.name}</span>
                      <span className="font-mono text-xs font-bold opacity-80 sm:text-base">{formatNumberUz(p.score)} ochko</span>
                      {p.coins > 0 && <span className="mt-0.5 rounded-full bg-black/15 px-2.5 py-0.5 text-xs font-black sm:text-sm">+{p.coins} coin</span>}
                      {p.members && p.members.length > 0 && (
                        <span className="inline-flex max-w-full items-center gap-1 truncate text-[11px] opacity-80">
                          <Users className="h-3 w-3 shrink-0" /> {p.members.map((m) => m.name.split(" ")[0]).join(", ")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-bold opacity-70">{isRolling ? "Kim ekan?…" : ""}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {shown === -1 && places.length === 0 && <p className="relative text-lg font-bold text-slate-300">Bu o&apos;yinda hech kim ochko to&apos;plamadi.</p>}

      {rest.length > 0 && (
        <ol className="live-pop relative grid w-full max-w-5xl shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3">
          {rest.map((p, i) => (
            <li key={p.id} className="flex h-9 items-center gap-2 rounded-xl bg-white/10 px-2.5 text-left text-sm backdrop-blur">
              <span className="w-5 font-mono font-black text-slate-400">{i + 4}</span>
              <CharacterSvg look={p.look} size={26} headOnly still />
              <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
              <span className="font-mono font-black">{formatNumberUz(p.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
