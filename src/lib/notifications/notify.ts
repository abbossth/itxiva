import { after } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { escapeHtml, isTelegramConfigured, sendTelegramMessage, type MessageButton } from "@/lib/telegram/api";
import { isNotificationEnabled, type NotificationType } from "./types";

// Barcha Telegram bildirishnomalari shu modul orqali ketadi.
// Yangi tur qo'shish: types.ts ga tur va sozlama yorlig'i, shu yerga payload va matn shabloni.

export interface NotificationPayloads {
  homework_graded: { lessonId: string; lessonTitle: string; returned?: boolean; score?: number; coins?: number; feedback?: string };
  lesson_new: { lessonId: string; lessonTitle: string; hasHomework?: boolean };
  material_new: { lessonId: string; lessonTitle: string; materialTitle: string };
  exam_new: { kind: "quiz" | "exam"; title: string; href: string; startsAt?: string | null };
  homework_due: { lessonId: string; lessonTitle: string; dueLabel: string };
  coins_changed: { amount: number; reason: string; balance?: number };
  order_status: { productTitle: string; status: "accepted" | "rejected" | "handed_over"; note?: string; refunded?: number };
  product_new: { title: string; price: number };
  homework_submitted: { lessonId: string; lessonTitle: string; studentName: string; groupName?: string; isLate?: boolean; resubmitted?: boolean };
  order_new: { productTitle: string; price: number; studentName: string };
  exam_finished: { examId: string; title: string; submitted: number; total: number; avgPercent: number | null; ungraded: number };
  lesson_reminder: {
    minutesLeft: number;
    startTime: string;
    endTime: string;
    /** Mentorga boradigan xabarda guruh nomi ko'rsatiladi */
    groupName?: string;
    lessonId?: string;
    lessonTitle?: string;
    forMentor?: boolean;
  };
}

interface Message {
  text: string;
  button?: MessageButton | null;
}

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://itxiva.uz").replace(/\/$/, "");

/** Telegram tugmasi faqat ochiq https manzilni qabul qiladi (lokal ishlab chiqishda tugma qo'yilmaydi) */
function link(text: string, path: string): MessageButton | null {
  return SITE_URL.startsWith("https://") ? { text, url: `${SITE_URL}${path}` } : null;
}

const b = (v: unknown) => `<b>${escapeHtml(v)}</b>`;
const clip = (v: string, max = 300) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

