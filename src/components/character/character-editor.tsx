"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Box, Check, Coins, Lock, Sparkles, Square, Zap } from "lucide-react";
import { buyCharacterItemAction, buyEmoteAction, saveCharacterAction, upgradeCharacterPowerAction, type MyCharacter } from "@/actions/character.actions";
import { EMOTES, EMOTE_MS, hasEmote, type Emote } from "@/lib/character/emotes";
import {
  CHAR_ITEMS,
  CHAR_SLOTS,
  LEVEL_TIER_NAMES,
  MAX_POWER,
  OUTFIT_COLORS,
  POWER_STEPS,
  SLOT_LABELS,
  hasItem,
  type CharItem,
  type CharLook,
  type CharSlot,
} from "@/lib/character/catalog";
import { announceBalance } from "@/lib/rewards-client";
import { playRankUp, playRewardSound, unlockSound } from "@/lib/sound";
import { fireConfetti } from "@/lib/confetti";
import { useToast } from "@/components/ui/toast";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn, formatNumberUz } from "@/lib/utils";
import { CharacterSvg } from "./character-svg";
import { Character2D } from "./character-2d";
import { Character3D } from "./character-3d";

// Profil → "Personajim": personajni 2D yoki 3D ko'rinishda ko'rish (sichqoncha bilan o'ynash), qismlarini tanlash,
// coin evaziga yangi qism sotib olish va "kuch" upgrade. Har o'zgarish o'zi saqlanadi.

type Look = CharLook & { color: number };

const SLOT_ICONS: Record<CharSlot, string> = { skin: "🎨", hair: "💇", eyes: "👀", mouth: "👄", head: "🎩", outfit: "👕", back: "🎒", hand: "✋", pet: "🐾", costume: "🦸" };

