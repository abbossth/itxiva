"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Brain, Calculator, Crosshair, Gift, Hand, Palette, Sparkles, Timer, Zap } from "lucide-react";
import { submitMinigameAction, type LiveMinigameView, type LivePlayerState } from "@/actions/live-game.actions";
import { MINIGAMES, WHEEL, prizeOf, wheelPoints, wheelText, type MinigameKind } from "@/lib/live-game/minigames";
import { haptic } from "@/lib/haptics";
import { fireConfetti } from "@/lib/confetti";
import { playCheckInSound, playCorrectSound, playFanfare, playRewardSound, playTickSound, playWrongSound } from "@/lib/sound";
import { useCountdown } from "./live-ui";
import { PrizeWheel, WHEEL_SPIN_MS } from "./prize-wheel";
import { cn, formatNumberUz } from "@/lib/utils";

// Savollar orasidagi qisqa o'yinlar: proyektor (sanoq, jonli natija, g'ildirak) va o'quvchi qurilmasi.
// O'yinlar tez-tez bosishga emas, fikrlash va aniqlikka qurilgan: xato bosish vaqt oladi (pauza / muzlash).

const ICONS: Record<MinigameKind, typeof Hand> = {
  tap: Hand,
  target: Crosshair,
  wheel: Gift,
  bonus: Zap,
  memory: Brain,
  math: Calculator,
  colors: Palette,
  reaction: Timer,
};
const GRADIENT: Record<MinigameKind, string> = {
  tap: "from-orange-500 to-rose-600",
  target: "from-sky-500 to-cyan-600",
  wheel: "from-fuchsia-500 to-violet-600",
  bonus: "from-amber-400 to-orange-500",
  memory: "from-violet-500 to-indigo-600",
  math: "from-emerald-500 to-teal-600",
  colors: "from-pink-500 to-orange-500",
  reaction: "from-lime-500 to-emerald-600",
};
const WHEEL_SEGMENTS = WHEEL.map((w) => ({ label: w.label, icon: w.icon, color: w.color }));

/** Natija qanday ko'rsatiladi */
function valueLabel(kind: MinigameKind, value: number): string {
  switch (kind) {
    case "reaction":
      return value > 0 ? `${(value / 1000).toFixed(3)} s` : "—";
    case "memory":
      return `${value} bosqich`;
    case "target":
      return `${value} nishon`;
    case "tap":
      return `${value} marta`;
    default:
      return `${value} ta to'g'ri`;
  }
}

function Title({ kind, big = false }: { kind: MinigameKind; big?: boolean }) {
  const Icon = ICONS[kind];
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className={cn("quiz-pulse flex items-center justify-center rounded-3xl bg-gradient-to-br shadow-xl", GRADIENT[kind], big ? "h-24 w-24" : "h-16 w-16")}>
        <Icon className={big ? "h-12 w-12" : "h-8 w-8"} />
      </span>
      <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Qisqa o&apos;yin</p>
      <h2 className={cn("font-black", big ? "text-4xl sm:text-6xl" : "text-3xl")}>{MINIGAMES[kind].title}</h2>
      <p className={cn("max-w-xl text-slate-300", big ? "text-lg sm:text-xl" : "text-sm")}>{MINIGAMES[kind].rule}</p>
    </div>
  );
}

function Countdown({ ms }: { ms: number }) {
  const n = Math.max(1, Math.ceil(ms / 1000));
  return (
    <span key={n} className="quiz-count font-mono text-8xl font-black tabular-nums text-white sm:text-9xl">
      {n}
    </span>
  );
}

function Clock({ remaining }: { remaining: number }) {
  return <span className={cn("font-mono text-3xl font-black tabular-nums", remaining <= 3000 && "text-rose-400")}>{Math.ceil(remaining / 1000)}</span>;
}

// ---------------- Proyektor ----------------

