import { z } from "zod";

// Zaxira AI: Claude ishlamaganda (masalan, hisobda mablag' tugaganda) Gemini javob beradi.
// SDK o'rnatilmagan — REST API to'g'ridan-to'g'ri chaqiriladi.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// Birinchisi band bo'lsa (503/429) yoki topilmasa, keyingisiga o'tiladi
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const TIMEOUT_MS = 120_000;
// Band (503/429) deb javob bergan model shu vaqt davomida o'tkazib yuboriladi — har so'rovda kutib o'tirmaslik uchun
const BUSY_COOLDOWN_MS = 3 * 60 * 1000;
const busyUntil = new Map<string, number>();

export class GeminiError extends Error {}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

async function callModel(model: string, body: unknown): Promise<{ status: number; data: GeminiResponse }> {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": process.env.GEMINI_API_KEY ?? "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
  maxTokens,
}: {
  schema: Schema;
  system: string;
  prompt: string;
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

  let lastError = "Gemini javob bermadi";
  const now = Date.now();
  const available = MODELS.filter((m) => (busyUntil.get(m) ?? 0) <= now);
  // Hammasi band deb belgilangan bo'lsa ham, baribir sinab ko'riladi
  for (const model of available.length > 0 ? available : MODELS) {
    let result: { status: number; data: GeminiResponse };
    try {
      result = await callModel(model, buildBody(true));
      // Sxemadagi ayrim cheklovlarni Gemini qabul qilmasligi mumkin — sxemani matn ichida berib qayta uriniladi
      if (result.status === 400) {
        result = await callModel(model, buildBody(false));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }

    const { status, data } = result;
    if (status === 401 || status === 403) {
      throw new GeminiError("Gemini kaliti (GEMINI_API_KEY) noto'g'ri yoki ruxsati yo'q");
    }
    if (status === 503 || status === 429) {
      busyUntil.set(model, Date.now() + BUSY_COOLDOWN_MS);
    }
    if (status !== 200) {
      lastError = `${status} ${data.error?.message ?? ""}`.trim();
      console.error(`Gemini API error (${model}):`, lastError);
      continue;
    }

    if (data.promptFeedback?.blockReason) {
      throw new GeminiError("AI bu so'rovni bajara olmadi. Mavzuni boshqacha ifodalab ko'ring");
    }
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (candidate?.finishReason === "MAX_TOKENS" || !text) {
      lastError = "javob to'liq chiqmadi";
      continue;
    }

    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      lastError = "javob kutilgan tuzilmaga mos kelmadi";
      console.error(`Gemini schema mismatch (${model}):`, parsed.error.issues.slice(0, 3));
    } catch {
      lastError = "javob JSON emas";
    }
  }

  console.error("Gemini failed:", lastError);
  throw new GeminiError("AI xizmati hozir band. Bir daqiqadan keyin qayta urinib ko'ring");
}
