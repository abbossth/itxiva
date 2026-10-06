// Telegram Bot API bilan ishlash (SDK'siz, oddiy fetch).

const API = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function getBotUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
}

export interface TelegramResult {
  ok: boolean;
  /** Foydalanuvchi botni bloklagan yoki chat yo'q — chat_id endi yaroqsiz */
  blocked: boolean;
  /** Juda ko'p so'rov: shuncha soniya kutish kerak */
  retryAfter?: number;
  description?: string;
}

export async function callTelegram(method: string, body: Record<string, unknown>): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, blocked: false, description: "TELEGRAM_BOT_TOKEN sozlanmagan" };

  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      parameters?: { retry_after?: number };
    };
    if (data.ok) return { ok: true, blocked: false };
    return {
      ok: false,
      // 403: bot bloklangan yoki foydalanuvchi hisobi o'chirilgan
      blocked: res.status === 403,
      retryAfter: data.parameters?.retry_after,
      description: data.description ?? `HTTP ${res.status}`,
    };
  } catch (error) {
    return { ok: false, blocked: false, description: error instanceof Error ? error.message : String(error) };
  }
}

export interface MessageButton {
  text: string;
  url: string;
}

/** HTML formatdagi xabar; `button` — xabar ostidagi havola tugmasi */
export function sendTelegramMessage(chatId: string, html: string, button?: MessageButton | null): Promise<TelegramResult> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
  });
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
