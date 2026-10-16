import { z } from "zod";
import { readModelCooldowns, writeModelCooldown } from "./cache";

// Asosiy AI provayder: Gemini (bepul tarif). SDK o'rnatilmagan — REST API to'g'ridan-to'g'ri chaqiriladi.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// Bepul tarifda ishlaydigan eng kuchli model birinchi; u band bo'lsa (503/429) yoki topilmasa, keyingisiga o'tiladi.
// (Pro modellar bepul tarifda yo'q — 429 qaytaradi.)
const MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
// Bitta so'rov uchun qat'iy chegara
const TIMEOUT_MS = 90_000;
// Kuchli model shu vaqt ichida javob bermasa, tayyor turgan yengil model javobi qaytariladi
const PRIMARY_HEAD_START_MS = 12_000;
// Band (503/429) deb javob bergan yoki javobsiz osilib qolgan model shu vaqt davomida o'tkazib yuboriladi — har so'rovda kutib o'tirmaslik uchun
const BUSY_COOLDOWN_MS = 3 * 60 * 1000;
const busyUntil = new Map<string, number>();
// Kunlik limit tugaganda Google qachon qayta urinish mumkinligini aytadi (masalan, 8 soatdan keyin).
// Shu vaqtgacha model umuman chaqirilmaydi; belgi bazada saqlanadi — boshqa server nusxalari ham biladi
const quotaUntil = new Map<string, number>();
const MAX_QUOTA_COOLDOWN_MS = 24 * 3_600_000;

export class GeminiError extends Error {}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string; details?: { "@type"?: string; retryDelay?: string }[] };
}

/** 429 javobidan "qachon qayta urinish mumkin" (ms). Kunlik limit bo'lmasa (qisqa kutish) — null */
export function quotaRetryMs(data: GeminiResponse): number | null {
  const fromDetails = data.error?.details?.find((d) => d.retryDelay)?.retryDelay;
  let ms: number | null = null;
  const seconds = fromDetails?.match(/^([\d.]+)s$/);
  if (seconds) ms = Number(seconds[1]) * 1000;
  if (ms === null) {
    const m = data.error?.message?.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
    if (m && (m[1] || m[2] || m[3])) ms = ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
  }
  // Bir necha soniyalik kutish — daqiqalik chegara; uni oddiy "band" kabi qisqa kutamiz
  if (ms === null || ms <= BUSY_COOLDOWN_MS) return null;
  return Math.min(ms, MAX_QUOTA_COOLDOWN_MS);
}

async function callModel(
  model: string,
  body: unknown,
  signal: AbortSignal
): Promise<{ status: number; data: GeminiResponse }> {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": process.env.GEMINI_API_KEY ?? "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal]),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  return { status: res.status, data };
}

/**
 * Gemini'dan berilgan Zod sxemasiga mos tuzilgan javob oladi
 */