export function MinigameHost({ m, sound }: { m: LiveMinigameView; sound: boolean }) {
  const starts = useCountdown(m.startsInMs, m.startsInMs > 0);
  const remaining = useCountdown(m.remainingMs, !m.ended && m.startsInMs === 0);
  const playing = starts <= 0 && !m.ended;
  const lastTick = useRef(99);

  useEffect(() => {
    const secs = Math.ceil((playing ? remaining : starts) / 1000);
    if (sound && secs > 0 && secs <= 3 && secs < lastTick.current) playTickSound();
    lastTick.current = secs;
  }, [starts, remaining, playing, sound]);

  useEffect(() => {
    if (m.ended && sound) playFanfare();
  }, [m.ended, sound]);

  if (starts > 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 py-4">
        <Title kind={m.kind} big />
        <Countdown ms={starts} />
      </div>
    );
  }

  if (m.kind === "bonus") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 py-6 text-center">
        <div className="live-banner rounded-[2rem] bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-10 py-8 text-slate-950">
          <p className="text-sm font-black uppercase tracking-[0.4em]">Bonus raund</p>
          <p className="font-mono text-8xl font-black sm:text-9xl">×2</p>
        </div>
        <p className="text-2xl font-black sm:text-3xl">Keyingi savol ikki baravar ochko beradi!</p>
      </div>
    );
  }

  if (m.kind === "wheel") return <WheelHost m={m} sound={sound} />;

  const Icon = ICONS[m.kind];
  const played = m.progress.filter((p) => p.played && (m.kind !== "reaction" || p.value > 0));
  const top = played.slice(0, 8);
  // Reaksiyada eng tezi — eng uzun chiziq
  const width = (v: number) => {
    if (m.kind === "reaction") {
      const best = Math.min(...top.map((p) => p.value));
      return v > 0 ? Math.max(8, (best / v) * 100) : 6;
    }
    const max = Math.max(1, ...top.map((p) => p.value));
    return Math.max(6, (v / max) * 100);
  };
  return (
    <div className="flex h-full flex-col gap-4 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br", GRADIENT[m.kind])}>
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-2xl font-black sm:text-4xl">{MINIGAMES[m.kind].title}</p>
            <p className="text-sm text-slate-300">{MINIGAMES[m.kind].rule}</p>
          </div>
        </div>
        {!m.ended ? (
          <span className={cn("font-mono text-5xl font-black tabular-nums sm:text-7xl", remaining <= 3000 && "text-rose-400 quiz-shake")}>{Math.ceil(remaining / 1000)}</span>
        ) : (
          <span className="live-pop rounded-full bg-emerald-500 px-4 py-2 text-lg font-black">Tugadi!</span>
        )}
      </div>
      <ol className="space-y-2">
        {top.length === 0 && <p className="py-10 text-center text-slate-400">Telefonlarda o&apos;ynashni boshlang!</p>}
        {top.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className="w-8 text-right font-mono text-lg font-black text-slate-400">{i === 0 ? "👑" : i + 1}</span>
            <span className="w-32 shrink-0 truncate text-lg font-black sm:w-48">{p.name}</span>
            <div className="h-10 flex-1 overflow-hidden rounded-xl bg-white/10">
              <div
                className={cn("flex h-full items-center justify-end whitespace-nowrap rounded-xl bg-gradient-to-r px-3 font-mono font-black transition-[width] duration-700", GRADIENT[m.kind])}
                style={{ width: `${width(p.value)}%` }}
              >
                {valueLabel(m.kind, p.value)}
              </div>
            </div>
            {m.ended && p.points > 0 && <span className="live-pop w-20 font-mono font-black text-emerald-300">+{formatNumberUz(p.points)}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function WheelHost({ m, sound }: { m: LiveMinigameView; sound: boolean }) {
  // Proyektorda natijalar o'quvchilar g'ildiragi to'xtagandan keyin ochiladi
  const [done, setDone] = useState(false);
  const rank = (effect: string) => (prizeOf(effect as never) ? 1000 : 0) + wheelPoints(effect as never) + (effect === "double" ? 50 : 0);
  const results = m.progress
    .filter((p) => p.played)
    .map((p) => ({ ...p, seg: WHEEL[p.value] ?? WHEEL[WHEEL.length - 1] }))
    .sort((a, b) => rank(b.seg.effect) - rank(a.seg.effect));
  const showcase = results[0]?.value ?? 0;
  useEffect(() => {
    if (!sound) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += 55 + i * i * 0.42;
      if (t > WHEEL_SPIN_MS - 200) break;
      timers.push(setTimeout(() => playCheckInSound(1), t));
    }
    return () => timers.forEach(clearTimeout);
  }, [sound]);
  const finish = useCallback(() => {
    setDone(true);
    if (results.some((r) => prizeOf(r.seg.effect))) {
      void fireConfetti({ particleCount: 160, spread: 100, origin: { y: 0.4 } });
      if (sound) playRewardSound();
    }
  }, [results, sound]);
  const winners = results.filter((r) => prizeOf(r.seg.effect));
  return (
    <div className="flex h-full flex-col items-center gap-5 py-2 lg:flex-row lg:items-start lg:gap-10">
      <div className="flex shrink-0 flex-col items-center gap-3">
        <PrizeWheel segments={WHEEL_SEGMENTS} segment={showcase} spinning size={300} onDone={finish} />
        <p className="max-w-xs text-center text-sm text-slate-300">Har kim telefonida o&apos;z g&apos;ildiragini aylantirmoqda — 🎁 Super priz va 🎡 Super baraban ham bor!</p>
      </div>
      <div className="min-h-0 w-full flex-1 space-y-3">
        {done && winners.length > 0 && (
          <div className="live-banner rounded-3xl bg-gradient-to-r from-amber-400 via-yellow-300 to-pink-400 px-5 py-4 text-slate-950">
            <p className="text-xs font-black uppercase tracking-[0.35em]">Super sovg&apos;a</p>
            <p className="text-2xl font-black">{winners.map((w) => `${w.seg.icon} ${w.name}`).join("  ·  ")}</p>
            <p className="text-sm font-semibold">O&apos;yin oxirida sovg&apos;asini ochadi — coin yutadi!</p>
          </div>
        )}
        <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Kimga nima tushdi</p>
        {!done && !m.ended ? (
          <p className="animate-pulse text-3xl font-black">Aylanmoqda…</p>
        ) : (
          <ul className="live-noscroll grid max-h-full gap-2 overflow-y-auto sm:grid-cols-2">
            {results.map((r, i) => (
              <li
                key={r.id}
                className={cn(
                  "live-pop flex items-center gap-3 rounded-2xl px-4 py-2.5",
                  prizeOf(r.seg.effect)
                    ? "bg-gradient-to-r from-amber-400 to-pink-400 text-slate-950"
                    : r.seg.effect === "p500"
                      ? "bg-gradient-to-r from-rose-500 to-amber-400 text-slate-950"
                      : "bg-white/10"
                )}
                style={{ animationDelay: `${Math.min(i, 12) * 120}ms` }}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.seg.color }} />
                <span className="min-w-0 flex-1 truncate text-lg font-black">{r.name}</span>
                <span className="font-mono text-lg font-black">
                  {r.seg.icon} {r.seg.label}
                </span>
              </li>
            ))}
            {results.length === 0 && <li className="text-slate-400">Hali hech kim yo&apos;q</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------- O'quvchi ----------------

type PlayerMinigame = NonNullable<LivePlayerState["minigame"]>;

export function MinigamePlayer({ gameId, m }: { gameId: string; m: PlayerMinigame }) {
  const mounted = useMounted();
  const starts = useCountdown(m.startsInMs, m.startsInMs > 0);
  const remaining = useCountdown(m.remainingMs, !m.ended && m.startsInMs === 0);
  const playing = starts <= 0 && remaining > 0 && !m.ended;

  if (starts > 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8">
        <Title kind={m.kind} />
        <Countdown ms={starts} />
      </div>
    );
  }
  if (m.kind === "bonus") {
    return (
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="live-banner rounded-3xl bg-gradient-to-r from-amber-400 to-yellow-300 px-8 py-6 text-slate-950">
          <p className="text-xs font-black uppercase tracking-[0.35em]">Bonus raund</p>
          <p className="font-mono text-7xl font-black">×2</p>
        </div>
        <p className="text-xl font-black">Keyingi savolda ochko ikki baravar!</p>
      </div>
    );
  }
  if (m.kind === "wheel") return <WheelPlayer m={m} remaining={remaining} />;
  if (m.ended || remaining <= 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Sparkles className="h-12 w-12 text-amber-300" />
        <p className="text-3xl font-black lg:text-5xl">{m.ended ? "Natija" : "Vaqt tugadi!"}</p>
        <p className="font-mono text-xl text-slate-300 lg:text-3xl">{m.myValue >= 0 ? valueLabel(m.kind, m.myValue) : "Qatnashmadingiz"}</p>
        {m.ended && m.myPoints > 0 && <p className="live-pop font-mono text-4xl font-black text-emerald-300 lg:text-6xl">+{formatNumberUz(m.myPoints)}</p>}
        {m.ended && m.place > 0 && <p className="text-lg font-black">{m.place === 1 ? "👑 Eng zo'ri siz!" : `${m.place}-o'rin`}</p>}
      </div>
    );
  }
  const props = { gameId, round: m.round, remaining, active: playing };
  if (!mounted) return <div className="min-h-[50vh]" />;
  switch (m.kind) {
    case "memory":
      return <MemoryGame {...props} />;
    case "math":
      return <ChoiceGame {...props} make={makeMath} title="Tez hisob" />;
    case "colors":
      return <ChoiceGame {...props} make={makeColors} title="Rang tuzog'i" />;
    case "reaction":
      return <ReactionGame {...props} />;
    case "tap":
    case "target":
    default:
      return <TargetGame {...props} />;
  }
}

const noop = () => () => {};
/** Brauzerda chizilganmi: tasodifiy o'yin (misol, ketma-ketlik) server HTMLida bo'lmasin — aks holda hydration farqi */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Natijani muntazam yuboradi (oxirida ham) — server eng yaxshisini oladi */
function useReporter(gameId: string, round: number, value: number, active: boolean) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  // Bir vaqtda bittadan: server amallari navbat bilan bajariladi — sekin internetda to'planib qolsa,
  // keyingi amallar (savolga javob) ham kutib qoladi. Oldingisi kelmagan bo'lsa — bu safar yuborilmaydi
  const busy = useRef(false);
  const sentValue = useRef(-1);
  const send = useCallback(() => {
    if (busy.current || ref.current === sentValue.current) return;
    busy.current = true;
    const v = ref.current;
    void submitMinigameAction(gameId, round, v)
      .then((r) => {
        if (r?.success) sentValue.current = v;
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false;
      });
  }, [gameId, round]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(send, 1500);
    return () => {
      clearInterval(id);
      // Oxirgi natija — har holda yuboriladi (oldingisi yo'lda bo'lsa ham)
      if (ref.current !== sentValue.current) void submitMinigameAction(gameId, round, ref.current).catch(() => {});
    };
  }, [active, send, gameId, round]);
}

