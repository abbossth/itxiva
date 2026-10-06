import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export class AiError extends Error {}

const SYSTEM_PROMPT = `Sen ITXiva o'quv platformasida mentorga yordam beradigan metodist-yordamchisan.
O'quvchilar — Xiva shahridagi "Muhammad al-Xorazmiy vorislari" dasturining 8–11-sinf o'quvchilari; ular dasturlashni (web, back-end, DevOps) o'rganadi. Har bir dars 1 soat 30 daqiqa davom etadi.

Yozish qoidalari:
- Faqat o'zbek tilida, lotin alifbosida yoz. Atamalar (HTML, API, function va h.k.) asl holida qoladi.
- O'quvchi yoshiga mos, sodda va aniq tilda yoz; hayotiy misollar keltir.
- Faktlar va kod namunalari to'g'ri bo'lsin; ishonching komil bo'lmagan narsani yozma.
- Mentor bergan mavzudan chetga chiqma.`;

/**
 * Claude'dan berilgan Zod sxemasiga mos tuzilgan javob oladi
 */
export async function generateStructured<Schema extends z.ZodType>({
  schema,
  prompt,
  effort = "medium",
  maxTokens = 16000,
}: {
  schema: Schema;
  prompt: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<Schema>> {
  if (!isAiConfigured()) {
    throw new AiError("AI yordamchi sozlanmagan: ANTHROPIC_API_KEY kiritilmagan");
  }

  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      // Xavfsizlik filtri so'rovni rad etsa, server o'zi tavsiya etilgan zaxira modelga o'tadi
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort, format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      throw new AiError("AI bu so'rovni bajara olmadi. Mavzuni boshqacha ifodalab ko'ring");
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new AiError("AI javobi to'liq chiqmadi. Qaytadan urinib ko'ring");
    }
    return response.parsed_output;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new AiError("AI kaliti (ANTHROPIC_API_KEY) noto'g'ri yoki ruxsati yo'q");
    }
    // Hisobda mablag' tugaganda API 400 qaytaradi — mentorga aniq sababini ko'rsatamiz
    if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
      throw new AiError(
        "Anthropic hisobida mablag' yetarli emas. console.anthropic.com → Plans & Billing bo'limida balansni to'ldiring"
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiError("AI xizmati band. Bir daqiqadan keyin qayta urinib ko'ring");
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new AiError("AI xizmatiga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error:", error.status, error.message);
      throw new AiError("AI xizmatida xatolik yuz berdi. Keyinroq urinib ko'ring");
    }
    throw error;
  }
}
