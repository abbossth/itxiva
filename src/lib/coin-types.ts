import type { CoinTransactionType } from "@/lib/db/models/coin-ledger.model";

export const COIN_TYPE_LABELS: Record<CoinTransactionType, string> = {
  attendance: "Davomat",
  quiz: "Testlar",
  exam: "Imtihonlar",
  homework: "Uyga vazifalar",
  bonus: "Bonus",
  purchase: "Do'kon xaridlari",
  adjustment: "Tuzatishlar",
};

/** Har bir manba uchun alohida rang (grafik va belgilar) */
export const COIN_TYPE_COLORS: Record<CoinTransactionType, { bar: string; soft: string }> = {
  attendance: { bar: "bg-sky-500", soft: "bg-sky-500/15 text-sky-800 dark:text-sky-300" },
  quiz: { bar: "bg-violet-500", soft: "bg-violet-500/15 text-violet-800 dark:text-violet-300" },
  exam: { bar: "bg-indigo-500", soft: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300" },
  homework: { bar: "bg-emerald-500", soft: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" },
  bonus: { bar: "bg-amber-500", soft: "bg-amber-500/20 text-amber-900 dark:text-amber-300" },
  purchase: { bar: "bg-rose-500", soft: "bg-rose-500/15 text-rose-800 dark:text-rose-300" },
  adjustment: { bar: "bg-slate-400", soft: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200" },
};
