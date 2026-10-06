"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, Sparkles, PackageCheck, ArrowRight } from "lucide-react";
import { fireConfetti } from "@/lib/confetti";
import { CoinBadge } from "@/components/ui/coin-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { createOrderAction, ShopProduct } from "@/actions/shop.actions";

interface ShopCatalogProps {
  products: ShopProduct[];
  initialBalance: number;
  activeOrders: number;
}

export function ShopCatalog({ products, initialBalance, activeOrders }: ShopCatalogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [balance, setBalance] = useState(initialBalance);
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [stockOverrides, setStockOverrides] = useState<Record<string, number>>({});

  const handleOrder = async () => {
    if (!selected) return;
    try {
      setIsOrdering(true);
      const res = await createOrderAction(selected._id);
      if (res.success && res.data) {
        setBalance(res.data.balance);
        if (selected.stock !== null) {
          setStockOverrides((prev) => ({ ...prev, [selected._id]: (prev[selected._id] ?? selected.stock ?? 1) - 1 }));
        }
        fireConfetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
        toast.success(res.message || "Buyurtma berildi");
        setSelected(null);
        router.refresh();
      } else {
        toast.error(res.message || "Buyurtma berib bo'lmadi");
      }
    } catch {
      toast.error("Buyurtma berishda xatolik yuz berdi");
    } finally {
      setIsOrdering(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            Coin do&apos;koni
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Darslarda yig&apos;ilgan coinlaringizni sovg&apos;a va imtiyozlarga almashtiring
          </p>
        </div>

        <div className="p-3.5 px-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 shrink-0">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">Balansingiz:</div>
          <CoinBadge amount={balance} size="md" />
        </div>
      </div>

      <Link
        href="/shop/orders"
        className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center gap-3.5 text-xs sm:text-sm text-teal-900 dark:text-teal-200 hover:border-teal-500/50 transition-colors min-h-[56px]"
      >
        <PackageCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
        <span className="flex-1">
          {activeOrders > 0 ? (
            <>
              Sizda <strong>{activeOrders} ta</strong> faol buyurtma bor — holatini kuzating
            </>
          ) : (
            "Buyurtmalarim tarixi va holati"
          )}
        </span>
        <ArrowRight className="w-4 h-4 shrink-0" />
      </Link>

      {products.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Do'kon hozircha bo'sh"
          description="Mentor tez orada yangi sovg'alar qo'shadi. Coin yig'ishda davom eting!"
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {products.map((item) => {
            const stock = item.stock === null ? null : stockOverrides[item._id] ?? item.stock;
            const soldOut = stock !== null && stock <= 0;
            const canAfford = balance >= item.price;

            return (
              <div
                key={item._id}
                className="p-3 sm:p-4 rounded-3xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col gap-3 hover:border-teal-500/40 hover:shadow-md transition-all"
              >
                <ProductImage src={item.imageUrl} alt={item.title} className="aspect-[4/3] w-full" />

                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                      {item.category || "Sovg'a"}
                    </span>
                    {soldOut ? (
                      <Badge variant="secondary">Tugagan</Badge>
                    ) : stock !== null ? (
                      <Badge variant="warning">{stock} ta qoldi</Badge>
                    ) : null}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 leading-snug">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <CoinBadge amount={item.price} size="sm" animate={false} />
                  <Button
                    variant={canAfford && !soldOut ? "primary" : "secondary"}
                    className="w-full"
                    disabled={!canAfford || soldOut}
                    onClick={() => setSelected(item)}
                  >
                    {soldOut ? "Tugagan" : canAfford ? "Buyurtma berish" : `Yana ${item.price - balance} coin kerak`}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        onConfirm={handleOrder}
        title="Buyurtmani tasdiqlang"
        confirmText="Ha, buyurtma beraman"
        isLoading={isOrdering}
        description={
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>
              <strong>{selected?.title}</strong> uchun balansingizdan{" "}
              <strong className="text-amber-600 dark:text-amber-400">{selected?.price} coin</strong> yechiladi.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Qoladigan balans: {balance - (selected?.price ?? 0)} coin. Mentor ko&apos;rib chiqmaguncha buyurtmani bekor
              qilishingiz mumkin.
            </p>
          </div>
        }
      />
    </div>
  );
}
