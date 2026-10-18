// Mukofot oynasini chaqirish: coin/XP beradigan amaldan keyin (davomat, test) shu hodisa yuboriladi.
// Server ba'zi mukofotlarni javobdan keyin yozadi, shuning uchun oyna bir necha marta tekshiradi.

export const REWARD_CHECK_EVENT = "itxiva:reward-check";
export const LEVEL_UP_CLOSED_EVENT = "itxiva:level-up-closed";

export function requestRewardCheck(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REWARD_CHECK_EVENT));
}

/** Balans o'zgardi (xarid, mukofot): header'dagi coin soni darhol yangilanadi */
export const BALANCE_EVENT = "itxiva:balance";

export function announceBalance(balance: number): void {
  if (typeof window === "undefined" || !Number.isFinite(balance)) return;
  window.dispatchEvent(new CustomEvent<number>(BALANCE_EVENT, { detail: balance }));
}

// Katta oynalar (mukofot, e'lon) bir-birining ustiga chiqmasin: bittasi ochiq bo'lsa, ikkinchisi u yopilishini kutadi
export const OVERLAY_FREE_EVENT = "itxiva:overlay-free";

export function overlayBusy(except?: string): boolean {
  if (typeof document === "undefined") return false;
  const current = document.body.dataset.overlay;
  return Boolean(current) && current !== except;
}

export function claimOverlay(name: string): void {
  document.body.dataset.overlay = name;
}

export function releaseOverlay(name: string): void {
  if (document.body.dataset.overlay !== name) return;
  delete document.body.dataset.overlay;
  window.dispatchEvent(new Event(OVERLAY_FREE_EVENT));
}
