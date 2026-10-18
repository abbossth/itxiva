import { Compass, Crown, Flag, Flame, Mountain, Shield, Sparkle, Sparkles, Sprout, Star, Sword, type LucideIcon } from "lucide-react";
import { LEVEL_MATERIALS, LEVEL_NAMES } from "@/lib/gamification/levels";
import { cn } from "@/lib/utils";

interface Tier {
  icon: LucideIcon;
  /** Gardish (ramka) — metall */
  rim: string;
  /** Yuz — material */
  face: string;
  /** Belgi rangi (och yuzada — to'q) */
  ink: string;
  /** Qimmatbaho tosh qirralari */
  facets?: boolean;
  /** Koinot: yulduzchalar */
  stars?: boolean;
  /** Yaltirash */
  shine?: boolean;
  /** Atrofidagi yorug'lik — daraja oshgan sari kuchayadi */
  glow?: string;
  /** Orqada aylanuvchi nur halqasi (eng yuqori darajalar) */
  aura?: string;
}

const GOLD_SETTING = "linear-gradient(135deg,#fef9c3,#facc15 30%,#a16207 65%,#fde68a)";
const PLATINUM_SETTING = "linear-gradient(135deg,#ffffff,#e2e8f0 30%,#64748b 65%,#f8fafc)";

// Har daraja — o'z materialidan yasalgan dumaloq emblema: temirdan koinotgacha qimmatlashib, yorqinlashib boradi
const TIERS: Record<number, Tier> = {
  1: {
    icon: Sprout,
    rim: "linear-gradient(135deg,#d1d5db,#6b7280 40%,#374151 70%,#9ca3af)",
    face: "radial-gradient(circle at 30% 25%,#9ca3af,#4b5563 55%,#1f2937)",
    ink: "text-slate-100",
  },
  2: {
    icon: Compass,
    rim: "linear-gradient(135deg,#fed7aa,#c2410c 45%,#7c2d12 75%,#fdba74)",
    face: "radial-gradient(circle at 30% 25%,#fdba74,#c2410c 55%,#7c2d12)",
    ink: "text-orange-50",
  },
  3: {
    icon: Sword,
    rim: "linear-gradient(135deg,#f3d19c,#b07a3c 40%,#6b4423 70%,#e0b47c)",
    face: "radial-gradient(circle at 30% 25%,#e8c08a,#a86f34 55%,#5c3a1e)",
    ink: "text-amber-50",
    glow: "rgba(176,122,60,0.35)",
  },
  4: {
    icon: Shield,
    rim: "linear-gradient(135deg,#ffffff,#cbd5e1 35%,#64748b 65%,#f1f5f9)",
    face: "radial-gradient(circle at 30% 25%,#ffffff,#cbd5e1 50%,#64748b)",
    ink: "text-slate-700",
    glow: "rgba(226,232,240,0.5)",
  },
  5: {
    icon: Flame,
    rim: GOLD_SETTING,
    face: "radial-gradient(circle at 30% 25%,#fef08a,#eab308 50%,#a16207)",
    ink: "text-amber-900",
    shine: true,
    glow: "rgba(250,204,21,0.6)",
  },
  6: {
    icon: Flag,
    rim: PLATINUM_SETTING,
    face: "radial-gradient(circle at 30% 25%,#ffffff,#e0e7ff 40%,#94a3b8 75%,#475569)",
    ink: "text-slate-700",
    shine: true,
    glow: "rgba(165,180,252,0.65)",
  },
  7: {
    icon: Star,
    rim: GOLD_SETTING,
    face: "radial-gradient(circle at 30% 25%,#a7f3d0,#10b981 45%,#065f46)",
    ink: "text-white",
    facets: true,
    shine: true,
    glow: "rgba(16,185,129,0.65)",
    aura: "conic-gradient(from 0deg, transparent, rgba(52,211,153,0.9), transparent 40%, rgba(250,204,21,0.8), transparent 75%)",
  },
  8: {
    icon: Sparkles,
    rim: GOLD_SETTING,
    face: "radial-gradient(circle at 30% 25%,#fecdd3,#e11d48 45%,#881337)",
    ink: "text-white",
    facets: true,
    shine: true,
    glow: "rgba(225,29,72,0.7)",
    aura: "conic-gradient(from 0deg, transparent, rgba(251,113,133,0.95), transparent 35%, rgba(250,204,21,0.85), transparent 70%)",
  },
  9: {
    icon: Mountain,
    rim: PLATINUM_SETTING,
    face: "radial-gradient(circle at 30% 25%,#ffffff,#e0f2fe 30%,#38bdf8 70%,#0c4a6e)",
    ink: "text-sky-950",
    facets: true,
    shine: true,
    glow: "rgba(125,211,252,0.85)",
    aura: "conic-gradient(from 0deg, rgba(255,255,255,0.95), transparent 20%, rgba(125,211,252,0.95), transparent 45%, rgba(255,255,255,0.95), transparent 70%, rgba(186,230,253,0.95))",
  },
  10: {
    icon: Crown,
    rim: "conic-gradient(from 0deg,#f87171,#fbbf24,#34d399,#38bdf8,#a78bfa,#f472b6,#f87171)",
    face: "radial-gradient(circle at 30% 25%,#e9d5ff,#8b5cf6 35%,#312e81 70%,#020617)",
    ink: "text-amber-200",
    stars: true,
    shine: true,
    glow: "rgba(167,139,250,0.9)",
    aura: "conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #38bdf8, #a78bfa, #f472b6, #f87171)",
  },
};

