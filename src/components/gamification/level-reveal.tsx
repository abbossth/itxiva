"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Star } from "lucide-react";
import { LevelBadge, levelTier } from "@/components/gamification/level-badge";
import { LEVEL_MATERIALS, LEVEL_NAMES } from "@/lib/gamification/levels";
import { fireConfetti, prefersReducedMotion } from "@/lib/confetti";
import { playRewardSound } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { cn, formatNumberUz } from "@/lib/utils";

const SPARKLES = [
  { left: "14%", top: "16%", size: 16, delay: "0.9s" },
  { left: "82%", top: "12%", size: 20, delay: "1.3s" },
  { left: "88%", top: "44%", size: 12, delay: "1.7s" },
  { left: "8%", top: "48%", size: 14, delay: "1.1s" },
  { left: "70%", top: "26%", size: 10, delay: "2s" },
  { left: "28%", top: "30%", size: 10, delay: "1.5s" },
];

/** Sahna: emblema markazda kichikdan kattalashib, aylanib "tushadi"; orqada nurlar, chaqnash va kengayuvchi halqa */
export function LevelStage({ level }: { level: number }) {
  const glow = levelTier(level).glow ?? "rgba(45,212,191,0.55)";
  return (
    <div className="relative grid h-72 w-72 place-items-center">
      <div
        aria-hidden
        className="reward-rays absolute inset-[-30%] rounded-full opacity-50"
        style={{
          background: "repeating-conic-gradient(from 0deg, rgba(251,191,36,0.5) 0deg 9deg, transparent 9deg 24deg)",
          maskImage: "radial-gradient(circle, black 20%, transparent 64%)",
          WebkitMaskImage: "radial-gradient(circle, black 20%, transparent 64%)",
        }}
      />
      <div aria-hidden className="level-flash absolute inset-[12%] rounded-full" style={{ background: `radial-gradient(circle, rgba(255,255,255,0.95), ${glow} 45%, transparent 70%)` }} />
      <div aria-hidden className="level-ring absolute inset-[18%] rounded-full border-4" style={{ borderColor: glow }} />
      {SPARKLES.map((s, i) => (
        <Star
          key={i}
          aria-hidden
          className="reward-twinkle absolute fill-amber-200 text-amber-200"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
        />
      ))}
      <div className="level-emblem relative">
        <LevelBadge level={level} size="hero" />
      </div>
    </div>
  );
}

/** Emblema "tushgan" paytda: ovoz, titrash va ikki tomondan konfetti */
export function celebrateLevel() {
  playRewardSound();
  haptic([40, 60, 40, 60, 120]);
  if (prefersReducedMotion()) return;
  const colors = ["#fbbf24", "#fde68a", "#ffffff", "#14b8a6", "#a78bfa"];
  void fireConfetti({ particleCount: 140, spread: 100, startVelocity: 48, origin: { y: 0.38 }, colors, zIndex: 80 });
  void fireConfetti({ particleCount: 70, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors, zIndex: 80 });
  void fireConfetti({ particleCount: 70, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors, zIndex: 80 });
}

const TAPS = 5;
/** Ketma-ket bosishlar orasidagi eng ko'p vaqt */
const TAP_GAP_MS = 1000;

/**
 * Yashirin sovg'a: emblemani ketma-ket 5 marta bossangiz, o'sha daraja xuddi qo'lga kiritilgandek
 * ekranda katta bo'lib namoyish etiladi. Faqat ko'rinish — serverga hech narsa yozilmaydi.
 */
export function LevelRevealTrigger({
  level,
  owned,
  minXp,
  children,
  className,
}: {
  level: number;
  /** O'quvchi bu darajaga yetganmi */
  owned: boolean;
  /** Bu darajaga kerak XP (yetilmagan bo'lsa matnda ko'rsatiladi) */
  minXp?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);
  const last = useRef(0);

  const tap = () => {
    const now = Date.now();
    const next = now - last.current > TAP_GAP_MS ? 1 : taps + 1;
    last.current = now;
    if (next >= TAPS) {
      setTaps(0);
      setOpen(true);
    } else {
      setTaps(next);
    }
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`${level}-daraja emblemasi`}
        onClick={tap}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), tap())}
        className={cn("inline-grid cursor-pointer select-none rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500", className)}
      >
        {/* Har bosishda kichik sakrash — nimadir bo'layotgani seziladi */}
        <span key={taps} className={cn("inline-grid", taps > 0 && "level-tap")}>
          {children}
        </span>
      </span>
      {open && <LevelRevealOverlay level={level} owned={owned} minXp={minXp} onClose={() => setOpen(false)} />}
    </>
  );
}

function LevelRevealOverlay({ level, owned, minXp, onClose }: { level: number; owned: boolean; minXp?: number; onClose: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const i = Math.min(10, Math.max(1, level)) - 1;

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(celebrateLevel, 750);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[75] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="level-reveal-title">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md animate-in fade-in" onClick={onClose} aria-hidden />
      <div className="pointer-events-none relative flex min-h-full flex-col items-center justify-center p-4 text-center text-white">
        <LevelStage level={level} />
        <div className="pointer-events-auto relative -mt-2 w-full max-w-sm space-y-3">
          <p className="reward-item text-xs font-black uppercase tracking-[0.35em] text-amber-300" style={{ animationDelay: "1s" }}>
            {owned ? "Sizning darajangiz" : "Kelajakdagi darajangiz"}
          </p>
          <h2 id="level-reveal-title" className="level-title text-3xl sm:text-4xl font-black leading-tight">
            <span className="bg-gradient-to-b from-white via-amber-100 to-amber-300 bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(251,191,36,0.35)]">
              {LEVEL_NAMES[i]}
            </span>
          </h2>
          <p className="reward-item text-sm text-white/75" style={{ animationDelay: "1.35s" }}>
            {level}-daraja · {LEVEL_MATERIALS[i]} emblema.{" "}
            {owned ? "Bu daraja sizniki — keyingisiga intiling!" : minXp ? `${formatNumberUz(minXp)} XP to'plasangiz — bu sizniki bo'ladi!` : "Oldinda sizni kutmoqda!"}
          </p>
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            className="reward-item inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-base font-black text-amber-950 shadow-lg shadow-amber-500/30 transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-amber-300/50"
            style={{ animationDelay: "1.6s" }}
          >
            <Sparkles className="h-5 w-5" />
            {owned ? "Zo'r!" : "Albatta erishaman!"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