interface GameProps {
  gameId: string;
  round: number;
  remaining: number;
  active: boolean;
}

/* ---------- Mo'ljal: oddiy, oltin (+3) va bomba (2 soniya muzlash) ---------- */

type TargetKind = "normal" | "gold" | "bomb";

function TargetGame({ gameId, round, remaining, active }: GameProps) {
  const [hits, setHits] = useState(0);
  const [item, setItem] = useState<{ x: number; y: number; kind: TargetKind; key: number }>({ x: 50, y: 50, kind: "normal", key: 0 });
  // Muzlash: har bombada ortadigan hisoblagich (0 — muzlamagan)
  const [frozenUntil, setFrozenUntil] = useState(0);
  const freezes = useRef(0);
  const [pop, setPop] = useState<{ text: string; x: number; y: number; key: number } | null>(null);
  useReporter(gameId, round, hits, active);
  const frozen = frozenUntil > 0;

  const next = useCallback(() => {
    const r = Math.random();
    const kind: TargetKind = r < 0.16 ? "gold" : r < 0.34 ? "bomb" : "normal";
    setItem((p) => ({ x: 10 + Math.random() * 80, y: 12 + Math.random() * 76, kind, key: p.key + 1 }));
  }, []);
  // Nishon o'zi ham joy almashtiradi: oltin tezroq qochadi
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(next, item.kind === "gold" ? 750 : 1250);
    return () => clearTimeout(id);
  }, [active, next, item.key, item.kind]);
  useEffect(() => {
    if (!frozen) return;
    const id = setTimeout(() => setFrozenUntil(0), 2000);
    return () => clearTimeout(id);
  }, [frozen, frozenUntil]);

  const hit = () => {
    if (!active || frozen) return;
    if (item.kind === "bomb") {
      freezes.current += 1;
      setFrozenUntil(freezes.current);
      setPop({ text: "❄️ 2 s", x: item.x, y: item.y, key: item.key });
      haptic([60, 40, 60]);
      playWrongSound();
    } else {
      const gain = item.kind === "gold" ? 3 : 1;
      setHits((n) => n + gain);
      setPop({ text: `+${gain}`, x: item.x, y: item.y, key: item.key });
      haptic([12]);
    }
    next();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-300">
          Urildi: <span className="font-mono text-2xl font-black text-white">{hits}</span>
        </span>
        <span className="text-xs text-slate-400">🎯 +1 · 🥇 +3 · 💣 muzlatadi</span>
        <Clock remaining={remaining} />
      </div>
      <div
        className={cn(
          "relative h-[58vh] min-h-[280px] w-full touch-none select-none overflow-hidden rounded-3xl ring-1 ring-white/10",
          frozen ? "live-freeze bg-sky-300/20" : "bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.15),transparent_70%)]"
        )}
      >
        {frozen && <p className="absolute inset-0 z-10 flex items-center justify-center text-4xl font-black text-sky-100">❄️ Muzladingiz!</p>}
        <button
          key={item.key}
          type="button"
          aria-label={item.kind === "bomb" ? "Bomba" : "Nishon"}
          onPointerDown={(e) => {
            e.preventDefault();
            hit();
          }}
          className={cn(
            "live-pop absolute flex -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full",
            item.kind === "bomb"
              ? "h-16 w-16 bg-slate-900 text-3xl ring-4 ring-rose-500 lg:h-20 lg:w-20"
              : item.kind === "gold"
                ? "h-12 w-12 bg-[radial-gradient(circle,#fff7cc_0_20%,#facc15_21%_45%,#fff7cc_46%_60%,#eab308_61%_100%)] shadow-[0_0_30px_rgba(250,204,21,0.9)] lg:h-14 lg:w-14"
                : "h-16 w-16 bg-[radial-gradient(circle,#fff_0_18%,#ef4444_19%_38%,#fff_39%_56%,#ef4444_57%_100%)] shadow-[0_0_24px_rgba(239,68,68,0.6)] lg:h-20 lg:w-20"
          )}
          style={{ left: `${item.x}%`, top: `${item.y}%` }}
        >
          {item.kind === "bomb" ? "💣" : null}
        </button>
        {pop && (
          <span
            key={`p${pop.key}`}
            className="live-float pointer-events-none absolute -translate-x-1/2 text-2xl font-black text-amber-200"
            style={{ left: `${pop.x}%`, top: `${Math.max(4, pop.y - 10)}%` }}
          >
            {pop.text}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- Xotira: chiroqlar ketma-ketligini takrorlash ---------- */

const PADS = [
  { color: "bg-rose-500", glow: "shadow-[0_0_50px_rgba(244,63,94,0.9)]", note: 0 },
  { color: "bg-amber-400", glow: "shadow-[0_0_50px_rgba(251,191,36,0.9)]", note: 1 },
  { color: "bg-emerald-500", glow: "shadow-[0_0_50px_rgba(16,185,129,0.9)]", note: 2 },
  { color: "bg-sky-500", glow: "shadow-[0_0_50px_rgba(14,165,233,0.9)]", note: 3 },
];
const START_LENGTH = 3;

const randomPads = (length: number, base: number[] = []) => {
  const seq = [...base];
  while (seq.length < length) seq.push(Math.floor(Math.random() * PADS.length));
  return seq;
};

function MemoryGame({ gameId, round, remaining, active }: GameProps) {
  const [sequence, setSequence] = useState<number[]>(() => randomPads(START_LENGTH));
  const [step, setStep] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [phase, setPhase] = useState<"show" | "input" | "fail" | "ok">("show");
  const [best, setBest] = useState(0);
  useReporter(gameId, round, best, active);

  const newSequence = useCallback((length: number, base: number[] = []) => {
    setSequence(randomPads(length, base));
    setStep(0);
    setPhase("show");
  }, []);

  // Ketma-ketlikni ko'rsatish: uzun bo'lgani sari tezlashadi
  useEffect(() => {
    if (phase !== "show" || sequence.length === 0) return;
    const on = Math.max(260, 520 - sequence.length * 25);
    const timers: ReturnType<typeof setTimeout>[] = [];
    sequence.forEach((pad, i) => {
      timers.push(setTimeout(() => setLit(pad), 500 + i * (on + 160)));
      timers.push(setTimeout(() => setLit(null), 500 + i * (on + 160) + on));
    });
    timers.push(setTimeout(() => setPhase("input"), 500 + sequence.length * (on + 160)));
    return () => timers.forEach(clearTimeout);
  }, [phase, sequence]);

  const press = (pad: number) => {
    if (!active || phase !== "input") return;
    setLit(pad);
    setTimeout(() => setLit(null), 160);
    if (sequence[step] !== pad) {
      setPhase("fail");
      haptic([60, 40, 60]);
      playWrongSound();
      // Xatodan keyin — xuddi shu uzunlikdagi yangi ketma-ketlik
      setTimeout(() => newSequence(Math.max(START_LENGTH, sequence.length - 1)), 900);
      return;
    }
    haptic([10]);
    if (step + 1 === sequence.length) {
      setBest((b) => Math.max(b, sequence.length));
      setPhase("ok");
      playCorrectSound();
      setTimeout(() => newSequence(sequence.length + 1, sequence), 700);
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-bold text-slate-300">
          Eng yaxshi: <span className="font-mono text-2xl font-black text-white">{best}</span>
        </span>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-sm font-black",
            phase === "show" ? "bg-white/10" : phase === "input" ? "bg-emerald-500/30 text-emerald-200" : phase === "ok" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
          )}
        >
          {phase === "show" ? `👀 Eslab qoling (${sequence.length})` : phase === "input" ? `👆 Takrorlang ${step}/${sequence.length}` : phase === "ok" ? "✅ Zo'r!" : "❌ Xato"}
        </span>
        <Clock remaining={remaining} />
      </div>
      <div className="grid w-[min(80vw,420px)] grid-cols-2 gap-3">
        {PADS.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Chiroq ${i + 1}`}
            disabled={phase !== "input"}
            onPointerDown={(e) => {
              e.preventDefault();
              press(i);
            }}
            className={cn(
              "aspect-square rounded-3xl transition-all duration-150 disabled:cursor-default",
              p.color,
              lit === i ? cn("scale-105 brightness-125", p.glow) : "opacity-45"
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Tanlovli o'yinlar: tez hisob va rang tuzog'i ---------- */

interface Challenge {
  prompt: React.ReactNode;
  options: { label: string; key: string }[];
  answer: string;
}

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/** Misol: daraja oshgani sari qiyinlashadi */
function makeMath(level: number): Challenge {
  const op = level < 3 ? (Math.random() < 0.5 ? "+" : "−") : (["+", "−", "×"] as const)[rnd(0, 2)];
  let a: number;
  let b: number;
  let answer: number;
  if (op === "×") {
    a = rnd(2, 9);
    b = rnd(2, level < 6 ? 9 : 12);
    answer = a * b;
  } else if (op === "+") {
    a = rnd(5, 20 + level * 6);
    b = rnd(5, 20 + level * 6);
    answer = a + b;
  } else {
    a = rnd(10, 30 + level * 6);
    b = rnd(2, a - 1);
    answer = a - b;
  }
  const near = new Set<number>([answer]);
  while (near.size < 4) {
    const d = answer + (Math.random() < 0.5 ? -1 : 1) * rnd(1, op === "×" ? Math.max(2, a) : 10);
    if (d >= 0) near.add(d);
  }
  return {
    prompt: (
      <span className="font-mono">
        {a} {op} {b} = ?
      </span>
    ),
    options: shuffle([...near]).map((n) => ({ label: String(n), key: String(n) })),
    answer: String(answer),
  };
}

const COLORS = [
  { name: "QIZIL", hex: "#ef4444" },
  { name: "KO'K", hex: "#3b82f6" },
  { name: "YASHIL", hex: "#22c55e" },
  { name: "SARIQ", hex: "#facc15" },
  { name: "BINAFSHA", hex: "#a855f7" },
  { name: "OQ", hex: "#f8fafc" },
];

/** So'z bir rangni aytadi, lekin boshqa rangda yozilgan — RANG tanlanadi */
function makeColors(): Challenge {
  const ink = rnd(0, COLORS.length - 1);
  let word = rnd(0, COLORS.length - 1);
  if (Math.random() < 0.8) while (word === ink) word = rnd(0, COLORS.length - 1);
  const others = shuffle(COLORS.map((_, i) => i).filter((i) => i !== ink && i !== word)).slice(0, word === ink ? 3 : 2);
  const opts = shuffle([ink, ...(word === ink ? [] : [word]), ...others]);
  return {
    prompt: (
      <span className="tracking-wider" style={{ color: COLORS[ink].hex }}>
        {COLORS[word].name}
      </span>
    ),
    options: opts.map((i) => ({ label: COLORS[i].name, key: String(i) })),
    answer: String(ink),
  };
}

const LOCK_MS = 1500;

function ChoiceGame({ gameId, round, remaining, active, make, title }: GameProps & { make: (level: number) => Challenge; title: string }) {
  const [score, setScore] = useState(0);
  const [challenge, setChallenge] = useState<Challenge>(() => make(0));
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; key: number } | null>(null);
  useReporter(gameId, round, score, active);

  const pick = (key: string) => {
    if (!active || locked) return;
    const ok = key === challenge.answer;
    setFlash((f) => ({ ok, key: (f?.key ?? 0) + 1 }));
    if (ok) {
      haptic([10]);
      setScore((s) => s + 1);
      setChallenge(make(score + 1));
    } else {
      haptic([60, 40, 60]);
      playWrongSound();
      setLocked(true);
      setTimeout(() => {
        setLocked(false);
        setChallenge(make(score));
      }, LOCK_MS);
    }
  };

  return (
    <div className="relative flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-300">
          {title}: <span className="font-mono text-2xl font-black text-white">{score}</span>
        </span>
        <Clock remaining={remaining} />
      </div>
      <div
        className={cn(
          "relative flex min-h-[26vh] items-center justify-center overflow-hidden rounded-3xl bg-white/5 px-4 text-center text-5xl font-black ring-1 ring-white/10 lg:text-7xl",
          locked && "live-freeze"
        )}
      >
        {flash && <span key={flash.key} className={cn("live-flash absolute inset-0", flash.ok ? "bg-emerald-500/40" : "bg-rose-500/50")} />}
        <span className="relative">{locked ? "⏳" : challenge.prompt}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {challenge.options.map((o) => (
          <button
            key={o.key + o.label}
            type="button"
            disabled={locked}
            onClick={() => pick(o.key)}
            className="min-h-[64px] rounded-2xl bg-white/10 px-3 text-xl font-black text-white ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95 disabled:opacity-40 lg:min-h-[84px] lg:text-3xl"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Reaksiya: yashil yonganda bir marta bosish ---------- */

const ATTEMPTS = 3;

function ReactionGame({ gameId, round, remaining, active }: GameProps) {
  const [state, setState] = useState<"wait" | "go" | "early" | "result" | "done">("wait");
  const [times, setTimes] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const goAt = useRef(0);
  const best = useMemo(() => (times.length ? Math.min(...times) : 0), [times]);
  useReporter(gameId, round, best, active);
  const attempt = times.length + (state === "early" ? 1 : 0);

  // Har urinish: tasodifiy kutish, keyin yashil
  useEffect(() => {
    if (!active || state !== "wait") return;
    const id = setTimeout(() => {
      goAt.current = performance.now();
      setState("go");
    }, 1200 + Math.random() * 2300);
    return () => clearTimeout(id);
  }, [active, state, times.length]);

  const press = () => {
    if (!active) return;
    if (state === "wait") {
      setState("early");
      haptic([60, 40, 60]);
      playWrongSound();
      setTimeout(() => setState("wait"), 1100);
    } else if (state === "go") {
      const ms = Math.round(performance.now() - goAt.current);
      const next = [...times, ms];
      setTimes(next);
      setLast(ms);
      haptic([12]);
      playCorrectSound();
      setState(next.length >= ATTEMPTS ? "done" : "result");
      if (next.length < ATTEMPTS) setTimeout(() => setState("wait"), 1200);
    }
  };

  const bg =
    state === "go"
      ? "bg-emerald-500"
      : state === "early"
        ? "bg-rose-600"
        : state === "wait"
          ? "bg-slate-800"
          : "bg-sky-700";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-300">
          Urinish: <span className="font-mono text-xl font-black text-white">{Math.min(attempt + (state === "wait" || state === "go" ? 1 : 0), ATTEMPTS)}/{ATTEMPTS}</span>
        </span>
        {best > 0 && <span className="font-mono text-sm font-black text-emerald-300">Eng yaxshi: {(best / 1000).toFixed(3)} s</span>}
        <Clock remaining={remaining} />
      </div>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          press();
        }}
        className={cn("flex h-[56vh] min-h-[280px] w-full select-none flex-col items-center justify-center gap-2 rounded-3xl text-center font-black transition-colors touch-none", bg)}
      >
        {state === "wait" && (
          <>
            <span className="text-5xl lg:text-7xl">✋</span>
            <span className="text-3xl lg:text-5xl">Kuting…</span>
            <span className="text-sm font-semibold text-slate-300">Yashil bo&apos;lishi bilan bir marta bosing</span>
          </>
        )}
        {state === "go" && <span className="text-6xl lg:text-8xl">BOS!</span>}
        {state === "early" && (
          <>
            <span className="text-4xl lg:text-6xl">Erta bosdingiz!</span>
            <span className="text-sm font-semibold">Yashilni kuting</span>
          </>
        )}
        {(state === "result" || state === "done") && last !== null && (
          <>
            <span className="font-mono text-6xl lg:text-8xl">{(last / 1000).toFixed(3)} s</span>
            <span className="text-lg">{state === "done" ? `Tayyor! Eng yaxshisi: ${(best / 1000).toFixed(3)} s` : "Keyingi urinish…"}</span>
          </>
        )}
      </button>
    </div>
  );
}

/* ---------- Omad g'ildiragi: o'quvchi o'zi aylantiradi ---------- */

function WheelPlayer({ m, remaining }: { m: PlayerMinigame; remaining: number }) {
  const [tapped, setTapped] = useState(false);
  const [stopped, setStopped] = useState(false);
  // O'quvchi bosmasa ham vaqt tugashidan oldin o'zi aylanadi
  const spinning = tapped || remaining <= WHEEL_SPIN_MS + 800;

  const seg = WHEEL[m.myValue] ?? WHEEL[WHEEL.length - 1];
  const prize = prizeOf(seg.effect);
  const onDone = useCallback(() => {
    setStopped(true);
    if (prize || seg.effect === "p500") {
      void fireConfetti({ particleCount: 140, spread: 90, origin: { y: 0.45 } });
      playRewardSound();
      haptic([40, 30, 40, 30, 80]);
    } else if (seg.effect !== "none") {
      playCorrectSound();
    }
  }, [prize, seg.effect]);

  // Kech qo'shilgan o'quvchida bu round uchun g'ildirak yo'q
  if (m.myValue < 0) {
    return <p className="py-14 text-center text-xl font-black">Omad g&apos;ildiragi aylanmoqda — keyingi safar siz ham qatnashasiz!</p>;
  }
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Sizning g&apos;ildiragingiz</p>
      <PrizeWheel segments={WHEEL_SEGMENTS} segment={m.myValue} spinning={spinning} size={280} onDone={onDone} />
      {!spinning ? (
        <button
          type="button"
          onClick={() => {
            setTapped(true);
            haptic([20]);
          }}
          className="quiz-pulse rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-pink-400 px-10 py-4 text-2xl font-black text-slate-950 shadow-[0_0_40px_rgba(251,191,36,0.6)]"
        >
          🎡 AYLANTIRISH
        </button>
      ) : stopped ? (
        <p
          className={cn(
            "live-banner rounded-2xl px-6 py-3 text-2xl font-black lg:text-4xl",
            seg.effect === "none"
              ? "bg-white/15 text-white"
              : prize
                ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-pink-400 text-slate-950"
                : seg.effect === "p500"
                  ? "bg-gradient-to-r from-rose-500 to-amber-400 text-slate-950"
                  : "bg-white text-slate-900"
          )}
        >
          {seg.effect === "none" ? "😅 " : `${seg.icon} `}
          {wheelText(seg.effect)}
        </p>
      ) : (
        <p className="animate-pulse text-xl font-black">Aylanmoqda…</p>
      )}
    </div>
  );
}