// Emblema atrofidagi chaqnoq yulduzchalar (foizda — har o'lchamga mos)
const TWINKLES = [
  { left: "70%", top: "4%", size: 22, delay: "0.2s" },
  { left: "4%", top: "62%", size: 18, delay: "0.9s" },
  { left: "78%", top: "70%", size: 16, delay: "1.4s" },
  { left: "12%", top: "6%", size: 14, delay: "0.5s" },
  { left: "44%", top: "-8%", size: 18, delay: "1.1s" },
];
const twinkleCount = (level: number) => (level >= 10 ? 5 : level >= 8 ? 4 : level >= 6 ? 3 : level >= 4 ? 2 : level >= 3 ? 1 : 0);

const SIZES = {
  xs: { box: "h-5 w-5", icon: "h-2.5 w-2.5", glow: 4, pip: false },
  sm: { box: "h-9 w-9", icon: "h-4 w-4", glow: 8, pip: false },
  md: { box: "h-12 w-12", icon: "h-5 w-5", glow: 12, pip: true },
  lg: { box: "h-16 w-16", icon: "h-7 w-7", glow: 16, pip: true },
  xl: { box: "h-28 w-28", icon: "h-12 w-12", glow: 28, pip: true },
  hero: { box: "h-40 w-40 sm:h-44 sm:w-44", icon: "h-20 w-20", glow: 44, pip: true },
} as const;

/** Darajaning asosiy rangi — kartalar shu rangda bezatiladi (emblema materialiga mos) */
const LEVEL_COLORS = ["#9ca3af", "#ea580c", "#b07a3c", "#94a3b8", "#eab308", "#818cf8", "#10b981", "#e11d48", "#38bdf8", "#a855f7"];
export function levelColor(level: number): string {
  return LEVEL_COLORS[Math.min(10, Math.max(1, Math.round(level) || 1)) - 1];
}

export function levelTier(level: number): Tier {
  return TIERS[Math.min(10, Math.max(1, Math.round(level) || 1))];
}

/**
 * Daraja emblemasi: o'z materialidan yasalgan dumaloq medal (temir, mis, bronza, kumush, oltin, platina,
 * zumrad, yoqut, olmos, koinot). Yuqori darajada yaltirash, tosh qirralari, yorug'lik va aylanuvchi nur qo'shiladi
 * (harakatni kamaytirish yoqilgan bo'lsa — to'xtab turadi). `locked` — hali yetilmagan daraja (kulrang).
 */
