"use client";

import { useState, useTransition } from "react";
import { Check, Crown, Sparkles } from "lucide-react";
import { buyPremiumAction, setPremiumStyleAction, type MyPremium } from "@/actions/premium.actions";
import { NAME_FONTS, PREMIUM_BADGES, PREMIUM_BUBBLES, PREMIUM_DAYS, PREMIUM_PERKS, bubbleOf, type PremiumStyle } from "@/lib/premium";
import { NAME_FONT_CLASS } from "@/lib/premium-fonts";
import { PREMIUM_STICKERS } from "@/lib/chat/media-catalog";
import { announceBalance } from "@/lib/rewards-client";
import { playRewardSound, unlockSound } from "@/lib/sound";
import { fireConfetti } from "@/lib/confetti";
import { useToast } from "@/components/ui/toast";
import { GoldCoin } from "@/components/ui/gold-coin";
import { AnimatedSticker } from "@/components/chat/animated-sticker";
import { PremiumName } from "./premium-name";
import { cn } from "@/lib/utils";

/** IT Xiva Premium: buy a month for coins, see perks, choose the name font, badge and color (live preview) */
export function PremiumView({ initial, name }: { initial: MyPremium; name: string }) {
  const [me, setMe] = useState(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const style = me.style;

  const buy = () =>
    start(async () => {
      unlockSound();
      const r = await buyPremiumAction();
      if (!r.success || !r.data) {
        toast.error(r.message ?? "Sotib olib bo'lmadi");
        return;
      }
      setMe(r.data);
      announceBalance(r.data.balance);
      playRewardSound(0.8);
      void fireConfetti({ particleCount: 140, spread: 100, origin: { y: 0.35 } });
      toast.success(initial.active ? `Premium yana ${PREMIUM_DAYS} kunga uzaytirildi!` : "Tabriklaymiz! Siz endi IT Xiva Premium a'zosisiz ✨");
    });

  const choose = (patch: Partial<PremiumStyle>) => {
    if (!me.active) return toast.info("Avval Premium oling — keyin uslubni tanlaysiz");
    setMe((m) => ({ ...m, style: { ...m.style, ...patch } }));
    start(async () => {
      const r = await setPremiumStyleAction(patch);
      if (!r.success || !r.data) toast.error(r.message ?? "Saqlab bo'lmadi");
      else setMe(r.data);
    });
  };

  const b = bubbleOf(style.bubble);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-fuchsia-600 to-amber-500 p-6 text-white shadow-xl">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner">
            <Crown className="h-9 w-9" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black sm:text-3xl">IT Xiva Premium</h1>
            <p className="text-sm text-white/85">
              {me.active ? `Faol · yana ${me.daysLeft} kun` : `${PREMIUM_DAYS} kun — ${me.price} coin`}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={buy}
            className="game-btn inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-5 font-black text-violet-700 shadow-lg disabled:opacity-60"
          >
            <Sparkles className="h-5 w-5" />
            {me.active ? "Uzaytirish" : "Sotib olish"} · <GoldCoin /> {me.price}
          </button>
        </div>
        <p className="mt-3 text-xs text-white/80">Balansingiz: {me.balance} coin. Coin dars, vazifa va o&apos;yinlarda yig&apos;iladi.</p>
      </section>

      {/* Perks */}
      <section className="grid gap-3 sm:grid-cols-2">
        {PREMIUM_PERKS.map((p) => (
          <div key={p.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-3xl">{p.icon}</span>
            <div>
              <p className="font-bold text-slate-900 dark:text-slate-100">{p.title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{p.text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Animated stickers showcase */}
      <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-2 font-bold text-slate-900 dark:text-slate-100">✨ Animatsiyali stikerlar</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {PREMIUM_STICKERS.map((s) => (
            <div key={s.id} className="flex flex-col items-center">
              <AnimatedSticker id={s.id} size={64} />
              <span className="text-[11px] text-slate-500">{s.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Style */}
      <section className={cn("space-y-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900", !me.active && "opacity-75")}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900 dark:text-slate-100">🎨 Chatdagi ko&apos;rinishingiz</p>
          {!me.active && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Premium bilan ochiladi</span>}
        </div>
        {/* Live preview */}
        <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800">
          <div className="max-w-[80%] rounded-[20px] rounded-bl-md px-3 py-2 text-sm text-white shadow" style={{ backgroundImage: `linear-gradient(135deg, ${b.from}, ${b.to})` }}>
            <p className="mb-0.5 text-xs font-bold">
              <PremiumName name={name} style={style} className="[&_.premium-name]:!text-white [&_.premium-name]:![background-image:none]" />
            </p>
            Salom! Bugun dars zo&apos;r bo&apos;ldi 🔥
          </div>
          <p className="mt-2 text-xs text-slate-500">Ismingiz boshqa joylarda: <PremiumName name={name} style={style} /></p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">Ism shrifti</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NAME_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => choose({ font: f.id })}
                className={cn("cursor-pointer rounded-xl border-2 px-2 py-2 text-center", style.font === f.id ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "border-slate-200 dark:border-slate-700")}
              >
                <span className={cn("block truncate text-base text-slate-900 dark:text-slate-100", NAME_FONT_CLASS[f.id])}>{name.split(" ")[0]}</span>
                <span className="text-[11px] text-slate-500">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">Premium belgisi</p>
          <div className="flex flex-wrap gap-2">
            {PREMIUM_BADGES.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => choose({ badge: x })}
                aria-pressed={style.badge === x}
                className={cn("flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 text-2xl", style.badge === x ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "border-slate-200 dark:border-slate-700")}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">Xabar va ism rangi</p>
          <div className="flex flex-wrap gap-2">
            {PREMIUM_BUBBLES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose({ bubble: c.id })}
                aria-label={c.label}
                title={c.label}
                className={cn("relative h-11 w-16 cursor-pointer rounded-xl ring-2 ring-offset-2 dark:ring-offset-slate-900", style.bubble === c.id ? "ring-violet-500" : "ring-transparent")}
                style={{ backgroundImage: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
              >
                {style.bubble === c.id && <Check className="absolute inset-0 m-auto h-5 w-5 text-white" />}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
