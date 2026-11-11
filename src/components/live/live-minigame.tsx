"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Gift, Hand, Sparkles, Zap } from "lucide-react";
import { submitMinigameAction, type LiveMinigameView, type LivePlayerState } from "@/actions/live-game.actions";
import { MINIGAMES, WHEEL, type MinigameKind } from "@/lib/live-game/minigames";
import { haptic } from "@/lib/haptics";
import { playCheckInSound, playFanfare, playTickSound } from "@/lib/sound";
import { useCountdown } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

// Savollar orasidagi qisqa o'yinlar: proyektor (sanoq, jonli natija, g'ildirak) va o'quvchi qurilmasi (bosish, nishon).

const ICONS: Record<MinigameKind, typeof Hand> = { tap: Hand, target: Crosshair, wheel: Gift, bonus: Zap };
const GRADIENT: Record<MinigameKind, string> = {
  tap: "from-orange-500 to-rose-600",
  target: "from-sky-500 to-cyan-600",
  wheel: "from-fuchsia-500 to-violet-600",
  bonus: "from-amber-400 to-orange-500",
};
const WHEEL_SPIN_MS = 5000;

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

/** G'ildirak: server tanlagan segmentga to'xtaydi (ko'rsatkich tepada) */
function Wheel({ segment, spinning, size = 320 }: { segment: number; spinning: boolean; size?: number }) {
  const n = WHEEL.length;
  const slice = 360 / n;
  const target = 360 * 6 + (360 - (segment * slice + slice / 2));
  const gradient = WHEEL.map((w, i) => `${w.color} ${i * slice}deg ${(i + 1) * slice}deg`).join(", ");
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!spinning) return;
    const t = setTimeout(() => setTurn(target), 50);
    return () => clearTimeout(t);
  }, [spinning, target]);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute left-1/2 top-[-14px] z-10 h-0 w-0 -translate-x-1/2 border-x-[16px] border-t-[28px] border-x-transparent border-t-white drop-shadow-lg" />
      <div
        className="h-full w-full rounded-full border-8 border-white/90 shadow-[0_0_60px_rgba(217,70,239,0.45)]"
        style={{
          background: `conic-gradient(${gradient})`,
          transform: `rotate(${turn}deg)`,
          transition: `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`,
        }}
      >
        {WHEEL.map((w, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 origin-left font-black text-white drop-shadow"
            style={{ transform: `rotate(${i * slice + slice / 2 - 90}deg) translateX(${size * 0.18}px)`, fontSize: size * 0.06 }}
          >
            {w.label}
          </span>
        ))}
      </div>
      <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-slate-900 shadow-xl" />
    </div>
  );
}

// ---------------- Proyektor ----------------

export function MinigameHost({ m, sound }: { m: LiveMinigameView; sound: boolean }) {
  const starts = useCountdown(m.startsInMs, m.startsInMs > 0);
  const remaining = useCountdown(m.remainingMs, !m.ended && m.startsInMs === 0);
  const playing = starts <= 0 && !m.ended;
  const lastTick = useRef(99);

  useEffect(() => {
    const secs = Math.ceil((playing ? remaining : starts) / 1000);
    if (sound && secs > 0 && secs <= (playing ? 3 : 3) && secs < lastTick.current) playTickSound();
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

  if (m.kind === "wheel") {
    return <WheelHost m={m} sound={sound} />;
  }

  const top = m.progress.slice(0, 8);
  const max = Math.max(1, ...top.map((p) => p.value));
  return (
    <div className="flex h-full flex-col gap-4 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br", GRADIENT[m.kind])}>
            {m.kind === "tap" ? <Hand className="h-6 w-6" /> : <Crosshair className="h-6 w-6" />}
          </span>
          <p className="text-2xl font-black sm:text-4xl">{MINIGAMES[m.kind].title}</p>
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
            <span className="w-8 text-right font-mono text-lg font-black text-slate-400">{i + 1}</span>
            <span className="w-32 shrink-0 truncate text-lg font-black sm:w-48">{p.name}</span>
            <div className="h-10 flex-1 overflow-hidden rounded-xl bg-white/10">
              <div
                className={cn("flex h-full items-center justify-end rounded-xl bg-gradient-to-r px-3 font-mono font-black transition-[width] duration-700", GRADIENT[m.kind])}
                style={{ width: `${Math.max(6, (p.value / max) * 100)}%` }}
              >
                {p.value}
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
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (sound) {
      // Aylanayotganda tiqillash, sekinlashib boradi
      const timers: ReturnType<typeof setTimeout>[] = [];
      let t = 0;
      for (let i = 0; i < 26; i++) {
        t += 60 + i * i * 0.45;
        timers.push(setTimeout(() => playCheckInSound(1), t));
        if (t > WHEEL_SPIN_MS - 200) break;
      }
      return () => timers.forEach(clearTimeout);
    }
  }, [sound]);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), WHEEL_SPIN_MS + 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-4 lg:flex-row lg:gap-14">
      <Wheel segment={m.wheel?.segment ?? 0} spinning size={300} />
      <div className="text-center lg:text-left">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Omad g&apos;ildiragi</p>
        {done || m.ended ? (
          <p className="live-banner mt-3 max-w-md rounded-2xl bg-white px-6 py-4 text-2xl font-black text-slate-900 sm:text-3xl">{m.wheel?.text ?? "Omad keyingi safar!"}</p>
        ) : (
          <p className="mt-3 animate-pulse text-3xl font-black">Aylanmoqda…</p>
        )}
      </div>
    </div>
  );
}

