// Telegram webhook'ni boshqarish.
//   node --env-file=.env.local scripts/telegram-webhook.mjs set https://www.itxiva.uz
//   node --env-file=.env.local scripts/telegram-webhook.mjs info
//   node --env-file=.env.local scripts/telegram-webhook.mjs delete
// Kerakli o'zgaruvchilar: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (Vercel'dagi bilan bir xil bo'lishi shart).

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const [, , command = "info", baseUrl] = process.argv;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN topilmadi");
  process.exit(1);
}

const call = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
};

if (command === "set") {
  if (!baseUrl?.startsWith("https://") || !secret) {
    console.error("Foydalanish: set https://sayt-manzili  (TELEGRAM_WEBHOOK_SECRET ham kerak)");
    process.exit(1);
  }
  const url = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  console.log(await call("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true }));
  console.log(
    await call("setMyCommands", {
      commands: [
        { command: "status", description: "Hisob ulanganini tekshirish" },
        { command: "help", description: "Yordam" },
        { command: "stop", description: "Bildirishnomalarni to'xtatish" },
      ],
    })
  );
  console.log("Webhook:", url);
} else if (command === "delete") {
  console.log(await call("deleteWebhook", { drop_pending_updates: true }));
} else {
  const me = await call("getMe");
  const info = await call("getWebhookInfo");
  console.log("Bot:", me.result ? `@${me.result.username} (${me.result.first_name})` : me);
  console.log("Webhook:", info.result?.url || "(o'rnatilmagan)", "| kutilayotgan:", info.result?.pending_update_count, "| oxirgi xato:", info.result?.last_error_message || "yo'q");
}
