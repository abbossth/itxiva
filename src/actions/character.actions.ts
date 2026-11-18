"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { requireStudent } from "@/lib/auth/guards";
import { awardCoins } from "@/lib/gamification/award";
import { checkRateLimit } from "@/lib/rate-limit";
import { CHAR_SLOTS, MAX_POWER, POWER_STEPS, SLOT_LABELS, charItem, cleanLook, itemKey, type CharLook, type CharSlot } from "@/lib/character/catalog";
import { ensureCharacter } from "@/lib/character/grant";
import type { ActionResult } from "./auth.actions";

// O'quvchi personaji: ko'rish, saqlash, coin bilan qism sotib olish va "kuch" upgrade.
// Coin `awardCoins` orqali yechiladi (ledger'ga yoziladi, idempotent kalit — ikki marta bosilsa ham bir marta).

export interface MyCharacter {
  look: CharLook & { color: number };
  owned: string[];
  /** Sotib olingan kuch darajasi (ko'rinishdagi power shundan oshmaydi) */
  power: number;
  level: number;
  balance: number;
  /** Personaj hali birinchi marta saqlanmagan */
  fresh: boolean;
}

async function loadMe(userId: string) {
  return User.findById(userId).select("character level spendableBalance").lean();
}

function view(u: NonNullable<Awaited<ReturnType<typeof loadMe>>>): MyCharacter {
  const owned = u.character?.owned ?? [];
  const power = Math.max(0, Math.min(MAX_POWER, u.character?.power ?? 0));
  const level = Math.max(1, u.level ?? 1);
  const raw = (u.character?.look ?? null) as Record<string, unknown> | null;
  return { look: cleanLook(raw, owned, level, power, raw?.color), owned, power, level, balance: u.spendableBalance ?? 0, fresh: !u.character?.updatedAt };
}

export async function getMyCharacter(): Promise<MyCharacter | null> {
  const session = await requireStudent();
  await connectToDatabase();
  const u = await loadMe(session.userId);
  return u ? view(u) : null;
}

/** Ko'rinishni saqlash: faqat egalikdagi (yoki bepul ochilgan) qismlar */
export async function saveCharacterAction(look: unknown): Promise<ActionResult<MyCharacter>> {
  const session = await requireStudent();
  await connectToDatabase();
  const u = await loadMe(session.userId);
  if (!u) return { success: false, message: "Foydalanuvchi topilmadi" };
  const cur = view(u);
  const clean = cleanLook(look, cur.owned, cur.level, cur.power, (look as { color?: unknown } | null)?.color);
  await ensureCharacter(session.userId);
  await User.updateOne({ _id: session.userId }, { $set: { "character.look": clean, "character.updatedAt": new Date() } });
  revalidatePath("/profile");
  return { success: true, data: { ...cur, look: clean, fresh: false } };
}

/** Qismni coin evaziga sotib olish (darajasi yetgan bo'lishi kerak) */
export async function buyCharacterItemAction(slot: string, id: string): Promise<ActionResult<MyCharacter>> {
  const session = await requireStudent();
  if (!CHAR_SLOTS.includes(slot as CharSlot)) return { success: false, message: "Bunday qism yo'q" };
  const it = charItem(slot as CharSlot, String(id));
  if (!it) return { success: false, message: "Bunday qism yo'q" };
  const rate = checkRateLimit(`char_${session.userId}`, 20, 60_000);
  if (!rate.allowed) return { success: false, message: `Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring` };
  await connectToDatabase();
  const u = await loadMe(session.userId);
  if (!u) return { success: false, message: "Foydalanuvchi topilmadi" };
  const cur = view(u);
  if (cur.level < it.level) return { success: false, message: `${it.level}-darajada ochiladi` };
  const key = itemKey(it);
  if (it.price === 0 || cur.owned.includes(key)) return { success: true, data: cur };
  const paid = await awardCoins({
    studentId: session.userId,
    coin: -it.price,
    xp: 0,
    type: "purchase",
    description: `Personaj: ${SLOT_LABELS[it.slot].toLowerCase()} — ${it.name}`,
    idempotencyKey: `char:${session.userId}:${key}`,
  });
  if (!paid.ok) return { success: false, message: paid.reason === "insufficient" ? "Balansingizda yetarli coin yo'q" : "Foydalanuvchi topilmadi" };
  await ensureCharacter(session.userId);
  await User.updateOne({ _id: session.userId }, { $addToSet: { "character.owned": key } });
  const next = await loadMe(session.userId);
  revalidatePath("/profile");
  return { success: true, data: next ? view(next) : cur };
}

/** Kuch upgrade: keyingi bosqich (narx va daraja POWER_STEPS da) */
export async function upgradeCharacterPowerAction(): Promise<ActionResult<MyCharacter>> {
  const session = await requireStudent();
  const rate = checkRateLimit(`char_${session.userId}`, 20, 60_000);
  if (!rate.allowed) return { success: false, message: `Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring` };
  await connectToDatabase();
  const u = await loadMe(session.userId);
  if (!u) return { success: false, message: "Foydalanuvchi topilmadi" };
  const cur = view(u);
  if (cur.power >= MAX_POWER) return { success: false, message: "Kuch eng yuqori darajada" };
  const step = POWER_STEPS[cur.power];
  if (cur.level < step.level) return { success: false, message: `Keyingi kuch ${step.level}-darajada ochiladi` };
  const paid = await awardCoins({
    studentId: session.userId,
    coin: -step.price,
    xp: 0,
    type: "purchase",
    description: `Personaj kuchi: ${cur.power + 1}-bosqich`,
    idempotencyKey: `charpower:${session.userId}:${cur.power + 1}`,
  });
  if (!paid.ok) return { success: false, message: paid.reason === "insufficient" ? "Balansingizda yetarli coin yo'q" : "Foydalanuvchi topilmadi" };
  const power = cur.power + 1;
  await ensureCharacter(session.userId);
  // Kuch darajasi faqat oshadi (parallel bosishda ham bir bosqichga); yangi kuch darhol kiyiladi
  await User.updateOne(
    { _id: session.userId, $or: [{ "character.power": { $lt: power } }, { "character.power": { $exists: false } }] },
    { $set: { "character.power": power, "character.look": { ...cur.look, power }, "character.updatedAt": new Date() } }
  );
  const next = await loadMe(session.userId);
  revalidatePath("/profile");
  return { success: true, data: next ? view(next) : cur };
}
