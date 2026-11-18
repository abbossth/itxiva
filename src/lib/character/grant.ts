import mongoose from "mongoose";
import { User } from "@/lib/db/models/user.model";
import { MAX_POWER, SLOT_LABELS, charItem, type CharSlot } from "./catalog";

// Personaj sovg'asini berish (jonli o'yin sovg'alari): takror chaqirilsa ham bir marta ta'sir qiladi
// ($addToSet va $max). Bu fayl "use server" emas.

type Id = string | mongoose.Types.ObjectId;

/** `character: null` bo'lsa ichki maydonga yozib bo'lmaydi — avval bo'sh obyekt */
export async function ensureCharacter(userId: Id) {
  await User.updateOne({ _id: userId, character: null }, { $set: { character: { look: null, owned: [], power: 0, updatedAt: null } } });
}

export interface GiftView {
  kind: "item" | "power";
  key: string;
  /** Ko'rsatish uchun: buyum nomi va turi yoki kuch bosqichi */
  name: string;
  slot: CharSlot | null;
  slotLabel: string;
  power: number;
}

export function giftView(gift: string | null | undefined): GiftView | null {
  if (!gift) return null;
  if (gift.startsWith("power:")) {
    const n = Math.max(1, Math.min(MAX_POWER, Number(gift.slice(6)) || 1));
    return { kind: "power", key: gift, name: `Kuch ${n}-bosqich`, slot: null, slotLabel: "Kuch", power: n };
  }
  const [slot, id] = gift.split(":");
  const it = charItem(slot as CharSlot, id ?? "");
  if (!it) return null;
  return { kind: "item", key: gift, name: it.name, slot: it.slot, slotLabel: SLOT_LABELS[it.slot], power: 0 };
}

export async function grantCharacterGift(userId: Id, gift: string) {
  const v = giftView(gift);
  if (!v) return;
  await ensureCharacter(userId);
  if (v.kind === "item") await User.updateOne({ _id: userId }, { $addToSet: { "character.owned": v.key } });
  else await User.updateOne({ _id: userId }, { $max: { "character.power": v.power } });
}
