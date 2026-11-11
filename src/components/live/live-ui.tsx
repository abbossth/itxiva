"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Heart, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";
import { MODE_THEMES, themeBackground } from "@/lib/live-game/themes";

// Jonli o'yin ekranlari uchun umumiy ranglar va kichik bo'laklar (proyektor va o'quvchi telefoni).

export const TILE_COLORS = [
  "bg-rose-600 border-rose-800",
  "bg-sky-600 border-sky-800",
  "bg-amber-500 border-amber-700",
  "bg-emerald-600 border-emerald-800",
  "bg-violet-600 border-violet-800",
  "bg-fuchsia-600 border-fuchsia-800",
];
export const LETTERS = "ABCDEF";

export const TEAM_STYLES = [
  { bar: "bg-rose-500", soft: "bg-rose-500/15 text-rose-200 ring-rose-400/40", dot: "bg-rose-500" },
  { bar: "bg-sky-500", soft: "bg-sky-500/15 text-sky-200 ring-sky-400/40", dot: "bg-sky-500" },
  { bar: "bg-amber-400", soft: "bg-amber-400/15 text-amber-100 ring-amber-300/40", dot: "bg-amber-400" },
  { bar: "bg-emerald-500", soft: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40", dot: "bg-emerald-500" },
];

/** To'liq ekran rejimida LiveShell foni ramkaning o'zida — chetlarda bo'shliq qolmaydi */
const ImmersiveContext = createContext(false);

/** O'yin ekranlari foni (yorug' mavzuda ham to'q — proyektorda yaxshi ko'rinadi) */
export function LiveShell({ children, className }: { children: React.ReactNode; className?: string }) {
  const immersive = useContext(ImmersiveContext);
  if (immersive) {
    // Butun ekran: fon ramkada, bu yerda faqat mazmun (balandlik ekranga sig'adi)
    return <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-3 sm:px-6 sm:pb-5 [&>*:last-child]:min-h-0">{children}</div>;
  }
  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white shadow-xl sm:p-6", className)}>
      <ShellGlow />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Rejim bezagi: ikki rangli nur va sekin suzib yuradigan belgilar */
export function ThemeDecor({ mode }: { mode: LiveGameMode }) {
  const t = MODE_THEMES[mode] ?? MODE_THEMES.classic;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full blur-3xl" style={{ background: t.glow[0] }} />
      <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full blur-3xl" style={{ background: t.glow[1] }} />
      {FLOAT_SPOTS.map((f, i) => (
        <span
          key={i}
          className="live-drift absolute select-none opacity-[0.13]"
          style={{ left: `${f.x}%`, top: `${f.y}%`, fontSize: f.size, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }}
        >
          {t.floaters[i % t.floaters.length]}
        </span>
      ))}
    </div>
  );
}

const FLOAT_SPOTS = [
  { x: 6, y: 18, size: 44, delay: 0, dur: 9 },
  { x: 88, y: 12, size: 36, delay: 1.5, dur: 11 },
  { x: 14, y: 78, size: 52, delay: 0.7, dur: 10 },
  { x: 72, y: 84, size: 40, delay: 2.2, dur: 12 },
  { x: 46, y: 6, size: 30, delay: 3, dur: 8 },
  { x: 94, y: 58, size: 48, delay: 1, dur: 13 },
  { x: 32, y: 46, size: 26, delay: 4, dur: 10 },
];

function ShellGlow() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
    </>
  );
}

/**
 * Server bergan qolgan vaqtdan mahalliy sanoq: so'rovlar orasida ham taymer silliq yuradi.
 */
export function useCountdown(remainingMs: number, running: boolean): number {
  // Hisob qaysi server qiymatidan olinganini saqlaydi: yangi savolda eski (0) qiymat bir lahza ham qaytmaydi
  const [tick, setTick] = useState<{ base: number; left: number } | null>(null);
  const deadline = useRef(0);
  const base = useRef(remainingMs);
  useEffect(() => {
    deadline.current = Date.now() + remainingMs;
    base.current = remainingMs;
  }, [remainingMs]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick({ base: base.current, left: Math.max(0, deadline.current - Date.now()) }), 100);
    return () => clearInterval(id);
  }, [running]);
  return running && tick && tick.base === remainingMs ? tick.left : remainingMs;
}

