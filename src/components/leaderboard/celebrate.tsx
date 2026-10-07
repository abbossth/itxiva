"use client";

import { useEffect } from "react";
import { fireConfetti, prefersReducedMotion } from "@/lib/confetti";
import { playFireworksSound } from "@/lib/sound";

// Medal ranglari: 1-o'rin oltin, 2-o'rin kumush, 3-o'rin bronza (firuza — sayt rangi)
const COLORS: Record<number, string[]> = {
  1: ["#fbbf24", "#f59e0b", "#fde68a", "#14b8a6"],
  2: ["#cbd5e1", "#94a3b8", "#f1f5f9", "#14b8a6"],
  3: ["#fb923c", "#ea580c", "#fed7aa", "#14b8a6"],
};

/** Telefonni qisqa titratadi (faqat Android brauzerlarida ishlaydi; iPhone va kompyuterda e'tiborsiz qoldiriladi) */
function vibrate(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Brauzer ruxsat bermasa — hech narsa qilinmaydi
  }
}

/**
 * Reyting sahifasiga har kirganda konfetti otiladi: o'quvchiga — u kuchli uchlikda bo'lsa (o'rniga mos rangda),
 * mentorga — uchlik ko'rsatilganda (oltin rangda). Avval ikki yondan, keyin o'rtadan.
 */
export function TopThreeCelebration({ rank }: { rank: number }) {
  useEffect(() => {
    if (rank < 1 || rank > 3) return;
    const colors = COLORS[rank];
    const count = rank === 1 ? 110 : 70;
    // Qurilmada "harakatni kamaytirish" yoqilgan bo'lsa ham tabrik ko'rinadi, lekin yengil: bitta, sekin va kichik otilish
    if (prefersReducedMotion()) {
      const timer = setTimeout(
        () => {
          void fireConfetti({ particleCount: 45, spread: 80, startVelocity: 22, gravity: 0.7, origin: { y: 0.35 }, colors }, { evenIfReducedMotion: true });
          playFireworksSound([0], 0.7);
          vibrate([0, 40]);
        },
        300
      );
      return () => clearTimeout(timer);
    }
    const timers = [
      // Shohsupa ko'tarilib bo'lgach boshlanadi
      setTimeout(() => {
        // Ovoz konfetti bilan bir vaqtda: ikki yondan, keyin o'rtadan
        playFireworksSound([0, 0.18, 0.6], rank === 1 ? 1 : 0.8);
        // Titrash portlashlarga mos: [kutish, titrash, ...] millisekundlarda
        vibrate([0, 40, 140, 40, 380, 70]);
        void fireConfetti({ particleCount: count, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
        void fireConfetti({ particleCount: count, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
      }, 900),
      setTimeout(() => void fireConfetti({ particleCount: count, spread: 110, startVelocity: 38, origin: { y: 0.4 }, colors }), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [rank]);
  return null;
}