export async function generateStructuredWithGemini<Schema extends z.ZodType>({
  schema,
  system,
  prompt,
  attachments = [],
  maxTokens,
}: {
  schema: Schema;
  system: string;
  prompt: string;
  /** Rasm yoki PDF (base64) — matndan oldin yuboriladi */
  attachments?: { mimeType: string; data: string }[];
  maxTokens: number;
}): Promise<z.infer<Schema>> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const buildBody = (withSchema: boolean) => ({
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [
          ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data } })),
          {
            text: withSchema
              ? prompt
              : `${prompt}\n\nJavobni faqat quyidagi JSON sxemaga to'liq mos JSON ko'rinishida qaytar:\n${JSON.stringify(jsonSchema)}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: maxTokens,
      ...(withSchema ? { responseJsonSchema: jsonSchema } : {}),
    },
  });

  /** Bitta modelni sinaydi: javob yoki null (band, xato, noto'g'ri tuzilma). Kalit/blok xatosida GeminiError otadi */
  // Javob olingach, hali kutilayotgan boshqa so'rovlar bekor qilinadi
  const done = new AbortController();

  const tryModel = async (model: string): Promise<z.infer<Schema> | null> => {
    let result: { status: number; data: GeminiResponse };
    try {
      result = await callModel(model, buildBody(true), done.signal);
      // Sxemadagi ayrim cheklovlarni Gemini qabul qilmasligi mumkin — sxemani matn ichida berib qayta uriniladi
      if (result.status === 400) {
        result = await callModel(model, buildBody(false), done.signal);
      }
    } catch (error) {
      if (done.signal.aborted) return null;
      // Javobsiz osilib qolgan model keyingi so'rovlarda o'tkazib yuboriladi
      if (error instanceof Error && error.name === "TimeoutError") {
        busyUntil.set(model, Date.now() + BUSY_COOLDOWN_MS);
      }
      console.error(`Gemini request failed (${model}):`, error instanceof Error ? error.message : error);
      return null;
    }

    const { status, data } = result;
    if (status === 401 || status === 403) {
      throw new GeminiError("Gemini kaliti (GEMINI_API_KEY) noto'g'ri yoki ruxsati yo'q");
    }
    if (status === 503 || status === 429) {
      busyUntil.set(model, Date.now() + BUSY_COOLDOWN_MS);
      const retry = status === 429 ? quotaRetryMs(data) : null;
      if (retry) {
        const until = Date.now() + retry;
        quotaUntil.set(model, until);
        await writeModelCooldown(model, until);
      }
    }
    if (status !== 200) {
      console.error(`Gemini API error (${model}):`, `${status} ${data.error?.message ?? ""}`.trim());
      return null;
    }

    if (data.promptFeedback?.blockReason) {
      throw new GeminiError("AI bu so'rovni bajara olmadi. Mavzuni boshqacha ifodalab ko'ring");
    }
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (candidate?.finishReason === "MAX_TOKENS" || !text) {
      console.error(`Gemini incomplete answer (${model})`);
      return null;
    }

    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      console.error(`Gemini schema mismatch (${model}):`, parsed.error.issues.slice(0, 3));
    } catch {
      console.error(`Gemini returned non-JSON (${model})`);
    }
    return null;
  };

  // Boshqa server nusxalari aniqlagan kunlik limitlar
  for (const [model, until] of await readModelCooldowns(MODELS)) {
    if (until > (quotaUntil.get(model) ?? 0)) quotaUntil.set(model, until);
  }
  const now = Date.now();
  const withQuota = MODELS.filter((m) => (quotaUntil.get(m) ?? 0) <= now);
  // Hamma modelning kunlik limiti tugagan: so'rov yuborish befoyda (zaxira provayderga o'tiladi)
  if (withQuota.length === 0) {
    throw new GeminiError("AI xizmatining kunlik limiti tugadi. Tekshiruv keyinroq avtomatik qayta bajariladi");
  }
  const available = withQuota.filter((m) => (busyUntil.get(m) ?? 0) <= now);
  // Hammasi band deb belgilangan bo'lsa ham, baribir sinab ko'riladi
  const [primary, ...rest] = available.length > 0 ? available : withQuota;

  // Kuchli model band bo'lsa yoki javobsiz osilib qolsa, mentor uni kutib o'tirmasligi kerak. Shuning uchun
  // kuchlisi ajratilgan vaqt ichida javob bermasa, eng yengil zaxira model ham ishga tushiriladi va qaysi biri
  // birinchi javob bersa, o'sha olinadi. Zaxira oldindan ishga tushirilmaydi — har so'rovda limit ikki marta sarflanmasin.
  const backupModel = rest.pop();
  try {
    const primaryRun = tryModel(primary);
    if (!backupModel) {
      const only = await primaryRun;
      if (only) return only;
    } else {
      const headStart = new Promise<"late">((resolve) => setTimeout(() => resolve("late"), PRIMARY_HEAD_START_MS));

      const first = await Promise.race([primaryRun, headStart]);
      if (first && first !== "late") return first;
      const backupRun = tryModel(backupModel).catch(() => null);

      if (first === "late") {
        // Kuchli model sekin: qaysi biri birinchi yaroqli javob bersa, o'sha olinadi
        type Win = { answer: z.infer<Schema>; fromBackup: boolean } | null;
        const asWin = (answer: z.infer<Schema> | null, fromBackup: boolean): Win => (answer ? { answer, fromBackup } : null);
        const winner = await Promise.race<Win>([
          backupRun.then((r) => asWin(r, true) ?? primaryRun.then((p) => asWin(p, false))),
          primaryRun.then((p) => asWin(p, false) ?? backupRun.then((r) => asWin(r, true))),
        ]);
        if (winner) {
          if (winner.fromBackup) busyUntil.set(primary, Date.now() + BUSY_COOLDOWN_MS);
          return winner.answer;
        }
      } else {
        const fallback = await backupRun;
        if (fallback) return fallback;
      }
    }

    for (const model of rest) {
      const answer = await tryModel(model);
      if (answer) return answer;
    }
  } finally {
    done.abort();
  }

  throw new GeminiError("AI xizmati hozir band. Bir daqiqadan keyin qayta urinib ko'ring");
}
