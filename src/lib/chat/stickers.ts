// Chat stikerlari: o'zimizning to'plam (katta, animatsiyali emoji). Tashqi fayl yuklanmaydi — darhol ochiladi.
// Xabarda faqat stiker kodi saqlanadi; ro'yxatda yo'q kod qabul qilinmaydi.

export interface StickerPack {
  id: string;
  title: string;
  items: string[];
}

export const STICKER_PACKS: StickerPack[] = [
  { id: "mood", title: "Kayfiyat", items: ["😀", "😂", "🤣", "🥳", "😎", "🤩", "😍", "🥺", "😭", "😡", "🤯", "😴", "🤔", "🫡", "🙃", "😱"] },
  { id: "study", title: "Dars", items: ["📚", "✅", "💯", "🧠", "💻", "🐍", "🚀", "🔥", "🏆", "⭐", "👏", "🙏", "💡", "🎯", "⌛", "🎉"] },
  { id: "animals", title: "Hayvonlar", items: ["🐱", "🐶", "🦊", "🐼", "🐸", "🦄", "🐧", "🐵", "🐢", "🦁", "🐨", "🐙"] },
  { id: "hands", title: "Qo'llar", items: ["👍", "👎", "👋", "🤝", "✌️", "🤞", "💪", "👌", "🫶", "❤️", "💔", "🤙"] },
];

const ALL = new Set(STICKER_PACKS.flatMap((p) => p.items));
export const isSticker = (s: unknown): s is string => typeof s === "string" && ALL.has(s);
