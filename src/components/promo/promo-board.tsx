import Link from "@/components/ui/link";
import { Megaphone } from "lucide-react";
import type { PromoView } from "@/lib/promo";
import { PromoCard } from "./promo-card";

/** Bosh sahifa: o'quvchilarning e'lonlari (bo'lmasa — o'quvchiga taklif, ustozga hech narsa) */
export function PromoBoard({ promos, role }: { promos: PromoView[]; role: "mentor" | "student" }) {
  if (promos.length === 0) {
    if (role !== "student") return null;
    return (
      <Link
        href="/shop#promo"
        className="stagger-item flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 transition-colors hover:border-teal-500/60 hover:text-teal-700 dark:border-slate-700 dark:text-slate-400"
      >
        <Megaphone className="h-5 w-5 shrink-0 text-teal-600" />
        <span className="min-w-0 flex-1">Bu yerda sizning e&apos;loningiz yoki loyihangiz turishi mumkin — do&apos;kondan coin evaziga joylang</span>
      </Link>
    );
  }
  return (
    <section aria-label="O'quvchilar e'lonlari" className="stagger-item space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Megaphone className="h-4 w-4 text-teal-600" /> O&apos;quvchilar e&apos;lonlari
        </h2>
        {role === "student" && (
          <Link href="/shop#promo" className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400">
            O&apos;zingiznikini joylang
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {promos.map((p) => (
          <PromoCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
