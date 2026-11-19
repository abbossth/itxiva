// O'yin kuchaytirgichlari: o'quvchi coin evaziga sotib oladi (profil yoki kutish zalida) va jonli o'yinda savol paytida
// telefonda bir bosishda ishlatadi. Har savolga har turdan bittadan, bir o'yinda har turdan ko'pi bilan 3 ta.
// Bu fayl brauzer va server uchun umumiy.

import type { LiveGameMode } from "@/lib/db/models/live-game.model";
import { isAdventure } from "./adventures";

export type BoosterId = "fifty" | "double" | "guard";

export interface Booster {
  id: BoosterId;
  name: string;
  icon: string;
  price: number;
  desc: string;
}

export const BOOSTERS: Booster[] = [
  { id: "fifty", name: "50/50", icon: "✂️", price: 15, desc: "Ikkita noto'g'ri variant o'chib ketadi" },
  { id: "double", name: "×2 ochko", icon: "⚡", price: 20, desc: "Keyingi to'g'ri javob ikki baravar ochko beradi" },
  { id: "guard", name: "Qalqon", icon: "🛡️", price: 20, desc: "Bitta xato kechiriladi: jon ketmaydi, seriya uzilmaydi" },
];

export const BOOSTER_MAX_PER_GAME = 3;

export const boosterOf = (id: unknown): Booster | null => BOOSTERS.find((b) => b.id === id) ?? null;

/** Bu rejimda kuchaytirgich ishlaydimi (×2 — ochko savol javobidan hisoblanadigan rejimlarda) */
export function boosterWorks(id: BoosterId, mode: LiveGameMode, question?: { type: string; options: string[] }): boolean {
  if (id === "fifty") return question ? question.type === "single_choice" && question.options.length >= 3 : true;
  if (id === "double") return !isAdventure(mode) && mode !== "arena" && mode !== "zone" && mode !== "galaxy";
  return true;
}
