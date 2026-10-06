import * as React from "react";
import { Download, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export function ReportSection({
  title,
  description,
  onExport,
  children,
  className,
}: {
  title: string;
  description?: string;
  onExport?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
        </div>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Bitta o'lchov bo'yicha gorizontal ustunlar ro'yxati (nom — ustun — qiymat) */
export function BarList({
  items,
  max,
  emptyText = "Bu davrda ma'lumot yo'q",
}: {
  items: { key: string; label: React.ReactNode; sub?: string; value: number | null; display: string }[];
  max?: number;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-400">{emptyText}</p>;
  }
  const top = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-200">
              {item.label}
              {item.sub && <span className="ml-1.5 font-normal text-slate-400">{item.sub}</span>}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-slate-100">{item.display}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-600 dark:bg-teal-400 transition-[width] duration-500"
              style={{ width: `${item.value === null ? 0 : Math.max(2, Math.min(100, (item.value / top) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
