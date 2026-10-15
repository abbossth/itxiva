import { cn } from "@/lib/utils";

/** Daraja raqami tushirilgan kvadrat (yon menyu, Yutuqlarim, tabrik oynasi) */
export function LevelBadge({ level, size = "sm", className }: { level: number; size?: "sm" | "md" | "xl"; className?: string }) {
  return (
    <span
      aria-label={`${level}-daraja`}
      className={cn(
        "relative grid shrink-0 place-items-center bg-teal-600 text-white shadow-sm",
        size === "sm" && "h-9 w-9 rounded-xl",
        size === "md" && "h-12 w-12 rounded-2xl",
        size === "xl" && "h-24 w-24 rounded-3xl shadow-lg shadow-teal-600/30",
        className
      )}
    >
      {size === "xl" && (
        <span className="absolute top-3.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/80">Daraja</span>
      )}
      <span
        className={cn(
          "font-mono font-black leading-none tabular-nums",
          size === "sm" && "text-base",
          size === "md" && "text-xl",
          size === "xl" && "mt-3 text-5xl"
        )}
      >
        {level}
      </span>
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
