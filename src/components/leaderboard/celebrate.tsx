"use client";

import { useEffect } from "react";
import { fireConfetti } from "@/lib/confetti";

/** O'quvchi kuchli uchlikka kirgan bo'lsa, kuniga bir marta konfetti bilan tabriklanadi */
export function TopThreeCelebration({ rank }: { rank: number }) {
  useEffect(() => {
    if (rank < 1 || rank > 3) return;
    const key = `leaderboard-celebrated:${new Date().toISOString().slice(0, 10)}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // saqlab bo'lmasa — har safar tabriklanadi, zarari yo'q
    }
    const timer = setTimeout(() => void fireConfetti({ particleCount: 140, spread: 90, origin: { y: 0.35 } }), 900);
    return () => clearTimeout(timer);
  }, [rank]);
  return null;
}
