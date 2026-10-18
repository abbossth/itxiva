"use client";

import { formatNumberUz } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Sonni sanab chiqadi: birinchi marta 0 dan, keyin qiymat o'zgarsa (masalan, reytingda XP → coin almashtirilganda
 * sahifa qayta yuklanmaydi, komponent saqlanib qoladi) eski qiymatdan yangisiga.
 * "Harakatni kamaytirish" yoqilgan bo'lsa darhol yakuniy qiymat ko'rinadi.
 */
export function CountUp({ value, duration = 900, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  // Ekranda oxirgi ko'rsatilgan son: animatsiya to'xtatilsa ham keyingisi shu yerdan davom etadi
  const shownRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    const instant = from === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / duration);
      // ease-out: oxirida sekinlashadi
      const next = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3)));
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className={className}>{formatNumberUz(shown)}</span>;
}
