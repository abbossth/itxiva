"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Sahifalash: "‹ 1 2 3 … 9 ›" — ko'p sahifada o'rtasi qisqartiriladi

function pagesOf(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total));
  const list = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export function Pager({ page, total, onPage, className }: { page: number; total: number; onPage: (page: number) => void; className?: string }) {
  if (total <= 1) return null;
  const btn = "flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl px-2 text-sm font-bold transition disabled:cursor-default disabled:opacity-40";
  return (
    <nav className={cn("flex items-center justify-center gap-1.5 pt-1", className)} aria-label="Sahifalar">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(btn, "bg-white ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-700")} aria-label="Oldingi sahifa">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pagesOf(page, total).map((p, i) =>
        p === "…" ? (
          <span key={`g${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(btn, p === page ? "bg-teal-600 text-white shadow" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700")}
          >
            {p}
          </button>
        )
      )}
      <button type="button" disabled={page >= total} onClick={() => onPage(page + 1)} className={cn(btn, "bg-white ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-700")} aria-label="Keyingi sahifa">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
