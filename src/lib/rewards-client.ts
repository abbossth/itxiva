// Mukofot oynasini chaqirish: coin/XP beradigan amaldan keyin (davomat, test) shu hodisa yuboriladi.
// Server ba'zi mukofotlarni javobdan keyin yozadi, shuning uchun oyna bir necha marta tekshiradi.

export const REWARD_CHECK_EVENT = "itxiva:reward-check";
export const LEVEL_UP_CLOSED_EVENT = "itxiva:level-up-closed";

export function requestRewardCheck(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REWARD_CHECK_EVENT));
}
