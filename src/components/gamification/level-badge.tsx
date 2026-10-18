import { Bug, Crosshair, Crown, Flame, Gem, Shield, Sparkles, Swords, WandSparkles, Zap, type LucideIcon } from "lucide-react";
import { LEVEL_NAMES } from "@/lib/gamification/levels";
import { cn } from "@/lib/utils";

/** Ko'p burchakli "portlash" shakli (yuqori darajalar uchun) */
function burst(points: number, inner: number) {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 50 : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    out.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
  }
  return `polygon(${out.join(",")})`;
}

const SHAPES = {
  circle: "circle(50% at 50% 50%)",
  hex: "polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%)",
  oct: "polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)",
  shield: "polygon(50% 0,100% 14%,100% 52%,50% 100%,0 52%,0 14%)",
  star: burst(10, 41),
  crown: burst(12, 43),
} as const;

interface Tier {
  icon: LucideIcon;
  shape: keyof typeof SHAPES;
  /** Emblema rangi (gradient) */
  bg: string;
  /** Atrofidagi yorug'lik — daraja oshgan sari kuchayadi */
  glow?: string;
  /** Orqada aylanuvchi nur halqasi (eng yuqori darajalar) */
  aura?: string;
}

// Daraja oshgan sari: shakl murakkablashadi, rang yorqinlashadi, yorug'lik va aylanuvchi nur qo'shiladi
const TIERS: Record<number, Tier> = {
  1: { icon: Sparkles, shape: "circle", bg: "from-slate-300 via-slate-400 to-slate-600" },
  2: { icon: Crosshair, shape: "circle", bg: "from-lime-300 via-green-500 to-green-700" },
  3: { icon: Bug, shape: "hex", bg: "from-emerald-300 via-emerald-500 to-teal-700" },
  4: { icon: Shield, shape: "hex", bg: "from-sky-300 via-blue-500 to-blue-800", glow: "rgba(59,130,246,0.35)" },
  5: { icon: Swords, shape: "oct", bg: "from-indigo-300 via-indigo-500 to-violet-800", glow: "rgba(99,102,241,0.45)" },
  6: { icon: WandSparkles, shape: "oct", bg: "from-violet-300 via-purple-500 to-purple-900", glow: "rgba(168,85,247,0.55)" },
  7: {
    icon: Zap,
    shape: "shield",
    bg: "from-fuchsia-300 via-fuchsia-500 to-pink-800",
    glow: "rgba(217,70,239,0.6)",
    aura: "conic-gradient(from 0deg, transparent, rgba(232,121,249,0.9), transparent 40%, rgba(244,114,182,0.9), transparent 75%)",
  },
  8: {
    icon: Flame,
    shape: "shield",
    bg: "from-amber-300 via-orange-500 to-red-700",
    glow: "rgba(249,115,22,0.65)",
    aura: "conic-gradient(from 0deg, transparent, rgba(251,146,60,0.95), transparent 35%, rgba(239,68,68,0.95), transparent 70%)",
  },
  9: {
    icon: Gem,
    shape: "star",
    bg: "from-cyan-200 via-sky-500 to-indigo-700",
    glow: "rgba(56,189,248,0.7)",
    aura: "conic-gradient(from 0deg, rgba(34,211,238,0.9), transparent 25%, rgba(129,140,248,0.9), transparent 50%, rgba(34,211,238,0.9), transparent 75%, rgba(129,140,248,0.9))",
  },
  10: {
    icon: Crown,
    shape: "crown",
    bg: "from-yellow-200 via-amber-400 to-orange-600",
    glow: "rgba(251,191,36,0.8)",
    aura: "conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #38bdf8, #a78bfa, #f472b6, #f87171)",
  },
};

const SIZES = {
  xs: { box: "h-5 w-5", icon: "h-2.5 w-2.5", glow: 4, pip: false },
  sm: { box: "h-9 w-9", icon: "h-4 w-4", glow: 8, pip: false },
  md: { box: "h-12 w-12", icon: "h-5 w-5", glow: 12, pip: true },
  lg: { box: "h-16 w-16", icon: "h-7 w-7", glow: 16, pip: true },
  xl: { box: "h-28 w-28", icon: "h-12 w-12", glow: 28, pip: true },
  hero: { box: "h-40 w-40 sm:h-44 sm:w-44", icon: "h-20 w-20", glow: 44, pip: true },
} as const;

export function levelTier(level: number): Tier {
  return TIERS[Math.min(10, Math.max(1, Math.round(level) || 1))];
}

/**
 * Daraja emblemasi: raqam o'rniga unvon belgisi. Yuqori darajada shakl, rang va yorug'lik kuchayadi,
 * 7-darajadan boshlab orqada nur aylanadi (harakatni kamaytirish yoqilgan bo'lsa — to'xtab turadi).
 * `locked` — hali yetilmagan daraja (kulrang).
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
  const clipPath = SHAPES[tier.shape];
  const name = LEVEL_NAMES[Math.min(10, Math.max(1, level)) - 1];

  return (
    <span
      role="img"
      aria-label={`${level}-daraja: ${name}`}
      title={`${level}-daraja · ${name}`}
      className={cn("relative inline-grid shrink-0 place-items-center", s.box, locked && "opacity-45 grayscale", className)}
      style={!locked && tier.glow ? { filter: `drop-shadow(0 0 ${s.glow}px ${tier.glow})` } : undefined}
    >
      {!locked && tier.aura && (
        <span
          aria-hidden
          className="absolute -inset-[14%] rounded-full opacity-80 blur-[1.5px] motion-safe:animate-[spin_7s_linear_infinite]"
          style={{ background: tier.aura, mask: "radial-gradient(circle, transparent 52%, black 56%)", WebkitMask: "radial-gradient(circle, transparent 52%, black 56%)" }}
        />
      )}
      <span aria-hidden className={cn("absolute inset-0 bg-gradient-to-br", tier.bg)} style={{ clipPath }} />
      {/* Ichki bo'rtma: yuqori chap tomonda yorug' */}
      <span
        aria-hidden
        className="absolute inset-[9%] bg-gradient-to-br from-white/35 via-white/5 to-black/20"
        style={{ clipPath }}
      />
      <Icon aria-hidden className={cn("relative text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]", s.icon)} strokeWidth={2.4} />
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
