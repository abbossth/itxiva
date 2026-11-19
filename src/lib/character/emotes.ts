// Personaj harakatlari (emotlar): o'quvchi jonli o'yinning kutish zalida telefonda bitta tugmani bosadi —
// personaji katta ekranda shu harakatni qiladi. 3 tasi bepul, qolganlari coin evaziga ("Personajim" bo'limida).
// `anim` — CSS animatsiya turi (globals.css → .chr-e-*), `fx` — personaj atrofida uchadigan belgilar.
// Bu fayl brauzer va server uchun umumiy.

import type { CharMood } from "@/components/character/character-svg";

export type EmoteAnim = "wave" | "kiss" | "jump" | "dance" | "spin" | "clap" | "flex" | "laugh" | "bow" | "salute" | "sleep" | "shake" | "float" | "cheer" | "karate" | "guitar";

export interface Emote {
  id: string;
  name: string;
  icon: string;
  price: number;
  anim: EmoteAnim;
  /** Yuz ifodasi */
  mood: CharMood;
  /** Atrofida uchadigan belgilar */
  fx: string[];
}

const E = (id: string, name: string, icon: string, price: number, anim: EmoteAnim, mood: CharMood, fx: string[] = []): Emote => ({ id, name, icon, price, anim, mood, fx });

export const EMOTES: Emote[] = [
  // Bepul
  E("wave", "Salom berish", "👋", 0, "wave", "cheer", ["👋"]),
  E("kiss", "Qo'lini o'pib salom", "😘", 0, "kiss", "cheer", ["💋", "❤️"]),
  E("jump", "Quvonib sakrash", "🙌", 0, "jump", "cheer", ["⭐"]),
  // Pullik
  E("dance", "Raqs", "💃", 60, "dance", "cheer", ["🎵", "🎶"]),
  E("spin", "Aylanish", "🌀", 50, "spin", "cheer", ["💫"]),
  E("clap", "Qarsak", "👏", 40, "clap", "cheer", ["👏"]),
  E("flex", "Kuch ko'rsatish", "💪", 60, "flex", "work", ["💪"]),
  E("laugh", "Qah-qah", "😂", 40, "laugh", "cheer", ["😂", "🤣"]),
  E("heart", "Yurakcha", "🥰", 50, "kiss", "cheer", ["💖", "💕", "❤️"]),
  E("thumbs", "Zo'r!", "👍", 30, "wave", "cheer", ["👍"]),
  E("salute", "Salyut", "🫡", 40, "salute", "work", ["⭐"]),
  E("bow", "Ta'zim", "🙇", 40, "bow", "idle", ["✨"]),
  E("cry", "Yig'lash", "😭", 40, "shake", "sad", ["💧", "💦"]),
  E("sleep", "Uxlash", "😴", 50, "sleep", "sad", ["💤"]),
  E("angry", "Jahl", "😤", 50, "shake", "work", ["💢", "🔥"]),
  E("cool", "Salobat", "😎", 70, "dance", "idle", ["😎", "✨"]),
  E("magic", "Sehr", "🪄", 90, "float", "cheer", ["✨", "🌟", "💫"]),
  E("fireworks", "Salyut otish", "🎆", 120, "cheer", "cheer", ["🎆", "🎇", "✨"]),
  E("guitar", "Gitara", "🎸", 100, "guitar", "cheer", ["🎸", "🎵"]),
  E("karate", "Karate", "🥋", 80, "karate", "work", ["💥"]),
  E("dab", "Dab", "🙆", 70, "flex", "cheer", ["⚡"]),
  E("rocket", "Raketa sakrash", "🚀", 130, "float", "cheer", ["🚀", "🔥"]),
  E("ghost", "Arvoh", "👻", 90, "float", "idle", ["👻"]),
  E("champion", "Chempion", "🏆", 150, "cheer", "cheer", ["🏆", "🥇", "🎉"]),
  E("rain", "Yomg'ir", "🌧️", 60, "sleep", "sad", ["🌧️", "💧"]),
  E("party", "Bayram", "🎉", 110, "dance", "cheer", ["🎉", "🎊", "🥳"]),
];

/** Bitta harakat davomiyligi (ms) */
export const EMOTE_MS = 2600;
/** Ketma-ket bosish oralig'i (ms) */
export const EMOTE_GAP_MS = 1200;

export const emoteOf = (id: string | null | undefined): Emote | null => EMOTES.find((e) => e.id === id) ?? null;
export const emoteKey = (id: string) => `emote:${id}`;

/** Harakat egalikda: bepul yoki sotib olingan (sovg'a qilingan) */
export function hasEmote(e: Emote, owned: readonly string[]): boolean {
  return e.price === 0 || owned.includes(emoteKey(e.id));
}
