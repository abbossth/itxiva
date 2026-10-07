// Telefonni qisqa titratish. Android'da standart Vibration API ishlaydi; iPhone uni qo'llamaydi,
// shuning uchun u yerda Safari'ning "switch" katakchasi bosilganda beradigan turtkisidan foydalaniladi (iOS 18+).

/** iPhone: ko'rinmas "switch" katakchasini bosish bitta yengil turtki beradi */
function iosTick(): void {
  try {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    // Qo'llanmasa — hech narsa bo'lmaydi
  }
}

/**
 * `pattern` — millisekundlarda navbat bilan: [titrash, tanaffus, titrash, ...].
 * iPhone'da davomiylikni boshqarib bo'lmaydi: har bir "titrash" o'rniga bitta turtki beriladi.
 */
export function haptic(pattern: number[]): void {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
      return;
    }
  } catch {
    return;
  }
  let at = 0;
  pattern.forEach((ms, i) => {
    if (i % 2 === 0) {
      if (at === 0) iosTick();
      else setTimeout(iosTick, at);
    }
    at += ms;
  });
}