// ---------------- O'quvchi ----------------

type PlayerMinigame = NonNullable<LivePlayerState["minigame"]>;

export function MinigamePlayer({ gameId, m }: { gameId: string; m: PlayerMinigame }) {
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
  if (m.kind === "wheel") {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <Wheel segment={m.wheel?.segment ?? 0} spinning size={220} />
        {m.ended ? (
          m.wheelIsMe ? (
            <p className="live-banner rounded-2xl bg-white px-5 py-3 text-2xl font-black text-slate-900">🎉 Sizga tushdi! {m.wheel?.text}</p>
          ) : (
            <p className="text-lg font-black">{m.wheel?.text}</p>
          )
        ) : (
          <p className="animate-pulse text-xl font-black">G&apos;ildirak aylanmoqda… proyektorga qarang!</p>
        )}
      </div>
    );
  }
  if (m.ended || remaining <= 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Sparkles className="h-12 w-12 text-amber-300" />
        <p className="text-3xl font-black lg:text-5xl">{m.ended ? "Natija" : "Vaqt tugadi!"}</p>
        <p className="font-mono text-xl text-slate-300 lg:text-3xl">
          {m.myValue} {m.kind === "tap" ? "marta bosdingiz" : "ta nishon"}
        </p>
        {m.ended && m.myPoints > 0 && <p className="live-pop font-mono text-4xl font-black text-emerald-300 lg:text-6xl">+{formatNumberUz(m.myPoints)}</p>}
        {m.ended && m.place > 0 && <p className="text-lg font-black">{m.place === 1 ? "👑 Eng zo'ri siz!" : `${m.place}-o'rin`}</p>}
      </div>
    );
  }
  return m.kind === "tap" ? (
    <TapGame gameId={gameId} round={m.round} remaining={remaining} active={playing} />
  ) : (
    <TargetGame gameId={gameId} round={m.round} remaining={remaining} active={playing} />
  );
}

/** Natijani muntazam yuboradi (oxirida ham) — server eng kattasini oladi */
function useReporter(gameId: string, round: number, value: number, active: boolean) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  const send = useCallback(() => void submitMinigameAction(gameId, round, ref.current).catch(() => {}), [gameId, round]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(send, 1500);
    return () => {
      clearInterval(id);
      send();
    };
  }, [active, send]);
}

function TapGame({ gameId, round, remaining, active }: { gameId: string; round: number; remaining: number; active: boolean }) {
  const [taps, setTaps] = useState(0);
  const [pulse, setPulse] = useState(0);
  const lastAt = useRef(0);
  useReporter(gameId, round, taps, active);
  const tap = () => {
    if (!active) return;
    const now = performance.now();
    // Soniyasiga 15 dan ortiq bosish hisoblanmaydi (avtomatik bosuvchilarga qarshi)
    if (now - lastAt.current < 66) return;
    lastAt.current = now;
    setTaps((n) => n + 1);
    setPulse((n) => n + 1);
    haptic([8]);
  };
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-bold text-slate-300">Tezkor bosish</span>
        <span className={cn("font-mono text-3xl font-black", remaining <= 3000 && "text-rose-400")}>{Math.ceil(remaining / 1000)}</span>
      </div>
      <p className="font-mono text-6xl font-black tabular-nums lg:text-8xl">{taps}</p>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          tap();
        }}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && tap()}
        className="select-none touch-none flex aspect-square w-[min(70vw,340px)] cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-rose-600 text-5xl font-black shadow-[0_0_60px_rgba(244,63,94,0.5)] transition-transform active:scale-95 lg:w-[380px] lg:text-7xl"
      >
        <span key={pulse} className="live-pop">
          BOS!
        </span>
      </button>
      <p className="text-xs text-slate-400">Kompyuterda: Space yoki sichqoncha</p>
    </div>
  );
}

function TargetGame({ gameId, round, remaining, active }: { gameId: string; round: number; remaining: number; active: boolean }) {
  const [hits, setHits] = useState(0);
  const [pos, setPos] = useState({ x: 50, y: 50, key: 0 });
  useReporter(gameId, round, hits, active);
  const move = useCallback(() => setPos((p) => ({ x: 10 + Math.random() * 80, y: 12 + Math.random() * 76, key: p.key + 1 })), []);
  // Nishon o'zi ham joy almashtirib turadi
  useEffect(() => {
    if (!active) return;
    const id = setInterval(move, 1300);
    return () => clearInterval(id);
  }, [active, move]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-300">
          Urildi: <span className="font-mono text-2xl font-black text-white">{hits}</span>
        </span>
        <span className={cn("font-mono text-3xl font-black", remaining <= 3000 && "text-rose-400")}>{Math.ceil(remaining / 1000)}</span>
      </div>
      <div className="relative h-[58vh] min-h-[280px] w-full touch-none select-none overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.15),transparent_70%)] ring-1 ring-white/10">
        <button
          key={pos.key}
          type="button"
          aria-label="Nishon"
          onPointerDown={(e) => {
            e.preventDefault();
            if (!active) return;
            setHits((n) => n + 1);
            haptic([12]);
            move();
          }}
          className="live-pop absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full bg-[radial-gradient(circle,#fff_0_18%,#ef4444_19%_38%,#fff_39%_56%,#ef4444_57%_100%)] shadow-[0_0_24px_rgba(239,68,68,0.6)] lg:h-20 lg:w-20"
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        />
      </div>
    </div>
  );
}
