"use client";

import { useEffect, useState, useTransition } from "react";
import { Coins, Minus, Plus } from "lucide-react";
import { applyLiveBoosterAction } from "@/actions/live-game.actions";
import { buyBoosterAction, getMyBoostersAction, type MyBoosters } from "@/actions/booster.actions";
import { BOOSTERS, boosterWorks, type BoosterId } from "@/lib/live-game/boosters";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";
import { announceBalance } from "@/lib/rewards-client";
import { haptic } from "@/lib/haptics";
import { playRankUp, playRewardSound, playWhoosh, unlockSound } from "@/lib/sound";
import { cn, formatNumberUz } from "@/lib/utils";

// O'yin kuchaytirgichlari: savol paytida telefondagi panel (ishlatish) va do'kon (coin evaziga sotib olish).

const nonce = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Savol paytida: zaxiradagi kuchaytirgichlar. 50/50 — yashiriladigan variantlarni qaytaradi */
export function BoosterBar({
  gameId,
  index,
  mode,
  question,
  active,
  onHide,
}: {
  gameId: string;
  index: number;
  mode: LiveGameMode;
  question: { type: string; options: string[] };
  /** Shu savolda allaqachon ishlatilganlar (serverdan) */
  active: string[];
  onHide: (opts: string[]) => void;
}) {
  const [data, setData] = useState<MyBoosters | null>(null);
  const [used, setUsed] = useState<string[]>(active);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    void getMyBoostersAction()
      .then(setData)
      .catch(() => {});
  }, []);
  const list = BOOSTERS.filter((b) => boosterWorks(b.id, mode, question));
  if (!data || list.length === 0) return null;
  const have = list.filter((b) => data.counts[b.id] > 0 || used.includes(b.id));
  if (have.length === 0) return null;

  const fire = (id: BoosterId) =>
    start(async () => {
      unlockSound();
      const r = await applyLiveBoosterAction(gameId, index, id);
      if (!r.success) {
        setMsg(r.error);
        return;
      }
      setUsed((u) => [...u, id]);
      setData((d) => (d ? { ...d, counts: { ...d.counts, [id]: Math.max(0, d.counts[id] - 1) } } : d));
      if (r.data.hide.length) onHide(r.data.hide);
      playRankUp();
      playWhoosh(0.3);
      haptic([20, 30, 20]);
      setMsg(null);
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {have.map((b) => {
          const on = used.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              disabled={on || pending || data.counts[b.id] <= 0}
              onClick={() => fire(b.id)}
              className={cn(
                "inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-2xl px-3 text-sm font-black shadow-lg ring-1 transition active:scale-95 disabled:cursor-default",
                on ? "booster-on bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 ring-white/50" : "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white ring-white/20 hover:brightness-110"
              )}
              title={b.desc}
            >
              <span className="text-lg leading-none">{b.icon}</span>
              {b.name}
              {on ? <span className="text-xs">✓ faol</span> : <span className="rounded-full bg-black/25 px-1.5 text-xs">{data.counts[b.id]}</span>}
            </button>
          );
        })}
      </div>
      {msg && <p className="text-center text-xs font-bold text-rose-300">{msg}</p>}
    </div>
  );
}

/** Do'kon: kuchaytirgichlarni sotib olish (profil va kutish zalida) */
export function BoosterShop({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<MyBoosters | null>(null);
  const [qty, setQty] = useState<Record<BoosterId, number>>({ fifty: 1, double: 1, guard: 1 });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    void getMyBoostersAction()
      .then(setData)
      .catch(() => {});
  }, []);

  const buy = (id: BoosterId) =>
    start(async () => {
      unlockSound();
      const r = await buyBoosterAction(id, qty[id], nonce());
      if (!r.success || !r.data) {
        setMsg({ text: r.message ?? "Sotib olib bo'lmadi", ok: false });
        return;
      }
      setData(r.data);
      announceBalance(r.data.balance);
      playRewardSound(0.7);
      setMsg({ text: "Sotib olindi! O'yinda savol paytida bosing", ok: true });
    });

  return (
    <div className={cn("w-full space-y-2", compact ? "max-w-md" : "")}>
      <div className="flex items-center justify-between px-1">
        <p className={cn("font-black", compact ? "text-xs text-amber-200" : "text-sm text-slate-900 dark:text-slate-100")}>🎒 O&apos;yin uchun kuchaytirgichlar</p>
        {data && (
          <span className={cn("inline-flex items-center gap-1 text-xs font-bold", compact ? "text-white/80" : "text-slate-500")}>
            <Coins className="h-3.5 w-3.5 text-amber-400" /> {formatNumberUz(data.balance)}
          </span>
        )}
      </div>
      <ul className={cn("grid gap-2", compact ? "grid-cols-3" : "sm:grid-cols-3")}>
        {BOOSTERS.map((b) => (
          <li
            key={b.id}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl p-2.5 text-center ring-1",
              compact ? "bg-gradient-to-b from-violet-600/40 to-slate-900/60 ring-white/15" : "bg-gradient-to-b from-violet-50 to-white ring-violet-200 dark:from-violet-500/10 dark:to-transparent dark:ring-violet-500/30"
            )}
          >
            <span className="text-3xl leading-none">{b.icon}</span>
            <span className={cn("text-sm font-black", compact ? "text-white" : "text-slate-900 dark:text-slate-100")}>{b.name}</span>
            {!compact && <span className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{b.desc}</span>}
            <span className={cn("text-[11px] font-bold", compact ? "text-white/70" : "text-slate-500")}>Sizda: {data?.counts[b.id] ?? 0} ta</span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Kamroq" onClick={() => setQty((q) => ({ ...q, [b.id]: Math.max(1, q[b.id] - 1) }))} className="rounded-lg bg-black/10 p-1 dark:bg-white/10">
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-5 font-mono text-sm font-black">{qty[b.id]}</span>
              <button type="button" aria-label="Ko'proq" onClick={() => setQty((q) => ({ ...q, [b.id]: Math.min(5, q[b.id] + 1) }))} className="rounded-lg bg-black/10 p-1 dark:bg-white/10">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => buy(b.id)}
              className="w-full cursor-pointer rounded-xl bg-amber-400 px-2 py-1.5 text-xs font-black text-slate-900 shadow hover:bg-amber-300 disabled:opacity-60"
            >
              🪙 {b.price * qty[b.id]}
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className={cn("text-center text-xs font-bold", msg.ok ? "text-emerald-400" : "text-rose-400")}>{msg.text}</p>}
    </div>
  );
}