export function LevelBadge({
  level,
  size = "sm",
  locked = false,
  className,
}: {
  level: number;
  size?: keyof typeof SIZES;
  locked?: boolean;
  className?: string;
}) {
  const tier = levelTier(level);
  const s = SIZES[size];
  const Icon = tier.icon;
  const i = Math.min(10, Math.max(1, level)) - 1;
  const label = `${level}-daraja: ${LEVEL_NAMES[i]} (${LEVEL_MATERIALS[i].toLowerCase()})`;

  // Ustiga borilganda (o'zi yoki `group` ota elementi): yetilmagan daraja ham o'z rangida, nur va yulduzchalar bilan
  // ko'rinadi, emblema kattalashib yorqinroq porlaydi
  const glowColor = tier.glow ?? "rgba(255,255,255,0.35)";
  const reveal = locked ? "opacity-0 group-hover:opacity-100 group-hover/lv:opacity-100" : "";

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "group/lv relative inline-grid shrink-0 place-items-center transition-[transform,filter] duration-300 ease-out",
        "[filter:var(--lv-glow)] group-hover:[filter:var(--lv-glow-hover)] hover:[filter:var(--lv-glow-hover)] group-hover:scale-110 hover:scale-110 motion-reduce:group-hover:scale-100 motion-reduce:hover:scale-100",
        s.box,
        className
      )}
      style={
        {
          "--lv-glow": !locked && tier.glow ? `drop-shadow(0 0 ${s.glow}px ${tier.glow})` : "none",
          "--lv-glow-hover": `drop-shadow(0 0 ${Math.round(s.glow * 1.8)}px ${glowColor}) brightness(1.12) saturate(1.15)`,
        } as React.CSSProperties
      }
    >
      <span
        className={cn(
          "absolute inset-0 grid place-items-center transition-[opacity,filter] duration-300",
          locked && "opacity-45 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover/lv:opacity-100 group-hover/lv:grayscale-0"
        )}
      >
        {tier.aura && (
          <span
            aria-hidden
            className={cn("absolute -inset-[14%] rounded-full opacity-80 blur-[1.5px] transition-opacity duration-300 motion-safe:animate-[spin_7s_linear_infinite]", reveal)}
            style={{ background: tier.aura, mask: "radial-gradient(circle, transparent 54%, black 58%)", WebkitMask: "radial-gradient(circle, transparent 54%, black 58%)" }}
          />
        )}
        {/* Gardish: metall, ustida yorug' chiziq */}
        <span aria-hidden className="absolute inset-0 rounded-full shadow-[inset_0_-2px_3px_rgba(0,0,0,0.35)]" style={{ background: tier.rim }} />
        <span aria-hidden className="absolute inset-[4%] rounded-full bg-gradient-to-b from-white/45 via-transparent to-transparent" />
        {/* Yuz: material */}
        <span
          aria-hidden
          className="absolute inset-[13%] overflow-hidden rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.5)]"
          style={{ background: tier.face }}
        >
          {tier.facets && (
            <span
              className="absolute inset-0 mix-blend-overlay"
              style={{ background: "repeating-conic-gradient(from 11deg, rgba(255,255,255,0.55) 0deg 22.5deg, rgba(0,0,0,0.25) 22.5deg 45deg)" }}
            />
          )}
          {tier.stars && (
            <span
              className="absolute inset-0 opacity-90"
              style={{
                backgroundImage:
                  "radial-gradient(circle, #fff 0.6px, transparent 1.2px), radial-gradient(circle, rgba(255,255,255,0.7) 0.5px, transparent 1px)",
                backgroundSize: "28% 28%, 19% 19%",
                backgroundPosition: "0 0, 9% 13%",
              }}
            />
          )}
          <span className="absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-black/20" />
          {/* Yaltirash: har darajada bor, yuqorida — yorqinroq va tez-tez; ustiga borilganda — yana bitta tezkor chaqnash */}
          <span
            className={cn("level-glint absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent motion-reduce:hidden", reveal)}
            style={{ opacity: 0.25 + level * 0.06, animationDuration: `${Math.max(1.8, 4.6 - level * 0.28)}s`, animationDelay: `${(level % 4) * 0.35}s` }}
          />
          <span
            className="level-glint absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 transition-opacity group-hover:opacity-90 group-hover/lv:opacity-90 motion-reduce:hidden"
            style={{ animationDuration: "1.1s" }}
          />
        </span>
        <Icon aria-hidden className={cn("relative drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.45)]", tier.ink, s.icon)} strokeWidth={2.4} />
        {/* Chaqnoq yulduzchalar: 3-darajadan bittadan boshlab, 10-darajada beshta; ustiga borilganda — hammasi */}
        {size !== "xs" &&
          TWINKLES.map((t, i) => (
            <Sparkle
              key={i}
              aria-hidden
              className={cn(
                "reward-twinkle pointer-events-none absolute fill-white text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.9)] transition-opacity motion-reduce:hidden",
                locked || i >= twinkleCount(level) ? "opacity-0 group-hover:opacity-100 group-hover/lv:opacity-100" : ""
              )}
              style={{ left: t.left, top: t.top, width: `${t.size}%`, height: `${t.size}%`, animationDelay: t.delay }}
            />
          ))}
      </span>
      {s.pip && (
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 -translate-x-1/2 rounded-full bg-slate-950 font-mono font-black leading-none text-white ring-2 ring-white dark:ring-slate-900",
            size === "hero" ? "-bottom-3 px-3.5 py-1.5 text-lg" : size === "xl" ? "-bottom-2 px-2.5 py-1 text-sm" : "-bottom-1.5 px-1.5 py-0.5 text-[10px]"
          )}
        >
          {level}
        </span>
      )}
    </span>
  );
}

/** XP progress chizig'i */
export function XpBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800", className)}
    >
      <div
        className="h-full rounded-full bg-teal-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(2, percent)}%` }}
      />
    </div>
  );
}
