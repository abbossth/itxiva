"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { approvePromoAction, rejectPromoAction } from "@/actions/promo.actions";
import type { PromoView } from "@/lib/promo";
import { PromoCard } from "./promo-card";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }) : "—";

/** Ustoz: bosh sahifadagi e'lon so'rovlari — tasdiqlash yoki sabab bilan rad etish */
export function PromoReview({ pending, recent }: { pending: PromoView[]; recent: PromoView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const act = async (id: string, ok: boolean) => {
    setBusy(id);
    const r = ok ? await approvePromoAction(id) : await rejectPromoAction(id, note[id]);
    setBusy(null);
    if (!r.success) return toast.error(r.message ?? "Xato");
    toast.success(r.message ?? "Bajarildi");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tasdiqlash kutilmoqda ({pending.length})</h2>
        {pending.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Yangi so&apos;rov yo&apos;q</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pending.map((p) => (
            <div key={p.id} className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-surface">
              <PromoCard p={p} />
              <p className="text-xs text-slate-500">
                {p.days} kun · {p.price} coin · {fmt(p.createdAt)}
                {p.link && (
                  <>
                    {" "}
                    · havola: <span className="break-all font-mono">{p.link}</span>
                  </>
                )}
              </p>
              <input
                value={note[p.id] ?? ""}
                onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                maxLength={300}
                placeholder="Rad etish sababi (ixtiyoriy)"
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="text-rose-600" isLoading={busy === p.id} onClick={() => void act(p.id, false)}>
                  <X className="h-4 w-4" /> Rad etish
                </Button>
                <Button isLoading={busy === p.id} onClick={() => void act(p.id, true)}>
                  <Check className="h-4 w-4" /> Tasdiqlash
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">So&apos;nggilar</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-surface">
            {recent.map((p) => {
              const live = p.status === "approved" && p.endsAt && new Date(p.endsAt).getTime() > now;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 basis-48 truncate">
                    <b>
                      {p.emoji} {p.title}
                    </b>{" "}
                    <span className="text-slate-500">— {p.author}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {p.status === "approved" ? (live ? `${fmt(p.startsAt)} → ${fmt(p.endsAt)}` : "tugagan") : p.status === "rejected" ? "rad etilgan" : "bekor qilingan"}
                  </span>
                  {live && (
                    <Button size="sm" variant="ghost" className="text-rose-600" isLoading={busy === p.id} onClick={() => void act(p.id, false)}>
                      Olib tashlash
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
