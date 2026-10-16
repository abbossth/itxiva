import { Clock } from "lucide-react";
import { activeSale, saleLeftLabel, type SaleFields } from "@/lib/shop-sale";
import { cn, formatNumberUz } from "@/lib/utils";

/** Oltin tanga belgisi (narx yonida) */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("shrink-0 drop-shadow-sm", className)} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" className="fill-amber-500" />
      <circle cx="12" cy="12" r="8" fill="none" strokeWidth="1.5" className="stroke-amber-200" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fontFamily="monospace" fill="#FFFFFF">
        C
      </text>
    </svg>
  );
}

/**
 * Mahsulot narxi: katta raqam va tanga. Chegirma bo'lsa — yangi narx, eski narx chizilgan holda va foizi.
 */
export function PriceTag({ product, size = "lg", className }: { product: SaleFields; size?: "md" | "lg"; className?: string }) {
  const sale = activeSale(product);
  const price = sale?.price ?? product.price;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span className="inline-flex items-center gap-1.5">
        <CoinIcon className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
        <span
          className={cn(
            "font-mono font-black tabular-nums leading-none",
            size === "lg" ? "text-2xl sm:text-[1.75rem]" : "text-xl",
            sale ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-300"
          )}
        >
          {formatNumberUz(price)}
        </span>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">coin</span>
      </span>
      {sale && (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold tabular-nums text-slate-400 line-through decoration-2">{formatNumberUz(sale.oldPrice)}</span>
          <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-black text-white">−{sale.percent}%</span>
        </span>
      )}
    </div>
  );
}

/** Rasm ustidagi chegirma belgilari: chapda foiz, pastda qolgan vaqt */
export function SaleOverlay({ product }: { product: SaleFields }) {
  const sale = activeSale(product);
  if (!sale) return null;
  return (
    <>
      <span className="pointer-events-none absolute left-2 top-2 rounded-xl bg-rose-600 px-2.5 py-1 text-sm font-black text-white shadow-lg shadow-rose-600/30">
        −{sale.percent}%
      </span>
      {/* Qolgan vaqt server va brauzerda bir daqiqaga farq qilishi mumkin */}
      <span suppressHydrationWarning className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg bg-slate-950/75 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
        <Clock className="h-3 w-3" />
        Chegirma: {saleLeftLabel(sale.endsAt)}
      </span>
    </>
  );
}
