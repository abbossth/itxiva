"use client";

import { useState } from "react";
import { openLivePrizeAction, type LivePrizeView } from "@/actions/live-game.actions";
import { SUPER_WHEEL } from "@/lib/live-game/minigames";
import { fireConfetti } from "@/lib/confetti";
import { haptic } from "@/lib/haptics";
import { playDrumroll, playRewardSound } from "@/lib/sound";
import { requestRewardCheck } from "@/lib/rewards-client";
import { PrizeWheel } from "./prize-wheel";
import Link from "@/components/ui/link";
import { CharacterSvg } from "@/components/character/character-svg";
import type { GameLook } from "@/lib/character/catalog";
import type { GiftView } from "@/lib/character/grant";
import { cn } from "@/lib/utils";

// O'yin oxirida: omad g'ildiragidan yutilgan sovg'alar. 🎁 Super priz — quti (5–20 coin yoki personajga buyum),
// 🎡 Super baraban — 5–50 coin, personajga buyum yoki kuch +1. Natija serverda tanlanadi va darhol beriladi.

const SUPER_SEGMENTS = SUPER_WHEEL.map((w) => ({ label: w.gift === "item" ? "👕" : w.gift === "power" ? "⚡+1" : String(w.coins), color: w.color }));

/** Personaj sovg'asi: personaj shu buyumni kiyib (yoki kuch uchqunlari bilan) xursand bo'ladi */
function GiftReveal({ gift, look, already }: { gift: GiftView; look: GameLook | null; already: boolean }) {
  const preview = { ...(look ?? {}), ...(gift.kind === "item" && gift.slot ? { [gift.slot]: gift.key.split(":")[1] } : { power: gift.power }) };
  return (
    <div className="live-pop relative flex flex-col items-center rounded-3xl bg-slate-950/80 px-5 py-3 ring-2 ring-cyan-300/70 shadow-[0_0_40px_rgba(34,211,238,0.45)]">
      <CharacterSvg look={preview} size={110} mood="happy" />
      <span className="text-xs font-black uppercase tracking-widest text-cyan-200">Personaj sovg&apos;asi</span>
      <span className="text-xl font-black text-white">
        {gift.kind === "power" ? "⚡ " : ""}
        {gift.name}
      </span>
      <span className="text-[11px] text-slate-300">{gift.slotLabel}</span>
      <Link href="/profile?tab=character" className="mt-2 rounded-xl bg-cyan-400 px-3 py-1.5 text-xs font-black text-slate-950">
        {already ? "Personajni ochish" : "Hoziroq kiyib ko'rish"}
      </Link>
    </div>
  );
}

function celebrate(big: boolean) {
  void fireConfetti({ particleCount: big ? 220 : 140, spread: big ? 120 : 90, origin: { y: 0.45 }, zIndex: 80 });
  playRewardSound();
  haptic([40, 30, 40, 30, 90]);
  // Umumiy mukofot oynasi (daraja, nishon) sovg'a natijasini yopib qo'ymasin — biroz keyin
  setTimeout(requestRewardCheck, 4000);
}

export function LivePrizes({ gameId, prizes, look = null }: { gameId: string; prizes: LivePrizeView[]; look?: GameLook | null }) {
  if (prizes.length === 0) return null;
  return (
    <div className="w-full space-y-4">
      <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-200">Sizning sovg&apos;alaringiz</p>
      {prizes.map((p) =>
        p.kind === "box" ? <PrizeBox key={p.round} gameId={gameId} prize={p} look={look} /> : <SuperWheelPrize key={p.round} gameId={gameId} prize={p} look={look} />
      )}
    </div>
  );
}

