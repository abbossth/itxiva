"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Loader2, TriangleAlert } from "lucide-react";
import { suggestProductPriceAction } from "@/actions/shop.actions";
import type { PriceSuggestion } from "@/lib/shop-pricing";
import { DEFAULT_SOM_PER_MONTH } from "@/lib/shop-pricing";
import { cn, formatNumberUz } from "@/lib/utils";

/**
 * Mahsulot formasida: mentor hayotdagi narxni (so'm) kiritgach, coin narxi tavsiya qilinadi.
 * Variant bosilsa, coin narxi maydoniga yoziladi. So'mdagi narx faqat mentorga ko'rinadi.
 */
export function PriceAdvisor({
  realPrice,
  productId,
  currentPrice,
  onPick,
}: {
  realPrice: number | null;
  productId: string | null;
  currentPrice: number;
  onPick: (price: number) => void;
}) {
  const [result, setResult] = useState<{ for: number; data: PriceSuggestion | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const valid = realPrice !== null && realPrice >= 100;

  // Yozib bo'lgach (biroz kutib) so'raladi — har bir raqamda emas
  useEffect(() => {
    if (!valid || realPrice === null) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await suggestProductPriceAction({ realPrice, productId });
        if (!cancelled) {
          setFailed(false);
          setResult({ for: realPrice, data });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [realPrice, productId, valid]);

  if (!valid) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-600 dark:text-slate-400">
        <Lightbulb className="mt-0.5 w-4 h-4 shrink-0 text-amber-500" />
        Mahsulotning hayotdagi narxini kiriting — coin narxini tavsiya qilaman.
      </p>
    );
  }
  if (failed) return <p className="text-xs text-rose-600 dark:text-rose-400">Tavsiyani hisoblab bo&apos;lmadi. Qayta urinib ko&apos;ring.</p>;
  return <PriceAdvisorView suggestion={result?.data ?? null} loading={result?.for !== realPrice} currentPrice={currentPrice} onPick={onPick} />;
}

/** Tavsiya paneli (ko'rinish): uchta variant, izoh va ogohlantirish */
export function PriceAdvisorView({
  suggestion: s,
  loading,
  currentPrice,
  onPick,
}: {
  suggestion: PriceSuggestion | null;
  loading: boolean;
  currentPrice: number;
  onPick: (price: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-amber-400/40 bg-amber-50/70 dark:bg-amber-500/10 p-3.5" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        Narx tavsiyasi
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {s && (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-50")}>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Arzonroq", s.low, "rag'bat uchun"],
                ["Tavsiya", s.suggested, "muvozanatli"],
                ["Qimmatroq", s.high, "kamyob narsa"],
              ] as const
            ).map(([label, value, hint]) => {
              const active = currentPrice === value;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onPick(value)}
                  aria-pressed={active}
                  className={cn(
                    "flex min-h-[64px] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors cursor-pointer",
                    active
                      ? "border-teal-600 bg-teal-600 text-white"
                      : label === "Tavsiya"
                        ? "border-amber-400 bg-white dark:bg-surface hover:border-teal-500"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-surface hover:border-teal-500"
                  )}
                >
                  <span className={cn("text-[10px] font-bold uppercase tracking-wide", active ? "text-white/80" : "text-slate-500 dark:text-slate-400")}>
                    {label}
                  </span>
                  <span className="font-mono text-lg font-black tabular-nums">{formatNumberUz(value)}</span>
                  <span className={cn("text-[10px]", active ? "text-white/80" : "text-slate-500 dark:text-slate-400")}>{hint}</span>
                </button>
              );
            })}
          </div>

          <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
            <li>
              {s.basis === "catalog"
                ? `Do'kondagi ${s.referencesUsed} ta mahsulot narxiga mos: 1 coin ≈ ${formatNumberUz(s.somPerCoin)} so'm.`
                : `So'mdagi narxi kiritilgan mahsulot hali kam, shuning uchun o'quvchilar daromadi bo'yicha: oylik o'rtacha daromad ≈ ${formatNumberUz(DEFAULT_SOM_PER_MONTH)} so'mlik sovg'a (1 coin ≈ ${formatNumberUz(s.somPerCoin)} so'm).`}
            </li>
            {s.weeksToEarn !== null && (
              <li>
                O&apos;rtacha o&apos;quvchi {formatNumberUz(s.suggested)} coinni taxminan <strong>{formatNumberUz(s.weeksToEarn)} haftada</strong> yig&apos;adi.
              </li>
            )}
            {s.nearest.length > 0 && (
              <li className="text-slate-500 dark:text-slate-400">
                Yaqin narxdagilar:{" "}
                {s.nearest.map((r) => `${r.title} — ${formatNumberUz(r.realPrice)} so'm → ${formatNumberUz(r.price)} coin`).join("; ")}
              </li>
            )}
          </ul>

          {s.warning && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-500/10 p-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
              <TriangleAlert className="mt-0.5 w-3.5 h-3.5 shrink-0" />
              {s.warning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
