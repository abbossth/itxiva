"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, Check, PartyPopper } from "lucide-react";
import { fireConfetti } from "@/lib/confetti";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoinBadge } from "@/components/ui/coin-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cancelOrderAction, confirmReceivedAction, ShopOrder } from "@/actions/shop.actions";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS, ORDER_STEPS } from "@/lib/order-status";
import { cn, formatDateTimeUz } from "@/lib/utils";
import type { OrderStatus } from "@/lib/db/models/order.model";

export function MyOrdersView({ initialOrders }: { initialOrders: ShopOrder[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (
    order: ShopOrder,
    action: (id: string) => Promise<{ success: boolean; message?: string }>,
    nextStatus: OrderStatus,
    celebrate = false
  ) => {
    try {
      setBusyId(order._id);
      const res = await action(order._id);
      if (res.success) {
        setOrders((prev) => prev.map((o) => (o._id === order._id ? { ...o, status: nextStatus } : o)));
        if (celebrate) fireConfetti({ origin: { y: 0.7 } });
        toast.success(res.message || "Bajarildi");
        router.refresh();
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
        router.refresh();
      }
    } catch {
      toast.error("Amalni bajarib bo'lmadi");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <PageHeader
        icon={PackageCheck}
        title="Buyurtmalarim"
        subtitle="Do'kondan bergan buyurtmalaringiz holati"
        backHref="/shop"
        backLabel="Do'konga qaytish"
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Hali buyurtma bermagansiz"
          description="Do'kondan yoqqan sovg'ani tanlab, coinlaringizga buyurtma bering"
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const closedBad = order.status === "rejected" || order.status === "cancelled";
            const stepIndex = ORDER_STEPS.findIndex((s) => s.status === order.status);
            return (
              <div
                key={order._id}
                className={cn(
                  "p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border shadow-xs space-y-4 transition-colors",
                  order.status === "handed_over"
                    ? "border-amber-500/60 ring-2 ring-amber-500/15"
                    : "border-slate-200/80 dark:border-slate-800/80"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{order.productTitle}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {order.createdAt ? formatDateTimeUz(order.createdAt) : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge variant={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                    <CoinBadge amount={order.price} size="sm" animate={false} />
                  </div>
                </div>

                {closedBad ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {order.status === "rejected" ? "Mentor buyurtmani rad etdi." : "Siz buyurtmani bekor qildingiz."}{" "}
                    Coinlar balansingizga qaytarildi.
                    {order.mentorNote ? <span className="block mt-1 italic">Izoh: {order.mentorNote}</span> : null}
                  </p>
                ) : (
                  <ol className="flex items-start">
                    {ORDER_STEPS.map((step, i) => {
                      const done = i <= stepIndex;
                      return (
                        <li key={step.status} className="flex-1 flex flex-col items-center text-center relative">
                          {i > 0 && (
                            <span
                              className={cn(
                                "absolute top-3 right-1/2 w-full h-0.5 -z-0 transition-colors",
                                done ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-700"
                              )}
                            />
                          )}
                          <span
                            className={cn(
                              "relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors",
                              done
                                ? "bg-teal-500 text-white"
                                : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                            )}
                          >
                            {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                          </span>
                          <span
                            className={cn(
                              "mt-1.5 text-[10px] sm:text-[11px] leading-tight px-1",
                              done ? "text-slate-800 dark:text-slate-200 font-semibold" : "text-slate-400"
                            )}
                          >
                            {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {order.status === "handed_over" && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
                    <span className="flex-1">Mentor sovg&apos;ani topshirganini belgiladi. Oldingizmi?</span>
                    <Button
                      variant="gold"
                      isLoading={busyId === order._id}
                      onClick={() => run(order, confirmReceivedAction, "received", true)}
                      className="gap-2 shrink-0"
                    >
                      <PartyPopper className="w-4 h-4" />
                      Qabul qildim
                    </Button>
                  </div>
                )}

                {order.status === "pending" && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      isLoading={busyId === order._id}
                      onClick={() => run(order, cancelOrderAction, "cancelled")}
                      className="text-rose-600 dark:text-rose-400 min-h-[44px]"
                    >
                      Buyurtmani bekor qilish
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
