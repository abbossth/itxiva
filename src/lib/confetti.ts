import type { Options } from "canvas-confetti";

/**
 * Bayramona konfetti. Kutubxona faqat kerak bo'lganda yuklanadi — sahifa ochilishini sekinlashtirmaydi.
 * "Harakatni kamaytirish" sozlamasi yoqilgan bo'lsa, hech narsa ko'rsatilmaydi.
 */
export async function fireConfetti(options: Options = {}): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, ...options });
  } catch {
    // Konfetti chiqmasa ham asosiy amalga ta'sir qilmaydi
  }
}
