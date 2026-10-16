import type { CoinTransactionType } from "@/lib/db/models/coin-ledger.model";

export const COIN_TYPE_LABELS: Record<CoinTransactionType, string> = {
  attendance: "Davomat",
  quiz: "Testlar",
  exam: "Imtihonlar",
  homework: "Uyga vazifalar",
  bonus: "Bonus",
  purchase: "Do'kon xaridlari",
  adjustment: "Tuzatishlar",
  quest: "Topshiriqlar",
  level: "Daraja bonusi",
  login: "Kunlik kirish",
  streak: "Seriya",
  badge: "Nishonlar",
  challenge: "Guruh chellenji",
  xp_align: "XP tenglashtirish",
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
  quest: { bar: "bg-teal-500", soft: "bg-teal-500/15 text-teal-800 dark:text-teal-300" },
  level: { bar: "bg-fuchsia-500", soft: "bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300" },
  login: { bar: "bg-cyan-500", soft: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300" },
  streak: { bar: "bg-orange-500", soft: "bg-orange-500/15 text-orange-800 dark:text-orange-300" },
  badge: { bar: "bg-yellow-500", soft: "bg-yellow-500/20 text-yellow-900 dark:text-yellow-300" },
  challenge: { bar: "bg-lime-500", soft: "bg-lime-500/20 text-lime-900 dark:text-lime-300" },
  xp_align: { bar: "bg-slate-400", soft: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200" },
};