const templates: { [T in NotificationType]: (p: NotificationPayloads[T]) => Message } = {
  homework_graded: (p) =>
    p.returned
      ? {
          text: [`🔁 ${b("Vazifa qayta ishlashga qaytarildi")}`, escapeHtml(p.lessonTitle), p.feedback ? `\n💬 ${escapeHtml(clip(p.feedback))}` : ""]
            .filter(Boolean)
            .join("\n"),
          button: link("Vazifani ochish", `/lessons/${p.lessonId}#homework`),
        }
      : {
          text: [
            `✅ ${b("Vazifa tekshirildi")}`,
            escapeHtml(p.lessonTitle),
            `\n📊 Ball: ${b(`${p.score ?? 0} / 100`)}`,
            p.coins ? `🪙 Coin: ${b(`+${p.coins}`)}` : "",
            p.feedback ? `💬 ${escapeHtml(clip(p.feedback))}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          button: link("Natijani ko'rish", `/lessons/${p.lessonId}#homework`),
        },
  lesson_new: (p) => ({
    text: [`📚 ${b("Yangi dars")}`, escapeHtml(p.lessonTitle), p.hasHomework ? "\n📝 Uyga vazifa ham bor" : ""].filter(Boolean).join("\n"),
    button: link("Darsni ochish", `/lessons/${p.lessonId}`),
  }),
  material_new: (p) => ({
    text: `📎 ${b("Yangi material")}\n${escapeHtml(p.lessonTitle)}\n\n${escapeHtml(p.materialTitle)}`,
    button: link("Materialni ko'rish", `/lessons/${p.lessonId}`),
  }),
  exam_new: (p) => ({
    text: [`${p.kind === "exam" ? "🎓" : "🧩"} ${b(p.kind === "exam" ? "Yangi imtihon e'lon qilindi" : "Yangi test")}`, escapeHtml(p.title), p.startsAt ? `\n🗓 Boshlanishi: ${escapeHtml(p.startsAt)}` : ""]
      .filter(Boolean)
      .join("\n"),
    button: link(p.kind === "exam" ? "Imtihonni ko'rish" : "Testni ochish", p.href),
  }),
  homework_due: (p) => ({
    text: `⏰ ${b("Vazifa muddati yaqin")}\n${escapeHtml(p.lessonTitle)}\n\nMuddat: ${b(p.dueLabel)}`,
    button: link("Vazifani topshirish", `/lessons/${p.lessonId}#homework`),
  }),
  coins_changed: (p) => ({
    text: [
      `🪙 ${b(p.amount >= 0 ? `+${p.amount} coin berildi` : `${p.amount} coin olindi`)}`,
      `Sabab: ${escapeHtml(p.reason)}`,
      typeof p.balance === "number" ? `Balans: ${b(p.balance)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    button: link("Balansni ko'rish", "/profile"),
  }),
  order_status: (p) => {
    const head = {
      accepted: `👍 ${b("Buyurtma qabul qilindi")}`,
      rejected: `❌ ${b("Buyurtma rad etildi")}`,
      handed_over: `🎁 ${b("Buyurtma topshirildi")}`,
    }[p.status];
    const tail = {
      accepted: "Mentor sovg'ani tayyorlab, sizga topshiradi.",
      rejected: p.refunded ? `${p.refunded} coin balansingizga qaytarildi.` : "",
      handed_over: "Olganingizni saytda tasdiqlang.",
    }[p.status];
    return {
      text: [head, escapeHtml(p.productTitle), p.note ? `\n💬 ${escapeHtml(clip(p.note))}` : "", tail ? `\n${tail}` : ""].filter(Boolean).join("\n"),
      button: link("Buyurtmalarim", "/shop/orders"),
    };
  },
  product_new: (p) => ({
    text: `🛍 ${b("Do'konda yangi mahsulot")}\n${escapeHtml(p.title)}\n\nNarxi: ${b(`${p.price} coin`)}`,
    button: link("Do'konni ochish", "/shop"),
  }),
  homework_submitted: (p) => ({
    text: [
      `📥 ${b(p.resubmitted ? "Vazifa qayta topshirildi" : "Yangi vazifa topshirildi")}`,
      `${escapeHtml(p.studentName)}${p.groupName ? ` · ${escapeHtml(p.groupName)}` : ""}`,
      escapeHtml(p.lessonTitle),
      p.isLate ? "\n⚠️ Muddatdan keyin topshirildi" : "",
    ]
      .filter(Boolean)
      .join("\n"),
    button: link("Tekshirish", `/mentor/homework/${p.lessonId}`),
  }),
  order_new: (p) => ({
    text: `🛒 ${b("Do'konda yangi buyurtma")}\n${escapeHtml(p.studentName)}\n${escapeHtml(p.productTitle)} — ${b(`${p.price} coin`)}`,
    button: link("Buyurtmalarni ochish", "/mentor/orders"),
  }),
  exam_finished: (p) => ({
    text: [
      `🏁 ${b("Imtihon yakunlandi")}`,
      escapeHtml(p.title),
      `\n👥 Topshirdi: ${b(`${p.submitted} / ${p.total}`)}`,
      p.avgPercent === null ? "" : `📊 O'rtacha natija: ${b(`${p.avgPercent}%`)}`,
      p.ungraded > 0 ? `📝 Tekshirilishi kerak: ${b(p.ungraded)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    button: link("Natijalarni ko'rish", `/mentor/exams/${p.examId}`),
  }),
  lesson_reminder: (p) => ({
    text: [
      `🔔 ${b(p.minutesLeft >= 50 ? "Bir soatdan keyin dars" : `${p.minutesLeft} daqiqadan keyin dars`)}`,
      p.groupName ? `👥 ${escapeHtml(p.groupName)}` : "",
      `🕒 Bugun ${b(`${p.startTime}–${p.endTime}`)}`,
      p.lessonTitle ? `📚 ${escapeHtml(p.lessonTitle)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    button: p.lessonId
      ? link("Darsni ochish", p.forMentor ? `/mentor/lessons/${p.lessonId}/edit` : `/lessons/${p.lessonId}`)
      : link(p.forMentor ? "Davomatni ochish" : "Darslarni ochish", p.forMentor ? "/mentor/attendance" : "/lessons"),
  }),
};

export function buildNotification<T extends NotificationType>(type: T, payload: NotificationPayloads[T]): Message {
  return templates[type](payload);
}

// Telegram bitta botga soniyasiga ~30 ta xabardan ortiq yuborishga ruxsat bermaydi
const BATCH_SIZE = 25;
const BATCH_PAUSE_MS = 1100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Recipients = { ids: (string | mongoose.Types.ObjectId)[] } | { groupId: string | mongoose.Types.ObjectId } | { role: "mentor" | "student" };

/**
 * Xabarni darhol yuboradi va yetkazilganlar sonini qaytaradi (cron va testlar uchun).
 * Faqat Telegram'ni ulagan va shu turni o'chirmagan foydalanuvchilarga boradi.
 */
export async function sendNotifications<T extends NotificationType>(
  recipients: Recipients,
  type: T,
  payload: NotificationPayloads[T]
): Promise<number> {
  if (!isTelegramConfigured()) return 0;
  await connectToDatabase();

  const filter: Record<string, unknown> = { "telegram.chatId": { $type: "string" } };
  if ("ids" in recipients) {
    const ids = recipients.ids.filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return 0;
    filter._id = { $in: ids };
  } else if ("groupId" in recipients) {
    filter.groupId = recipients.groupId;
    filter.role = "student";
  } else {
    filter.role = recipients.role;
  }

  const users = await User.find(filter).select("telegram.chatId notificationPrefs").lean();
  const targets = users.filter((u) => u.telegram?.chatId && isNotificationEnabled(u.notificationPrefs, type));
  if (targets.length === 0) return 0;

  const message = buildNotification(type, payload);
  let delivered = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_PAUSE_MS);
    const results = await Promise.all(
      targets.slice(i, i + BATCH_SIZE).map(async (user) => {
        const chatId = user.telegram!.chatId!;
        let result = await sendTelegramMessage(chatId, message.text, message.button);
        if (!result.ok && result.retryAfter) {
          await sleep(Math.min(result.retryAfter, 5) * 1000);
          result = await sendTelegramMessage(chatId, message.text, message.button);
        }
        if (result.blocked) {
          // Foydalanuvchi botni bloklagan — hisobdan uziladi, qayta ulashi mumkin
          await User.updateOne({ _id: user._id, "telegram.chatId": chatId }, { $set: { "telegram.chatId": null, "telegram.linkedAt": null } });
        } else if (!result.ok) {
          console.error(`Telegram notification failed (${type}):`, result.description);
        }
        return result.ok;
      })
    );
    delivered += results.filter(Boolean).length;
  }
  return delivered;
}

/** Yuborishni javobdan keyinga qoldiradi — foydalanuvchi so'rovi Telegram'ni kutib qolmaydi */
function defer(task: () => Promise<unknown>): void {
  if (!isTelegramConfigured()) return;
  const run = () => task().catch((error) => console.error("Notification error:", error));
  try {
    after(run);
  } catch {
    // So'rov kontekstidan tashqarida (skript, test): fonda bajariladi
    void run();
  }
}

/** Bitta foydalanuvchiga */
export function notify<T extends NotificationType>(userId: string | mongoose.Types.ObjectId, type: T, payload: NotificationPayloads[T]): void {
  defer(() => sendNotifications({ ids: [userId] }, type, payload));
}

export function notifyMany<T extends NotificationType>(userIds: (string | mongoose.Types.ObjectId)[], type: T, payload: NotificationPayloads[T]): void {
  if (userIds.length > 0) defer(() => sendNotifications({ ids: userIds }, type, payload));
}

/** Guruhning barcha o'quvchilariga */
export function notifyGroup<T extends NotificationType>(groupId: string | mongoose.Types.ObjectId, type: T, payload: NotificationPayloads[T]): void {
  defer(() => sendNotifications({ groupId }, type, payload));
}

export function notifyAllStudents<T extends NotificationType>(type: T, payload: NotificationPayloads[T]): void {
  defer(() => sendNotifications({ role: "student" }, type, payload));
}

export function notifyMentors<T extends NotificationType>(type: T, payload: NotificationPayloads[T]): void {
  defer(() => sendNotifications({ role: "mentor" }, type, payload));
}
