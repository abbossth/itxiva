import { Crown, TrendingUp } from "lucide-react";
import { LeaderboardEntry } from "@/actions/leaderboard.actions";
import { CountUp } from "@/components/leaderboard/count-up";
import { initials } from "@/components/leaderboard/name-avatar";
import { cn } from "@/lib/utils";

interface PodiumProps {
  top3: LeaderboardEntry[];
  /** Reyting o'lchovi: coin yoki XP */
  unit?: "coin" | "XP";
}

/** Joy (chap/o'rta/o'ng) ro'yxatdagi tartibdan, ko'rinish (balandlik, rang, toj) esa o'rindan olinadi —
 *  teng coinli o'quvchilar bir xil balandlikda turadi */
const SLOTS = ["order-2", "order-1", "order-3"] as const;

// Shohsupa doim qorong'i sahna ustida turadi, shuning uchun ranglar ikkala rejimda bir xil
const PLACES = {
  1: {
    height: "h-32 sm:h-40",
    lip: "bg-amber-200",
    block: "from-amber-400 via-amber-500 to-amber-700",
    ring: "from-amber-100 via-amber-400 to-amber-600 shadow-[0_0_44px_rgba(251,191,36,0.45)]",
    avatar: "w-[4.5rem] h-[4.5rem] sm:w-24 sm:h-24 text-xl sm:text-2xl",
    medal: "Oltin",
    text: "text-white",
    delay: "320ms",
    label: "text-sm sm:text-base",
  },
  2: {
    height: "h-24 sm:h-28",
    lip: "bg-slate-100",
    block: "from-slate-200 via-slate-300 to-slate-500",
    ring: "from-white via-slate-300 to-slate-500",
    avatar: "w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] text-base sm:text-xl",
    medal: "Kumush",
    text: "text-slate-800",
    delay: "160ms",
    label: "text-xs sm:text-sm",
  },
  3: {
    height: "h-[4.5rem] sm:h-20",
    lip: "bg-orange-300",
    block: "from-orange-400 via-orange-500 to-orange-800",
    ring: "from-orange-200 via-orange-400 to-orange-700",
    avatar: "w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] text-base sm:text-xl",
    medal: "Bronza",
    text: "text-white",
    delay: "0ms",
    label: "text-xs sm:text-sm",
  },
} as const;

/** Kuchli uchlik: shohsupa pastdan ko'tariladi, 1-o'rinda toj va yorug'lik */
export function Podium({ top3, unit = "coin" }: PodiumProps) {
  const valid = (top3 || []).filter((e) => e.totalCoins > 0).slice(0, 3);
  if (valid.length === 0) return null;

  return (
    <div className="relative mx-auto flex max-w-xl items-end justify-center gap-2 sm:gap-5 pt-10">
      {valid.map((entry, i) => {
        const rank = Math.min(Math.max(entry.rank, 1), 3) as 1 | 2 | 3;
        const place = PLACES[rank];
        return (
          <div key={entry.userId} className={cn("flex min-w-0 flex-1 flex-col items-center", SLOTS[i])}>
            <div className="podium-person flex w-full min-w-0 flex-col items-center pb-3" style={{ animationDelay: `calc(${place.delay} + 350ms)` }}>
              <div className="relative">
                {rank === 1 && (
                  <Crown aria-hidden className="crown-float absolute -top-8 left-1/2 w-9 h-9 text-amber-300 fill-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.6)]" />
                )}
                <div className={cn("rounded-full bg-gradient-to-br p-[3px]", place.ring)}>
                  <div className={cn("flex items-center justify-center rounded-full bg-slate-900 font-mono font-black text-white", place.avatar)}>
                    {initials(entry.displayName)}
                  </div>
                </div>
                {entry.level !== undefined && (
                  <span
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] font-black text-white ring-1 ring-white/20"
                    title={entry.levelName}
                  >
                    Lv {entry.level}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "mt-3 max-w-full truncate px-1 text-center font-bold text-white",
                  place.label,
                  entry.isCurrentUser && "text-teal-300"
                )}
              >
                {entry.displayName}
                {entry.isCurrentUser && " (siz)"}
              </span>
              <span className="text-[11px] text-white/60">{entry.groupName}</span>
              <span className="mt-1.5 inline-flex items-baseline gap-1 rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-sm sm:text-base font-black tabular-nums text-amber-300 ring-1 ring-white/10">
                <CountUp value={entry.totalCoins} />
                <span className="text-[10px] font-bold text-amber-200/80">{unit}</span>
              </span>
              {entry.weekCoins > 0 && (
                <span className="mt-1 inline-flex items-center gap-0.5 font-mono text-[11px] font-bold text-emerald-300" title="Oxirgi 7 kunda">
                  <TrendingUp className="w-3 h-3" />+{entry.weekCoins}
                </span>
              )}
            </div>
            <div className="podium-rise w-full" style={{ animationDelay: place.delay }}>
              <div className={cn("mx-1.5 h-2 rounded-t-lg opacity-90", place.lip)} />
              <div
                className={cn(
                  "relative flex w-full flex-col items-center justify-start overflow-hidden rounded-t-md bg-gradient-to-b pt-2",
                  place.height,
                  place.block
                )}
              >
                {rank === 1 && (
                  <span aria-hidden className="podium-shine absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                )}
                <span className={cn("relative font-mono text-3xl sm:text-5xl font-black leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]", place.text)}>
                  {entry.rank}
                </span>
                <span className={cn("relative mt-1 text-[10px] font-bold uppercase tracking-widest opacity-85", place.text)}>{place.medal}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
