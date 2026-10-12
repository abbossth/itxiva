"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, CalendarCheck, GraduationCap, LucideIcon, RotateCcw, Search, ShoppingBag, Trash2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ArchiveItem, purgeArchiveAction, restoreArchiveAction } from "@/actions/archive.actions";
import type { ArchiveKind } from "@/lib/db/models/archive.model";
import { cn, formatDateTimeUz } from "@/lib/utils";

const KINDS: Record<ArchiveKind, { label: string; plural: string; icon: LucideIcon }> = {
  student: { label: "O'quvchi", plural: "O'quvchilar", icon: User },
  group: { label: "Guruh", plural: "Guruhlar", icon: Users },
  lesson: { label: "Dars", plural: "Darslar", icon: BookOpen },
  exam: { label: "Imtihon", plural: "Imtihonlar", icon: GraduationCap },
  attendance: { label: "Davomat", plural: "Davomatlar", icon: CalendarCheck },
  product: { label: "Mahsulot", plural: "Mahsulotlar", icon: ShoppingBag },
};

export function ArchiveView({ items }: { items: ArchiveItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [kind, setKind] = useState<ArchiveKind | "all">("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ item: ArchiveItem; action: "restore" | "purge" } | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const kindCounts = useMemo(() => {
    const counts = new Map<ArchiveKind, number>();
    for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
    return counts;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (kind === "all" || i.kind === kind) && (!q || `${i.title} ${i.subtitle}`.toLowerCase().includes(q)));
  }, [items, kind, query]);

  const confirm = async () => {
    if (!pending) return;
    try {
      setIsWorking(true);
      const res = pending.action === "restore" ? await restoreArchiveAction(pending.item._id) : await purgeArchiveAction(pending.item._id);
      if (res.success) {
        toast.success(res.message);
        setPending(null);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Amalni bajarib bo'lmadi");
    } finally {
      setIsWorking(false);
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="Arxiv bo'sh"
        description="O'chirilgan o'quvchi, guruh, dars, imtihon, davomat va mahsulotlar shu yerda saqlanadi. Ularni istalgan payt tiklash yoki butunlay o'chirish mumkin."
      />
    );
  }

  const chip = (value: ArchiveKind | "all", label: string, count: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={kind === value}
      onClick={() => setKind(value)}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 min-h-[36px] text-xs font-semibold cursor-pointer transition-colors",
        kind === value
          ? "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300"
          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
      )}
    >
      {label}
      <span className="font-mono opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        O&apos;chirilgan narsalar ma&apos;lumotlari bilan shu yerda turadi va ro&apos;yxatlar, reyting hamda hisobotlarga qo&apos;shilmaydi.
        Tiklasangiz — hammasi o&apos;z joyiga qaytadi. Butunlay o&apos;chirilganini qaytarib bo&apos;lmaydi.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nomi bo'yicha qidirish" aria-label="Arxivdan qidirish" className="pl-9" />
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {chip("all", "Hammasi", items.length)}
        {(Object.keys(KINDS) as ArchiveKind[]).filter((k) => kindCounts.has(k)).map((k) => chip(k, KINDS[k].plural, kindCounts.get(k) ?? 0))}
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Hech narsa topilmadi</p>
      ) : (
        <ul className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800">
          {visible.map((item) => {
            const meta = KINDS[item.kind];
            const Icon = meta.icon;
            return (
              <li key={item._id} className="p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 break-words">{item.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                      {[meta.label, item.subtitle].filter(Boolean).join(" · ")}
                    </p>
                    {item.contents && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-words">Birga saqlangan: {item.contents}</p>}
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      O&apos;chirilgan: {formatDateTimeUz(item.deletedAt)}
                      {item.deletedBy ? ` · ${item.deletedBy}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setPending({ item, action: "restore" })}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Tiklash
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 sm:flex-none text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                    onClick={() => setPending({ item, action: "purge" })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Butunlay o&apos;chirish
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        isOpen={pending?.action === "restore"}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        title="Arxivdan tiklash"
        confirmText="Ha, tiklash"
        isLoading={isWorking}
        description={
          <>
            <strong>{pending?.item.title}</strong> barcha ma&apos;lumotlari bilan o&apos;z joyiga qaytadi.
            {pending?.item.kind === "attendance" && " Shu dars uchun coinlar o'quvchilarga qayta hisoblanadi."}
            {pending?.item.kind === "student" && " O'quvchi eski login va paroli bilan yana kira oladi."}
          </>
        }
      />

      <ConfirmDialog
        isOpen={pending?.action === "purge"}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        title="Butunlay o'chirish"
        danger
        confirmText="Ha, butunlay o'chirish"
        isLoading={isWorking}
        description={
          <>
            <strong>{pending?.item.title}</strong>
            {pending?.item.contents ? ` va unga tegishli yozuvlar (${pending.item.contents})` : ""} butunlay o&apos;chiriladi. Bu amalni
            ortga qaytarib bo&apos;lmaydi.
          </>
        }
      />
    </div>
  );
}
