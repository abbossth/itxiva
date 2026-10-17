"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CoinIcon } from "@/components/shop/price-tag";
import { BALANCE_EVENT } from "@/lib/rewards-client";
import { cn, formatNumberUz } from "@/lib/utils";

/**
 * O'quvchining coin balansi header'da (bosilsa do'kon ochiladi). Server qiymati sahifa yangilanganda keladi,
 * xarid yoki mukofotdan keyin esa hodisa orqali darhol o'zgaradi — raqam sanab o'tadi.
 */
export function HeaderBalance({ initial }: { initial: number }) {
  const [target, setTarget] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const onBalance = (e: Event) => {
      const value = (e as CustomEvent<number>).detail;
      if (Number.isFinite(value)) setTarget(value);
    };
    window.addEventListener(BALANCE_EVENT, onBalance);
    return () => window.removeEventListener(BALANCE_EVENT, onBalance);
  }, []);

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
      title="Coin balansingiz — do'konni ochish"
      aria-label={`Coin balansi: ${target}. Do'konni ochish`}
      className={cn(
        "flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 px-2.5 sm:px-3 transition-all hover:border-amber-500 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500",
        pulse && "scale-110 shadow-md shadow-amber-500/30"
      )}
    >
      <CoinIcon className="h-5 w-5" />
      <span className="font-mono text-sm sm:text-base font-black tabular-nums text-amber-800 dark:text-amber-300">{formatNumberUz(shown)}</span>
    </Link>
  );
}
