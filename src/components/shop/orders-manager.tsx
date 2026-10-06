"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, Check, X, Gift, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoinBadge } from "@/components/ui/coin-badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  acceptOrderAction,
  rejectOrderAction,
  handOverOrderAction,
  ShopOrder,
} from "@/actions/shop.actions";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { cn, formatDateTimeUz } from "@/lib/utils";
import type { OrderStatus } from "@/lib/db/models/order.model";

const TABS: { id: string; label: string; statuses: OrderStatus[]; empty: string }[] = [
  { id: "new", label: "Yangi", statuses: ["pending"], empty: "Yangi buyurtmalar yo'q" },
  { id: "accepted", label: "Qabul qilingan", statuses: ["accepted"], empty: "Topshirilishi kerak bo'lgan buyurtma yo'q" },
  { id: "handed", label: "Topshirilgan", statuses: ["handed_over"], empty: "O'quvchi tasdig'ini kutayotgan buyurtma yo'q" },
  { id: "done", label: "Tarix", statuses: ["received", "rejected", "cancelled"], empty: "Yakunlangan buyurtmalar hali yo'q" },
];

export function OrdersManager({ initialOrders }: { initialOrders: ShopOrder[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [tab, setTab] = useState("new");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toReject, setToReject] = useState<ShopOrder | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) c[t.id] = orders.filter((o) => t.statuses.includes(o.status)).length;
    return c;
  }, [orders]);

  const activeTab = TABS.find((t) => t.id === tab)!;
  const visible = orders.filter((o) => activeTab.statuses.includes(o.status));

  const run = async (
    order: ShopOrder,
    action: () => Promise<{ success: boolean; message?: string }>,
    nextStatus: OrderStatus
  ) => {
    try {
      setBusyId(order._id);
      const res = await action();
      if (res.success) {
        // Karta darhol keyingi bo'limga o'tadi; server holati fonda yangilanadi
        setOrders((prev) => prev.map((o) => (o._id === order._id ? { ...o, status: nextStatus } : o)));
        toast.success(res.message || "Bajarildi");
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
      router.refresh();
      return res.success;
    } catch {
      toast.error("Amalni bajarib bo'lmadi");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toReject) return;
    const ok = await run(toReject, () => rejectOrderAction(toReject._id, rejectNote), "rejected");
    if (ok) {
      setToReject(null);
      setRejectNote("");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader
        icon={PackageCheck}
        title="Buyurtmalar"
        subtitle="O'quvchilar coin evaziga bergan buyurtmalarni qabul qiling va topshiring"
      />

      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl text-sm font-semibold border transition-colors cursor-pointer",
              tab === t.id
                ? "bg-teal-500/10 border-teal-500/40 text-teal-700 dark:text-teal-300"
                : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            )}
          >
            {t.label}
            <span
              className={cn(
                "min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center",
                t.id === "new" && counts[t.id] > 0
                  ? "bg-amber-500 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              )}
            >
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={PackageCheck} title={activeTab.empty} />
      ) : (
        <div key={tab} className="grid gap-3 sm:grid-cols-2 page-enter">
          {visible.map((order) => (
            <div
              key={order._id}
              className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3"
            >
              <div className="flex items-center gap-3">
                <Avatar name={order.student?.fullName || "?"} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {order.student?.fullName || "O'chirilgan o'quvchi"}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {order.student?.groupName || "Guruhsiz"}
                    {order.student ? ` · @${order.student.login}` : ""}
                  </div>
                </div>
                <Badge variant={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200 min-w-0">
                  <Gift className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="truncate">{order.productTitle}</span>
                </span>
                <CoinBadge amount={order.price} size="sm" animate={false} />
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                {order.createdAt ? formatDateTimeUz(order.createdAt) : ""}
                {order.mentorNote ? <span className="italic truncate"> · {order.mentorNote}</span> : null}
              </div>

              {order.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="flex-1 gap-1.5"
                    isLoading={busyId === order._id}
                    onClick={() => run(order, () => acceptOrderAction(order._id), "accepted")}
                  >
                    <Check className="w-4 h-4" />
                    Qabul qilish
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5 text-rose-600 dark:text-rose-400"
                    disabled={busyId === order._id}
                    onClick={() => setToReject(order)}
                  >
                    <X className="w-4 h-4" />
                    Bekor qilish
                  </Button>
                </div>
              )}

              {order.status === "accepted" && (
                <div className="flex gap-2">
                  <Button
                    variant="gold"
                    className="flex-1 gap-1.5"
                    isLoading={busyId === order._id}
                    onClick={() => run(order, () => handOverOrderAction(order._id), "handed_over")}
                  >
                    <Gift className="w-4 h-4" />
                    Topshirdim
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-rose-600 dark:text-rose-400"
                    disabled={busyId === order._id}
                    onClick={() => setToReject(order)}
                  >
                    Bekor qilish
                  </Button>
                </div>
              )}

              {order.status === "handed_over" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  O&apos;quvchi &quot;Qabul qildim&quot; tugmasini bosishi kutilmoqda
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(toReject)} onOpenChange={(open) => !open && setToReject(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>Buyurtmani bekor qilish</DialogTitle>
            <DialogDescription>
              {toReject?.student?.fullName} — {toReject?.productTitle}. {toReject?.price} coin o&apos;quvchiga
              qaytariladi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReject} className="space-y-4">
            <Field htmlFor="reject-note" label="Sabab (ixtiyoriy)" hint="O'quvchi bu izohni ko'radi">
              <Textarea
                id="reject-note"
                rows={3}
                maxLength={300}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Masalan: mahsulot hozircha qolmadi"
              />
            </Field>
            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={() => setToReject(null)}>
                Ortga
              </Button>
              <Button type="submit" variant="danger" isLoading={busyId === toReject?._id}>
                Bekor qilish va coinni qaytarish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
