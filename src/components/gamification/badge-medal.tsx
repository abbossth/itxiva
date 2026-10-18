import { BookOpenCheck, BrainCircuit, CalendarCheck, Crown, Flame, GraduationCap, Lock, Rocket, Star, Target, Trophy, type LucideIcon } from "lucide-react";
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

// Bosqich oshgan sari ramka hashamatlashadi: mis → platina (toshlar, yorug'lik) → oltin (toj, 4 tosh, aylanuvchi nur, yaltirash)
const TIER_STYLE: Record<
  BadgeTier,
  { rim: string; clip: string; face: string; stars: number; gems: [number, number][]; glow?: number; aura?: boolean; crown?: boolean; shine?: boolean }
> = {
  bronze: {
    rim: "linear-gradient(135deg,#fed7aa,#c2410c 45%,#7c2d12)",
    clip: scallop(12, 46),
    face: "inset-[14%]",
    stars: 1,
    gems: [],
  },
  silver: {
    rim: "linear-gradient(135deg,#ffffff,#cbd5e1 35%,#64748b 70%,#e2e8f0)",
    clip: scallop(18, 45),
    face: "inset-[15%]",
    stars: 2,
    gems: [
      [0, 50],
      [100, 50],
    ],
    glow: 0.5,
  },
  gold: {
    rim: "linear-gradient(135deg,#fef9c3,#facc15 30%,#b45309 65%,#fde68a)",
    clip: scallop(24, 44),
    face: "inset-[16%]",
    stars: 3,
    gems: [
      [6, 30],
      [94, 30],
      [14, 84],
      [86, 84],
    ],
    glow: 0.85,
    aura: true,
    crown: true,
    shine: true,
  },
};

const SIZES = {
  sm: { box: "h-10 w-10", icon: "h-4 w-4", ribbon: "w-7 h-4", star: "h-2 w-2", glow: 7, gem: "h-1.5 w-1.5", crown: "h-3 w-3 -top-2" },
  md: { box: "h-16 w-16", icon: "h-7 w-7", ribbon: "w-10 h-6", star: "h-2.5 w-2.5", glow: 14, gem: "h-2.5 w-2.5", crown: "h-5 w-5 -top-3.5" },
  lg: { box: "h-24 w-24", icon: "h-10 w-10", ribbon: "w-14 h-8", star: "h-3.5 w-3.5", glow: 22, gem: "h-3.5 w-3.5", crown: "h-7 w-7 -top-5" },
} as const;

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Nishon medali. `tier` — olingan eng yuqori bosqich (null — hali olinmagan, qulf bilan).
 * Har nishon o'z rangida; bosqich oshgan sari ramka hashamatlashadi va yulduzchalar ko'payadi.
 */
export function BadgeMedal({ id, tier, size = "md", className }: { id: BadgeId; tier: BadgeTier | null; size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  const Icon = BADGE_ICON[id];
  const def = BADGE_BY_ID[id];
  const label = tier ? `${def?.title} · ${def?.tierNames[tier]} (${TIER_LABEL[tier]})` : `${def?.title} — hali olinmagan`;
  const [light, mid, dark] = COLOR[id];

  // Hali olinmagan: birinchi (bronza) medal xira va kulrang, qulf bilan — o'quvchi nimaga intilayotganini ko'radi
  const locked = !tier;
  const t = TIER_STYLE[tier ?? "bronze"];

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("relative inline-flex flex-col items-center", locked && "opacity-75 grayscale-[0.45] saturate-75", className)}
    >
      {/* Lenta: medal ortidan ikki uchi chiqib turadi */}
      <span aria-hidden className={cn("absolute top-[62%] flex justify-between", s.ribbon)}>
        <span className="h-full w-[46%]" style={{ background: mid, clipPath: "polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)", transform: "rotate(14deg)" }} />
        <span className="h-full w-[46%]" style={{ background: dark, clipPath: "polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)", transform: "rotate(-14deg)" }} />
      </span>
      <span
        className={cn("relative grid place-items-center", s.box)}
        style={!locked && t.glow ? { filter: `drop-shadow(0 0 ${s.glow}px ${hexA(mid, t.glow)})` } : undefined}
      >
        {t.aura && (
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
        <span aria-hidden className="absolute inset-0" style={{ background: t.rim, clipPath: t.clip }} />
        <span
          aria-hidden
          className={cn("absolute overflow-hidden rounded-full ring-1 ring-white/50", t.face)}
          style={{ background: `radial-gradient(circle at 30% 25%, ${light}, ${mid} 45%, ${dark})` }}
        >
          <span className="absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-black/25" />
          {t.shine && (
            <span className="podium-shine absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent motion-reduce:hidden" />
          )}
        </span>
        {t.gems.map(([x, y], i) => (
          <span
            key={i}
            aria-hidden
            className={cn("absolute -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-1 ring-white/80", s.gem)}
            style={{ left: `${x}%`, top: `${y}%`, background: `linear-gradient(135deg, #ffffff, ${light} 35%, ${mid} 70%, ${dark})`, boxShadow: `0 0 6px ${hexA(mid, 0.9)}` }}
          />
        ))}
        {t.crown && (
          <Crown aria-hidden className={cn("absolute left-1/2 -translate-x-1/2 fill-amber-300 text-amber-500 drop-shadow-[0_1px_3px_rgba(180,83,9,0.6)]", s.crown)} strokeWidth={2} />
        )}
        <Icon aria-hidden className={cn("relative text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]", s.icon)} strokeWidth={2.4} />
        {locked && (
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-slate-700 text-white ring-2 ring-white dark:ring-surface">
            <Lock className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      {/* Bosqich yulduzchalari: ★ ☆ ☆ */}
      <span aria-hidden className="relative -mt-1.5 flex items-center gap-px rounded-full bg-slate-950/85 px-1 py-0.5 ring-1 ring-white/20">
        {[1, 2, 3].map((n) => (
          <Star
            key={n}
            className={cn(s.star, !locked && n <= t.stars ? "fill-amber-300 text-amber-300" : "fill-transparent text-white/30")}
            strokeWidth={2}
          />
        ))}
      </span>
    </span>
  );
}
