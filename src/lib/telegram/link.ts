import crypto from "node:crypto";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { TELEGRAM_LINK_REWARD, rewardTelegramLink } from "@/lib/telegram/reward";

export const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Bir martalik ulash tokeni: bazada faqat xeshi saqlanadi, 10 daqiqa amal qiladi */
export async function createTelegramLinkToken(userId: string): Promise<string> {
  await connectToDatabase();
  const token = crypto.randomBytes(24).toString("base64url");
  await User.updateOne(
    { _id: userId },
    { $set: { telegramLink: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS) } } }
  );
  return token;
}

export type LinkResult =
  | { ok: true; fullName: string; role: "mentor" | "student"; rewarded: number }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Bot `/start <token>` olganda chaqiriladi: tokenni sarflab, chatni hisobga bog'laydi.
 * Shu chat avval boshqa hisobga ulangan bo'lsa, u hisobdan uziladi (bitta chat — bitta hisob).
 */
export async function consumeTelegramLinkToken(
  token: string,
  chat: { id: string | number; username?: string | null }
): Promise<LinkResult> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, reason: "invalid" };
  await connectToDatabase();

  const tokenHash = hashToken(token);
  const pending = await User.findOne({ "telegramLink.tokenHash": tokenHash }).select("+telegramLink").lean();
  if (!pending?.telegramLink) return { ok: false, reason: "invalid" };
  if (new Date(pending.telegramLink.expiresAt).getTime() < Date.now()) {
    await User.updateOne({ _id: pending._id }, { $set: { telegramLink: null } });
    return { ok: false, reason: "expired" };
  }

  const chatId = String(chat.id);
  await User.updateMany({ "telegram.chatId": chatId, _id: { $ne: pending._id } }, { $set: { "telegram.chatId": null, "telegram.linkedAt": null } });

  // Token sharti bilan yangilash: bir token ikki marta ishlatilmaydi
  const linked = await User.findOneAndUpdate(
    { _id: pending._id, "telegramLink.tokenHash": tokenHash },
    { $set: { telegram: { chatId, username: chat.username ?? null, linkedAt: new Date() }, telegramLink: null } },
    { returnDocument: "after" }
  )
    .select("fullName role")
    .lean();
  if (!linked) return { ok: false, reason: "invalid" };

  // O'quvchiga ulagani uchun bir martalik coin; mukofot xato bersa ham ulanish o'z kuchida qoladi
  let rewarded = 0;
  if (linked.role === "student") {
    try {
      if (await rewardTelegramLink(String(linked._id))) rewarded = TELEGRAM_LINK_REWARD;
    } catch (error) {
      console.error("[telegram] ulash mukofotini berib bo'lmadi", error);
    }
  }
  return { ok: true, fullName: linked.fullName, role: linked.role, rewarded };
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await connectToDatabase();
  await User.updateOne({ _id: userId }, { $set: { "telegram.chatId": null, "telegram.username": null, "telegram.linkedAt": null, telegramLink: null } });
}
