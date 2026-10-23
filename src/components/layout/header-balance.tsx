"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/ui/link";
import { CoinIcon } from "@/components/shop/price-tag";
import { BALANCE_EVENT } from "@/lib/rewards-client";
import { COIN_HIT_EVENT } from "@/lib/coin-flight";
import { cn, formatNumberUz } from "@/lib/utils";

/**
 * O'quvchining coin balansi header'da (bosilsa do'kon ochiladi). Server qiymati sahifa yangilanganda keladi,
 * xarid yoki mukofotdan keyin esa hodisa orqali darhol o'zgaradi — raqam sanab o'tadi.
 */
export function HeaderBalance({ initial }: { initial: number }) {
  const [target, setTarget] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [pulse, setPulse] = useState(false);
  // Uchib kelgan tanga tekkanda kichik "tebranish" va "+N" yozuvi
  const [hits, setHits] = useState(0);
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null);
  const targetRef = useRef(initial);

  useEffect(() => {
    const onBalance = (e: Event) => {
      const value = (e as CustomEvent<number>).detail;
      if (!Number.isFinite(value)) return;
      if (value > targetRef.current) setGain({ amount: value - targetRef.current, key: Date.now() });
      targetRef.current = value;
      setTarget(value);
    };
    const onHit = () => setHits((n) => n + 1);
    window.addEventListener(BALANCE_EVENT, onBalance);
    window.addEventListener(COIN_HIT_EVENT, onHit);
    return () => {
      window.removeEventListener(BALANCE_EVENT, onBalance);
      window.removeEventListener(COIN_HIT_EVENT, onHit);
    };
  }, []);

  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 1600);
    return () => clearTimeout(t);
  }, [gain]);

  // Yangi qiymatga yumshoq sanab o'tadi
  useEffect(() => {
    if (target === shown) return;
    const from = shown;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setShown(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const startPulse = setTimeout(() => setPulse(true), 0);
    const stopPulse = setTimeout(() => setPulse(false), 900);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(startPulse);
      clearTimeout(stopPulse);
    };
    // `shown` faqat boshlang'ich nuqta sifatida olinadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <Link
      href="/shop"
      data-coin-target
      title="Coin balansingiz — do'konni ochish"
      aria-label={`Coin balansi: ${target}. Do'konni ochish`}
      className={cn(
        "relative flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 px-2.5 sm:px-3 transition-all hover:border-amber-500 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500",
        pulse && "scale-110 shadow-md shadow-amber-500/30"
      )}
    >
      <CoinIcon key={hits} className={cn("h-5 w-5", hits > 0 && "coin-hit")} />
      {gain && (
        <span
          key={gain.key}
          aria-hidden
          className="coin-gain pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-2 py-0.5 font-mono text-xs font-black text-amber-950 shadow-lg shadow-amber-500/40"
        >
          +{formatNumberUz(gain.amount)}
        </span>
      )}
      <span className="font-mono text-sm sm:text-base font-black tabular-nums text-amber-800 dark:text-amber-300">{formatNumberUz(shown)}</span>
    </Link>
  );
}
