"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

// Sahifa ochilgandagi farq bir marta hisoblanadi va shu sahifa davomida o'zgarmaydi
const deltas = new Map<string, number>();
const subscribe = () => () => {};

function readDelta(rank: number): number {
  const key = `rank:${window.location.pathname}${window.location.search}`;
  const cacheKey = `${key}#${rank}`;
  if (!deltas.has(cacheKey)) {
    let delta = 0;
    try {
      const previous = Number(localStorage.getItem(key));
      if (previous > 0 && previous !== rank) delta = previous - rank;
    } catch {
      // saqlash imkoni bo'lmasa (maxfiy rejim) — shunchaki ko'rsatilmaydi
    }
    deltas.set(cacheKey, delta);
  }
  return deltas.get(cacheKey)!;
}

/**
 * O'quvchining o'rni oxirgi ko'rganidan beri o'zgargan bo'lsa, nechta pog'ona ko'tarilgani yoki tushganini ko'rsatadi.
 * Oxirgi ko'rilgan o'rin shu brauzerda (har filtr uchun alohida) saqlanadi.
 */
export function RankDelta({ rank }: { rank: number }) {
  const delta = useSyncExternalStore(subscribe, () => readDelta(rank), () => 0);

  useEffect(() => {
    try {
      localStorage.setItem(`rank:${window.location.pathname}${window.location.search}`, String(rank));
    } catch {
      // e'tiborsiz
    }
  }, [rank]);

  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={`rank-pop inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
        up ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      }`}
      title={up ? `${delta} pog'ona ko'tarildingiz` : `${-delta} pog'ona tushdingiz`}
    >
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(delta)}
      <span className="sr-only">{up ? " pog'ona ko'tarildingiz" : " pog'ona tushdingiz"}</span>
    </span>
  );
}
