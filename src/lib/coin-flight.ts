// Tangalar uchishi: mukofot oynasidan header'dagi coin balansiga yoy bo'ylab uchib boradi va u yerga "qo'shiladi".
// React'dan tashqarida, to'g'ridan-to'g'ri DOM'da ishlaydi — oyna yopilgandan keyin ham animatsiya davom etadi.

import { prefersReducedMotion } from "@/lib/confetti";

/** Header'dagi coin balansi elementi (HeaderBalance shu atributni qo'yadi) */
export const COIN_TARGET_SELECTOR = "[data-coin-target]";
/** Har bir tanga yetib kelganda — balans "tebranadi" */
export const COIN_HIT_EVENT = "itxiva:coin-hit";

function visibleTarget(): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(COIN_TARGET_SELECTOR));
  return els.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? null;
}

/**
 * `from` nuqtadan tangalarni balansga uchiradi. Birinchi tanga yetganda `onFirstArrive` chaqiriladi
 * (shu paytda balans yangi qiymatga sanab o'tadi). Animatsiya mumkin bo'lmasa — darhol chaqiriladi.
 */
export function flyCoins({ from, amount, onFirstArrive }: { from: DOMRect; amount: number; onFirstArrive: () => void }) {
  const target = typeof document !== "undefined" ? visibleTarget() : null;
  if (!target || prefersReducedMotion() || amount <= 0 || typeof Element.prototype.animate !== "function") {
    onFirstArrive();
    return;
  }

  const to = target.getBoundingClientRect();
  const count = Math.min(14, Math.max(4, Math.round(Math.sqrt(amount) * 2)));
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const endX = to.left + 14;
  const endY = to.top + to.height / 2;
  let arrived = false;

  for (let i = 0; i < count; i++) {
    const coin = document.createElement("div");
    coin.setAttribute("aria-hidden", "true");
    coin.textContent = "₵";
    const size = 22 + Math.round(Math.random() * 8);
    Object.assign(coin.style, {
      position: "fixed",
      left: `${startX - size / 2}px`,
      top: `${startY - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "9999px",
      background: "radial-gradient(circle at 32% 28%, #fef3c7, #fbbf24 45%, #b45309)",
      boxShadow: "0 0 12px rgba(251,191,36,0.75), inset 0 -2px 0 rgba(146,64,14,0.45)",
      color: "#78350f",
      font: `900 ${Math.round(size * 0.55)}px ui-monospace, monospace`,
      display: "grid",
      placeItems: "center",
      zIndex: "90",
      pointerEvents: "none",
      willChange: "transform, opacity",
    });
    document.body.appendChild(coin);

    // Avval atrofga sochiladi, keyin yoy bo'ylab balansga uchadi
    const spreadX = (Math.random() - 0.5) * 160;
    // Yo'l ekran tepasidan chiqib ketmasin
    const minY = 12 - startY;
    const spreadY = Math.max(minY + 30, -40 - Math.random() * 90);
    const dx = endX - startX;
    const dy = endY - startY;
    const midX = dx * 0.45 + (Math.random() - 0.5) * 120;
    const midY = Math.max(minY, Math.min(dy, 0) * 0.55 - 60);

    const anim = coin.animate(
      [
        { transform: "translate(0,0) scale(0.3) rotate(0deg)", opacity: 0 },
        { transform: `translate(${spreadX}px, ${spreadY}px) scale(1.15) rotate(120deg)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${midX}px, ${midY}px) scale(1) rotate(260deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.45) rotate(400deg)`, opacity: 0.9 },
      ],
      { duration: 1050 + Math.random() * 250, delay: i * 70, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" }
    );
    anim.onfinish = () => {
      coin.remove();
      if (!arrived) {
        arrived = true;
        onFirstArrive();
      }
      window.dispatchEvent(new Event(COIN_HIT_EVENT));
    };
    anim.oncancel = () => coin.remove();
  }
}
