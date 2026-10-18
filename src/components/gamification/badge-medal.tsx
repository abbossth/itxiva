import { BookOpenCheck, BrainCircuit, CalendarCheck, Flame, GraduationCap, Lock, Rocket, Sparkle, Star, Target, Trophy, type LucideIcon } from "lucide-react";
import { BADGE_BY_ID, TIER_LABEL, type BadgeId, type BadgeTier } from "@/lib/gamification/badges";
import { cn } from "@/lib/utils";

export const BADGE_ICON: Record<BadgeId, LucideIcon> = {
  tests: BrainCircuit,
  streak: Flame,
  attendance: CalendarCheck,
  homework: BookOpenCheck,
  certificate: GraduationCap,
  project: Rocket,
  weekly: Trophy,
  quests: Target,
};

/** Har nishonning o'z rangi: yuzasi, lentasi va toshlari — nishonlar bir-biridan ajralib turadi */
const COLOR: Record<BadgeId, [string, string, string]> = {
  tests: ["#7dd3fc", "#0ea5e9", "#3730a3"],
  streak: ["#fdba74", "#f97316", "#b91c1c"],
  attendance: ["#6ee7b7", "#10b981", "#115e59"],
  homework: ["#d8b4fe", "#a855f7", "#86198f"],
  certificate: ["#a5b4fc", "#6366f1", "#1e3a8a"],
  project: ["#67e8f9", "#06b6d4", "#075985"],
  weekly: ["#fda4af", "#f43f5e", "#9d174d"],
  quests: ["#bef264", "#65a30d", "#166534"],
};

function scallop(points: number, inner: number) {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 50 : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    out.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
  }
  return `polygon(${out.join(",")})`;
}

// Gardish — haqiqiy metall: bronza → kumush → oltin. Yuqori bosqichda yorug'lik, yulduzchalar va aylanuvchi nur qo'shiladi
const TIER_STYLE: Record<
  BadgeTier,
  { rim: string; ring: string; clip: string; stars: number; twinkles: number; glow?: number; aura?: boolean }
> = {
  bronze: {
    rim: "linear-gradient(135deg,#f3d19c,#b07a3c 35%,#6b4423 65%,#e0b47c)",
    ring: "linear-gradient(135deg,#e8c08a,#8a5a2b)",
    clip: scallop(14, 46),
    stars: 1,
    twinkles: 0,
  },
  silver: {
    rim: "linear-gradient(135deg,#ffffff,#cbd5e1 30%,#64748b 65%,#f1f5f9)",
    ring: "linear-gradient(135deg,#f8fafc,#94a3b8)",
    clip: scallop(18, 45),
    stars: 2,
    twinkles: 2,
    glow: 0.45,
  },
  gold: {
    rim: "linear-gradient(135deg,#fef9c3,#facc15 30%,#a16207 65%,#fde68a)",
    ring: "linear-gradient(135deg,#fef08a,#ca8a04)",
    clip: scallop(22, 44),
    stars: 3,
    twinkles: 4,
    glow: 0.8,
    aura: true,
  },
};

const TWINKLES = [
  { left: "74%", top: "2%", size: 22, delay: "0.3s" },
  { left: "0%", top: "58%", size: 18, delay: "1s" },
  { left: "8%", top: "4%", size: 15, delay: "1.5s" },
  { left: "80%", top: "62%", size: 15, delay: "0.7s" },
];

