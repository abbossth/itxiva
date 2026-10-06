import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram/api";
import { consumeTelegramLinkToken } from "@/lib/telegram/link";

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id: number; type: string };
    from?: { username?: string };
  };
}

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://itxiva.uz").replace(/\/$/, "");

const HELP = [
  "<b>ITXiva bildirishnomalar boti</b>",
  "",
  "Bu bot sizga dars, vazifa, coin va do'kon haqidagi xabarlarni yuboradi.",
  "",
  "<b>Buyruqlar</b>",
  "/status — hisob ulangan-ulanmaganini ko'rish",
  "/stop — bildirishnomalarni to'xtatish (hisobni uzish)",
  "/help — shu yordam",
  "",
  `Ulash: saytda <b>Profil → Telegram</b> bo'limidagi “Telegram'ni ulash” tugmasini bosing.`,
].join("\n");

function secretMatches(received: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // Faqat Telegram biladigan maxfiy sarlavha: begona so'rovlar rad etiladi
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Ruxsat berilmagan" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chat = message?.chat;
  const text = message?.text?.trim();
  // Faqat shaxsiy chat: guruhga qo'shilgan bot hech kimning hisobini bog'lamaydi
  if (!chat || chat.type !== "private" || !text) return NextResponse.json({ ok: true });

  const chatId = String(chat.id);
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();

  try {
    if (command === "/start" && args[0]) {
      const result = await consumeTelegramLinkToken(args[0], { id: chatId, username: message?.from?.username });
      if (result.ok) {
        await sendTelegramMessage(
          chatId,
          `✅ <b>Hisobingiz ulandi</b>\n${escapeHtml(result.fullName)} (${result.role === "mentor" ? "mentor" : "o'quvchi"})\n\nEndi bildirishnomalar shu yerga keladi. Qaysi xabarlar kelishini saytdagi profilingizda sozlashingiz mumkin.`,
          SITE_URL.startsWith("https://") ? { text: "Profilni ochish", url: `${SITE_URL}/profile` } : null
        );
      } else {
        await sendTelegramMessage(
          chatId,
          result.reason === "expired"
            ? "⌛ Havola muddati tugagan (10 daqiqa). Saytdagi profilingizdan “Telegram'ni ulash” tugmasini qayta bosing."
            : "❌ Havola yaroqsiz yoki allaqachon ishlatilgan. Saytdagi profilingizdan “Telegram'ni ulash” tugmasini qayta bosing."
        );
      }
    } else if (command === "/start" || command === "/help") {
      await sendTelegramMessage(chatId, HELP);
    } else if (command === "/status") {
      await connectToDatabase();
      const user = await User.findOne({ "telegram.chatId": chatId }).select("fullName role login").lean();
      await sendTelegramMessage(
        chatId,
        user
          ? `🟢 <b>Ulangan</b>\n${escapeHtml(user.fullName)} (@${escapeHtml(user.login)}) — ${user.role === "mentor" ? "mentor" : "o'quvchi"}`
          : "⚪️ <b>Ulanmagan</b>\nSaytdagi profilingizdan “Telegram'ni ulash” tugmasini bosing."
      );
    } else if (command === "/stop") {
      await connectToDatabase();
      const res = await User.updateMany({ "telegram.chatId": chatId }, { $set: { "telegram.chatId": null, "telegram.linkedAt": null } });
      await sendTelegramMessage(
        chatId,
        res.modifiedCount > 0 ? "🔕 Hisob uzildi. Bildirishnomalar endi kelmaydi." : "Bu chat hech qaysi hisobga ulanmagan."
      );
    } else {
      await sendTelegramMessage(chatId, "Bu buyruqni tushunmadim. /help ni yuboring.");
    }
  } catch (error) {
    // Telegram xatoda so'rovni qayta-qayta yuboradi — shuning uchun baribir 200 qaytariladi
    console.error("Telegram webhook error:", error);
  }

  return NextResponse.json({ ok: true });
}