export function TimerBadge({ ms, limit, big = false }: { ms: number; limit: number; big?: boolean }) {
  const secs = Math.ceil(ms / 1000);
  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, ms / (limit * 1000)));
  const color = secs <= 5 ? "stroke-rose-400" : secs <= 10 ? "stroke-amber-300" : "stroke-emerald-300";
  return (
    <div className={cn("relative shrink-0", big ? "h-24 w-24" : "h-14 w-14", secs <= 5 && ms > 0 && "quiz-shake")} role="timer" aria-label={`${secs} soniya`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} className="fill-none stroke-white/10" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className={cn("fill-none transition-[stroke-dashoffset] duration-200 ease-linear", color)}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center font-mono font-black tabular-nums", big ? "text-3xl" : "text-lg")}>{secs}</span>
    </div>
  );
}

export function Lives({ lives, max = 3, className }: { lives: number; max?: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${lives} ta jon`}>
      {Array.from({ length: max }, (_, i) => (
        <Heart key={i} className={cn("h-4 w-4", i < lives ? "fill-rose-500 text-rose-500" : "text-white/25")} />
      ))}
    </span>
  );
}

/**
 * O'yin ochilishi bilan butun oynani egallaydi (sidebar, header va pastki menyu yopiladi).
 * Brauzerning haqiqiy to'liq ekranini sahifa o'zi yoqa olmaydi — foydalanuvchi o'yin ichida birinchi marta bosganda yoqiladi.
 * Foydalanuvchi Esc bilan chiqsa, qayta majburlanmaydi (o'yin oynani egallab turaveradi).
 */
export function ImmersiveFrame({
  children,
  leading,
  toolbar,
  mode,
}: {
  children: React.ReactNode;
  leading?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** O'yin turi: fon ranglari va bezaklari shunga qarab */
  mode?: LiveGameMode;
}) {
  const [immersive, setImmersive] = useState(true);
  const entered = useRef(false);
  const declined = useRef(false);

  // Orqadagi sahifa aylanmasin
  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && entered.current) declined.current = true;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      // O'yindan chiqib ketilganda brauzer to'liq ekrani ham yopiladi
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const tryNative = () => {
    if (declined.current || typeof document === "undefined" || document.fullscreenElement || !document.fullscreenEnabled) return;
    entered.current = true;
    document.documentElement.requestFullscreen().catch(() => {
      declined.current = true;
    });
  };

  const exit = () => {
    declined.current = true;
    setImmersive(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const enter = () => {
    declined.current = false;
    setImmersive(true);
    tryNative();
  };

  const bar = (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", immersive ? "relative z-10 px-3 pt-2 sm:px-6 sm:pt-3" : "mb-2")}>
      <div className="min-w-0">{leading}</div>
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <button
          type="button"
          onClick={immersive ? exit : enter}
          className={cn(
            "inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors",
            immersive ? "bg-white/10 text-white hover:bg-white/20" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
          )}
          title={immersive ? "Oddiy ko'rinishga qaytish" : "O'yinni to'liq ekranda ochish"}
        >
          {immersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="hidden sm:inline">{immersive ? "Kichraytirish" : "To'liq ekran"}</span>
        </button>
      </div>
    </div>
  );

  if (!immersive) {
    return (
      <div>
        {bar}
        {children}
      </div>
    );
  }
  // Chetdan-chetgacha: fon butun ekranni qoplaydi, aylantirish chizig'i yo'q (juda kichik ekranda ham chiziq ko'rinmaydi)
  return (
    <ImmersiveContext.Provider value>
      <div
        className="fixed inset-0 z-[60] flex h-dvh w-screen flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 pb-[env(safe-area-inset-bottom)] text-white"
        style={mode ? themeBackground(mode) : undefined}
        onClickCapture={tryNative}
      >
        {mode ? <ThemeDecor mode={mode} /> : <ShellGlow />}
        {bar}
        <div className="live-noscroll relative flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </ImmersiveContext.Provider>
  );
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

/** Oyna balandligi (reyting qatorlari soni ekranga sig'ishi uchun) */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 900);
}