export function CharacterEditor({ initial }: { initial: MyCharacter }) {
  const { toast } = useToast();
  const [me, setMe] = useState(initial);
  const [look, setLook] = useState<Look>(initial.look);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [slot, setSlot] = useState<CharSlot | "emotes">("outfit");
  const [buying, setBuying] = useState<CharItem | null>(null);
  const [buyingEmote, setBuyingEmote] = useState<Emote | null>(null);
  // Ko'rinishda ijro etilayotgan harakat (bosilganda 2,6 s)
  const [preview, setPreview] = useState<{ id: string; key: number } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showEmote = (id: string, key: number) => {
    setPreview({ id, key });
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreview(null), EMOTE_MS);
  };
  const [powerAsk, setPowerAsk] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [pending, start] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const gameLook = useMemo(() => ({ ...look, level: me.level }), [look, me.level]);

  // Har o'zgarish o'zi saqlanadi (0,6 s kutib — ketma-ket tanlashda bitta so'rov)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      // Birinchi kirishda (hali saqlanmagan) — standart personaj darhol saqlanadi: o'yinlarda ko'rinsin
      if (!initial.fresh) return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved("saving");
    saveTimer.current = setTimeout(() => {
      void saveCharacterAction(look).then((r) => {
        if (r.success && r.data) {
          setMe(r.data);
          setSaved("saved");
        } else setSaved("idle");
      });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [look, initial.fresh]);

  const equip = (it: CharItem) => {
    unlockSound();
    playRankUp();
    setLook((l) => ({ ...l, [it.slot]: it.id }));
  };

  const pick = (it: CharItem) => {
    if (hasItem(it, me.owned, me.level)) return equip(it);
    if (me.level < it.level) {
      toast.info(`"${it.name}" ${it.level}-darajada ochiladi`);
      return;
    }
    setBuying(it);
  };

  const buy = (it: CharItem) =>
    start(async () => {
      const r = await buyCharacterItemAction(it.slot, it.id);
      setBuying(null);
      if (!r.success || !r.data) {
        toast.error(r.message ?? "Sotib olib bo'lmadi");
        return;
      }
      setMe(r.data);
      announceBalance(r.data.balance);
      playRewardSound();
      void fireConfetti({ particleCount: 70, spread: 70, origin: { y: 0.4 }, zIndex: 80 });
      toast.success(`"${it.name}" sizniki! Personajga kiydirildi`);
      setLook((l) => ({ ...l, [it.slot]: it.id }));
    });

  const buyEmote = (e: Emote) =>
    start(async () => {
      const r = await buyEmoteAction(e.id);
      setBuyingEmote(null);
      if (!r.success || !r.data) {
        toast.error(r.message ?? "Sotib olib bo'lmadi");
        return;
      }
      setMe(r.data);
      announceBalance(r.data.balance);
      playRewardSound();
      void fireConfetti({ particleCount: 60, spread: 70, origin: { y: 0.4 }, zIndex: 80 });
      toast.success(`"${e.name}" harakati sizniki! Jonli o'yin kutish zalida bosing`);
    });

  const upgrade = () =>
    start(async () => {
      const r = await upgradeCharacterPowerAction();
      setPowerAsk(false);
      if (!r.success || !r.data) {
        toast.error(r.message ?? "Upgrade qilib bo'lmadi");
        return;
      }
      setMe(r.data);
      announceBalance(r.data.balance);
      playRewardSound();
      void fireConfetti({ particleCount: 110, spread: 90, origin: { y: 0.4 }, zIndex: 80 });
      toast.success(`⚡ Kuch ${r.data.power}-bosqichga oshdi!`);
      setLook((l) => ({ ...l, power: r.data!.power }));
    });

  const items = slot === "emotes" ? [] : CHAR_ITEMS.filter((it) => it.slot === slot);
  const nextPower = me.power < MAX_POWER ? POWER_STEPS[me.power] : null;
  const colorable = look.outfit === "tee" || look.outfit === "hoodie" || look.outfit === "hero";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Ko'rinish */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 p-4 text-white shadow-xs dark:border-slate-800/80 lg:sticky lg:top-4 lg:self-start">
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative flex items-center justify-between gap-2">
          <SegmentedControl
            size="sm"
            ariaLabel="Ko'rinish"
            value={view}
            onChange={setView}
            options={[
              { value: "2d", label: "2D", icon: <Square className="h-3.5 w-3.5" /> },
              { value: "3d", label: "3D", icon: <Box className="h-3.5 w-3.5" /> },
            ]}
          />
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
            <Coins className="h-3.5 w-3.5 text-amber-300" /> {formatNumberUz(me.balance)}
          </span>
        </div>
        <div className="relative mt-2">
          {view === "2d" || preview ? (
            <Character2D key={preview?.key ?? "base"} look={gameLook} size={210} emote={preview?.id ?? null} />
          ) : (
            <Character3D look={gameLook} height={330} onFail={() => setView("2d")} />
          )}
        </div>
        <p className="relative mt-1 text-center text-xs text-slate-300">
          {view === "3d" ? "Sudrab aylantiring · bosing — sakraydi va qo'l silkitadi" : "Personajni bosing — sakraydi! Ko'zlari sichqonchaga qaraydi"}
        </p>
        <div className="relative mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <p className="text-slate-400">Daraja</p>
            <p className="text-base font-black">
              {me.level} · {LEVEL_TIER_NAMES[me.level - 1]} supa
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <p className="text-slate-400">Kuch</p>
            <p className="text-base font-black text-amber-300">{"★".repeat(me.power)}{"☆".repeat(MAX_POWER - me.power)}</p>
          </div>
        </div>
        <p className="relative mt-3 text-center text-[11px] text-slate-400">
          {saved === "saving" ? "Saqlanmoqda…" : saved === "saved" ? "✓ Saqlandi — jonli o'yinlarda shu personaj bilan qatnashasiz" : "Jonli o'yinlarda shu personaj bilan qatnashasiz"}
        </p>
      </section>

      {/* Tanlash */}
      <section className="space-y-4">
        {/* Kuch upgrade */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/50 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-yellow-500/5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-900">
            <Zap className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-900 dark:text-slate-100">Kuch upgrade · {me.power}/{MAX_POWER}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {nextPower
                ? me.level >= nextPower.level
                  ? `Keyingi bosqich: ko'proq uchqun va yorqin nur — ${nextPower.price} coin`
                  : `Keyingi bosqich ${nextPower.level}-darajada ochiladi`
                : "Eng kuchli personaj! ⚡"}
            </p>
          </div>
          {nextPower && (
            <button
              type="button"
              disabled={pending || me.level < nextPower.level}
              onClick={() => setPowerAsk(true)}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-black text-white shadow-md shadow-amber-500/20 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {me.level < nextPower.level ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {me.level < nextPower.level ? `${nextPower.level}-daraja` : `${nextPower.price} coin`}
            </button>
          )}
        </div>

        {/* Qismlar */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-surface">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
            {CHAR_SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                className={cn(
                  "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition",
                  slot === s ? "bg-teal-600 text-white shadow-md shadow-teal-600/20" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                )}
              >
                <span>{SLOT_ICONS[s]}</span>
                {SLOT_LABELS[s]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSlot("emotes")}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition",
                slot === "emotes" ? "bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/20" : "bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 dark:bg-fuchsia-500/10 dark:text-fuchsia-300"
              )}
            >
              <span>🕺</span>
              Harakatlar
            </button>
          </div>

          {slot === "emotes" && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Jonli o&apos;yinning kutish zalida telefonda bosasiz — personajingiz katta ekranda shu harakatni qiladi. Bosib ko&apos;ring!
              </p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                {EMOTES.map((e) => {
                  const mine = hasEmote(e, me.owned);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={(ev) => {
                          unlockSound();
                          showEmote(e.id, ev.timeStamp);
                          if (!mine) setBuyingEmote(e);
                        }}
                        className={cn(
                          "relative flex w-full cursor-pointer flex-col items-center gap-1 rounded-2xl border p-2 text-center transition hover:-translate-y-0.5 hover:shadow-md",
                          preview?.id === e.id ? "border-fuchsia-500 bg-fuchsia-50 ring-2 ring-fuchsia-500/30 dark:bg-fuchsia-500/10" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
                        )}
                      >
                        <span className="text-3xl leading-none">{e.icon}</span>
                        <span className="line-clamp-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">{e.name}</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black",
                            e.price === 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : mine ? "bg-teal-600 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          )}
                        >
                          {e.price === 0 ? "Bepul" : mine ? (
                            <>
                              <Check className="h-3 w-3" /> Sizniki
                            </>
                          ) : (
                            <>🪙 {e.price}</>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {slot === "outfit" && colorable && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Rangi:</span>
              {OUTFIT_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Rang ${i + 1}`}
                  onClick={() => setLook((l) => ({ ...l, color: i }))}
                  className={cn("h-8 w-8 cursor-pointer rounded-full ring-2 ring-offset-2 transition dark:ring-offset-slate-900", look.color === i ? "ring-teal-500 scale-110" : "ring-transparent hover:scale-105")}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}

          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {items.map((it) => {
              const on = look[it.slot] === it.id;
              const owned = hasItem(it, me.owned, me.level);
              const locked = me.level < it.level;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => pick(it)}
                    className={cn(
                      "group relative flex w-full cursor-pointer flex-col items-center gap-1 rounded-2xl border p-2 text-center transition",
                      on
                        ? "border-teal-500 bg-teal-50 ring-2 ring-teal-500/30 dark:bg-teal-500/10"
                        : "border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/50",
                      locked && "opacity-60"
                    )}
                  >
                    <span className={cn("flex h-16 w-16 items-end justify-center", locked && "grayscale")}>
                      <CharacterSvg
                        look={{ ...look, [it.slot]: it.id, level: 1, power: 0 }}
                        size={it.slot === "skin" || it.slot === "hair" || it.slot === "eyes" || it.slot === "mouth" || it.slot === "head" ? 62 : 52}
                        headOnly={it.slot === "skin" || it.slot === "hair" || it.slot === "eyes" || it.slot === "mouth" || it.slot === "head"}
                        pedestal={false}
                        still
                      />
                    </span>
                    <span className="line-clamp-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">{it.name}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black",
                        on ? "bg-teal-600 text-white" : owned ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : locked ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                      )}
                    >
                      {on ? (
                        <>
                          <Check className="h-3 w-3" /> Kiyilgan
                        </>
                      ) : owned ? (
                        "Sizniki"
                      ) : locked ? (
                        <>
                          <Lock className="h-3 w-3" /> {it.level}-daraja
                        </>
                      ) : (
                        <>🪙 {it.price}</>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Darajangiz oshgani sari personaj o&apos;zi kuchayadi: supa materiali o&apos;zgaradi, 4-darajadan aura, 7-dan aylanuvchi nur, 10-darajada yulduzlar. Yangi qismlar ham ochiladi.
          </p>
        </div>
      </section>

      <ConfirmDialog
        isOpen={Boolean(buying)}
        onClose={() => setBuying(null)}
        onConfirm={() => {
          if (buying) buy(buying);
        }}
        isLoading={pending}
        title={buying ? `"${buying.name}" sotib olinsinmi?` : ""}
        description={buying ? `${buying.price} coin yechiladi (balansingiz: ${formatNumberUz(me.balance)}). Bir marta sotib olinadi — keyin xohlagan paytda kiyasiz.` : ""}
        confirmText={buying ? `${buying.price} coin — sotib olish` : "Sotib olish"}
      />
      <ConfirmDialog
        isOpen={Boolean(buyingEmote)}
        onClose={() => setBuyingEmote(null)}
        onConfirm={() => {
          if (buyingEmote) buyEmote(buyingEmote);
        }}
        isLoading={pending}
        title={buyingEmote ? `"${buyingEmote.name}" harakati sotib olinsinmi?` : ""}
        description={buyingEmote ? `${buyingEmote.price} coin yechiladi (balansingiz: ${formatNumberUz(me.balance)}). Keyin jonli o'yinlarda xohlagancha ishlatasiz.` : ""}
        confirmText={buyingEmote ? `${buyingEmote.price} coin — sotib olish` : "Sotib olish"}
      />
      <ConfirmDialog
        isOpen={powerAsk}
        onClose={() => setPowerAsk(false)}
        onConfirm={upgrade}
        isLoading={pending}
        title={`Kuchni ${me.power + 1}-bosqichga oshirasizmi?`}
        description={nextPower ? `${nextPower.price} coin yechiladi (balansingiz: ${formatNumberUz(me.balance)}). Personaj atrofida ko'proq uchqun va yorqinroq nur paydo bo'ladi.` : ""}
        confirmText={nextPower ? `${nextPower.price} coin — upgrade` : "Upgrade"}
      />
    </div>
  );
}