function useOpen(gameId: string, prize: LivePrizeView) {
  const [result, setResult] = useState<{ coins: number; segment: number; gift: GiftView | null } | null>(
    prize.opened ? { coins: prize.coins, segment: prize.segment, gift: prize.gift } : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    if (busy || result) return null;
    setBusy(true);
    setError(null);
    try {
      const res = await openLivePrizeAction(gameId, prize.round);
      if (!res.success) {
        setError(res.error);
        return null;
      }
      return res.data;
    } catch {
      setError("Internet aloqasi uzildi — qayta urinib ko'ring");
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { result, setResult, busy, error, open, alreadyOpened: prize.opened };
}

/** Super priz: quti silkinadi, qopqog'i ochiladi, ichidan coin chiqadi */
function PrizeBox({ gameId, prize, look }: { gameId: string; prize: LivePrizeView; look: GameLook | null }) {
  const { result, setResult, busy, error, open, alreadyOpened } = useOpen(gameId, prize);
  const [shaking, setShaking] = useState(false);

  const onOpen = async () => {
    setShaking(true);
    playDrumroll(1.4);
    haptic([20, 40, 20, 40, 20]);
    const [data] = await Promise.all([open(), new Promise((r) => setTimeout(r, 1500))]);
    setShaking(false);
    if (data) {
      setResult({ coins: data.coins, segment: data.segment, gift: data.gift });
      celebrate(data.coins >= 15 || Boolean(data.gift));
    }
  };

  const opened = Boolean(result);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/25 via-fuchsia-500/20 to-sky-500/20 p-5 ring-1 ring-amber-300/40">
      <p className="relative z-10 text-lg font-black">🎁 Super priz</p>
      <div className="relative mx-auto my-3 flex h-44 w-44 items-center justify-center">
        <div className="live-rays pointer-events-none absolute inset-[-30%] rounded-full bg-[repeating-conic-gradient(rgba(253,224,71,0.35)_0deg_10deg,transparent_10deg_24deg)]" />
        {opened && result?.gift ? (
          <GiftReveal gift={result.gift} look={look} already={alreadyOpened} />
        ) : opened ? (
          <div className="live-pop relative flex flex-col items-center rounded-3xl bg-slate-950/80 px-6 py-3 ring-2 ring-amber-300/70 shadow-[0_0_40px_rgba(251,191,36,0.5)]">
            <span className="text-5xl">🪙</span>
            <span className="font-mono text-5xl font-black text-amber-300">+{result!.coins}</span>
            <span className="text-sm font-bold text-amber-100">coin</span>
          </div>
        ) : (
          <span className={cn("relative select-none text-[7.5rem] leading-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]", shaking ? "live-chest" : "live-chest-idle")}>
            🎁
          </span>
        )}
      </div>
      {opened ? (
        <p className="text-center text-sm font-semibold text-amber-100">
          {alreadyOpened ? "Bu quti ochilgan" : result?.gift ? "Personajingizga qo'shildi!" : "Balansingizga qo'shildi!"}
        </p>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          disabled={busy || shaking}
          className="quiz-pulse relative z-10 mx-auto flex min-h-[56px] w-full max-w-xs items-center justify-center rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-pink-400 text-xl font-black text-slate-950 disabled:opacity-70"
        >
          {shaking ? "Ochilmoqda…" : "Qutini ochish"}
        </button>
      )}
      {error && <p className="mt-2 text-center text-sm font-semibold text-rose-300">{error}</p>}
    </div>
  );
}

/** Super baraban: 5 dan 50 gacha coin */
function SuperWheelPrize({ gameId, prize, look }: { gameId: string; prize: LivePrizeView; look: GameLook | null }) {
  const { result, setResult, busy, error, open, alreadyOpened } = useOpen(gameId, prize);
  const [spin, setSpin] = useState<{ segment: number; coins: number; gift: GiftView | null } | null>(null);
  const [stopped, setStopped] = useState(alreadyOpened);

  const onSpin = async () => {
    const data = await open();
    if (data) setSpin({ segment: data.segment, coins: data.coins, gift: data.gift });
  };

  const shown = spin?.segment ?? result?.segment ?? 0;
  return (
    <div className="rounded-3xl bg-gradient-to-br from-pink-500/25 via-violet-500/20 to-amber-500/20 p-5 ring-1 ring-pink-300/40">
      <p className="text-lg font-black">🎡 Super baraban</p>
      <p className="text-xs text-slate-300">5 dan 50 coingacha, 👕 personajga buyum yoki ⚡ kuch +1 — omadingizni sinang!</p>
      <div className="my-4 flex justify-center">
        <PrizeWheel
          segments={SUPER_SEGMENTS}
          segment={shown}
          spinning={Boolean(spin)}
          size={260}
          center="🪙"
          onDone={() => {
            if (!spin) return;
            setResult({ coins: spin.coins, segment: spin.segment, gift: spin.gift });
            setStopped(true);
            celebrate(spin.coins >= 30 || Boolean(spin.gift));
          }}
        />
      </div>
      {stopped && result?.gift ? (
        <div className="flex justify-center">
          <GiftReveal gift={result.gift} look={look} already={alreadyOpened} />
        </div>
      ) : stopped && result ? (
        <p className="live-banner mx-auto w-fit rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-pink-400 px-6 py-3 text-center text-2xl font-black text-slate-950">
          +{result.coins} coin{alreadyOpened ? "" : "!"}
        </p>
      ) : spin ? (
        <p className="animate-pulse text-center text-xl font-black">Aylanmoqda…</p>
      ) : (
        <button
          type="button"
          onClick={onSpin}
          disabled={busy}
          className="quiz-pulse mx-auto flex min-h-[56px] w-full max-w-xs items-center justify-center rounded-2xl bg-gradient-to-r from-pink-400 via-fuchsia-400 to-amber-300 text-xl font-black text-slate-950 disabled:opacity-70"
        >
          🎡 Super barabanni aylantirish
        </button>
      )}
      {error && <p className="mt-2 text-center text-sm font-semibold text-rose-300">{error}</p>}
    </div>
  );
}