const SIZES = {
  sm: { box: "h-10 w-10", icon: "h-4 w-4", ribbon: "w-7 h-4", star: "h-2 w-2", glow: 7, lock: "h-4 w-4", lockIcon: "h-2 w-2" },
  md: { box: "h-16 w-16", icon: "h-7 w-7", ribbon: "w-10 h-6", star: "h-2.5 w-2.5", glow: 14, lock: "h-5 w-5", lockIcon: "h-2.5 w-2.5" },
  lg: { box: "h-24 w-24", icon: "h-10 w-10", ribbon: "w-14 h-8", star: "h-3.5 w-3.5", glow: 22, lock: "h-6 w-6", lockIcon: "h-3 w-3" },
} as const;

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Nishon medali: metall gardish (bronza/kumush/oltin), ichida nishonning o'z rangidagi sirlangan yuz va belgi.
 * `tier` — olingan eng yuqori bosqich; null — hali olinmagan (xira, qulf bilan, birinchi bosqich ko'rinishida).
 */
export function BadgeMedal({ id, tier, size = "md", className }: { id: BadgeId; tier: BadgeTier | null; size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  const Icon = BADGE_ICON[id];
  const def = BADGE_BY_ID[id];
  const label = tier ? `${def?.title} nishoni · ${TIER_LABEL[tier]}` : `${def?.title} nishoni — hali olinmagan`;
  const [light, mid, dark] = COLOR[id];
  const locked = !tier;
  const t = TIER_STYLE[tier ?? "bronze"];

  return (
    <span role="img" aria-label={label} className={cn("relative inline-flex flex-col items-center", locked && "opacity-70 grayscale-[0.6]", className)}>
      {/* Lenta: medal ortidan ikki uchi chiqib turadi, o'rtasida oq chiziq */}
      <span aria-hidden className={cn("absolute top-[62%] flex justify-between", s.ribbon)}>
        {[mid, dark].map((c, i) => (
          <span
            key={i}
            className="h-full w-[46%]"
            style={{
              background: `linear-gradient(90deg, ${c} 0 38%, rgba(255,255,255,0.85) 38% 52%, ${c} 52%)`,
              clipPath: "polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)",
              transform: `rotate(${i ? -14 : 14}deg)`,
            }}
          />
        ))}
      </span>
      <span
        className={cn("relative grid place-items-center", s.box)}
        style={!locked && t.glow ? { filter: `drop-shadow(0 0 ${s.glow}px ${hexA(mid, t.glow)})` } : undefined}
      >
        {!locked && t.aura && (
          <span
            aria-hidden
            className="absolute -inset-[16%] rounded-full opacity-90 blur-[1px] motion-safe:animate-[spin_8s_linear_infinite]"
            style={{
              background: `conic-gradient(from 0deg, #fde047, ${mid}, transparent 30%, #fde047, ${light}, transparent 65%, #fde047)`,
              mask: "radial-gradient(circle, transparent 54%, black 58%)",
              WebkitMask: "radial-gradient(circle, transparent 54%, black 58%)",
            }}
          />
        )}
        {/* Tishli metall gardish */}
        <span aria-hidden className="absolute inset-0" style={{ background: t.rim, clipPath: t.clip }} />
        {/* Ichki metall halqa */}
        <span aria-hidden className="absolute inset-[11%] rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.35)]" style={{ background: t.ring }} />
        {/* Sirlangan (emal) yuz — nishonning o'z rangi */}
        <span
          aria-hidden
          className="absolute inset-[18%] overflow-hidden rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.45)]"
          style={{ background: `radial-gradient(circle at 32% 26%, ${light}, ${mid} 48%, ${dark})` }}
        >
          <span className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/45 to-transparent" />
          {!locked && (
            <span
              className="level-glint absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent motion-reduce:hidden"
              style={{ opacity: tier === "gold" ? 0.85 : tier === "silver" ? 0.6 : 0.4, animationDuration: tier === "gold" ? "2.4s" : "3.4s" }}
            />
          )}
        </span>
        <Icon aria-hidden className={cn("relative text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]", s.icon)} strokeWidth={2.4} />
        {!locked &&
          TWINKLES.slice(0, t.twinkles).map((tw, i) => (
            <Sparkle
              key={i}
              aria-hidden
              className="reward-twinkle pointer-events-none absolute fill-white text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.9)] motion-reduce:hidden"
              style={{ left: tw.left, top: tw.top, width: `${tw.size}%`, height: `${tw.size}%`, animationDelay: tw.delay }}
            />
          ))}
        {locked && (
          <span className={cn("absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-slate-700 text-white ring-2 ring-white dark:ring-surface", s.lock)}>
            <Lock className={s.lockIcon} />
          </span>
        )}
      </span>
      {/* Bosqich yulduzchalari: ★ ☆ ☆ */}
      <span aria-hidden className="relative -mt-1.5 flex items-center gap-px rounded-full bg-slate-950/85 px-1 py-0.5 ring-1 ring-white/20">
        {[1, 2, 3].map((n) => (
          <Star key={n} className={cn(s.star, !locked && n <= t.stars ? "fill-amber-300 text-amber-300" : "fill-transparent text-white/30")} strokeWidth={2} />
        ))}
      </span>
    </span>
  );
}
