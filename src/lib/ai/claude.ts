import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { generateStructuredWithGemini, GeminiError, isGeminiConfigured } from "./gemini";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Kamida bitta AI provayder (Claude yoki zaxiradagi Gemini) sozlanganmi */
export function isAiConfigured(): boolean {
  return isClaudeConfigured() || isGeminiConfigured();
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export class AiError extends Error {}

// Zaxiradagi Claude hisobida mablag' tugagan yoki kalit yaroqsiz bo'lsa, har safar uni qayta sinab
// vaqt yo'qotmaslik uchun shu vaqtgacha u o'tkazib yuboriladi
const CLAUDE_COOLDOWN_MS = 10 * 60 * 1000;
let claudeUnavailableUntil = 0;

/** Claude xatosi: `sticky` — sabab o'z-o'zidan tuzalmaydi (balans, kalit) */
class ClaudeFailure extends AiError {
  constructor(message: string, readonly sticky = false) {
    super(message);
  }
}

const SYSTEM_PROMPT = `Sen ITXiva o'quv platformasida mentorga yordam beradigan metodist-yordamchisan.
O'quvchilar — Xiva shahridagi "Muhammad al-Xorazmiy vorislari" dasturining 8–11-sinf o'quvchilari; ular dasturlashni (web, back-end, DevOps) o'rganadi. Har bir dars 1 soat 30 daqiqa davom etadi.

Yozish qoidalari:
- Faqat o'zbek tilida, lotin alifbosida yoz. Atamalar (HTML, API, function va h.k.) asl holida qoladi.
- O'quvchi yoshiga mos, sodda va aniq tilda yoz; hayotiy misollar keltir.
- Faktlar va kod namunalari to'g'ri bo'lsin; ishonching komil bo'lmagan narsani yozma.
- Mentor bergan mavzudan chetga chiqma.`;

interface GenerateParams<Schema extends z.ZodType> {
  schema: Schema;
  prompt: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

/**
 * Berilgan Zod sxemasiga mos tuzilgan javob oladi: avval Gemini, u ishlamasa — Claude
 */
export async function generateStructured<Schema extends z.ZodType>(
  params: GenerateParams<Schema>
): Promise<z.infer<Schema>> {
  if (!isAiConfigured()) {
    throw new AiError("AI yordamchi sozlanmagan: ANTHROPIC_API_KEY yoki GEMINI_API_KEY kiritilmagan");
  }

  // Asosiy provayder — Gemini. Claude faqat Gemini sozlanmagan yoki javob bera olmagan holatda ishlatiladi.
  let geminiError: AiError | null = null;
  if (isGeminiConfigured()) {
    try {
      return await generateStructuredWithGemini({
        schema: params.schema,
        system: SYSTEM_PROMPT,
        prompt: params.prompt,
        maxTokens: params.maxTokens ?? 16000,
      });
    } catch (error) {
      if (error instanceof GeminiError) {
        geminiError = new AiError(error.message);
      } else {
        console.error("Gemini request failed:", error);
        geminiError = new AiError("AI xizmatiga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring");
      }
    }
  }

  if (!isClaudeConfigured() || (geminiError && Date.now() < claudeUnavailableUntil)) {
    throw geminiError ?? new AiError("AI yordamchi sozlanmagan");
  }

  try {
    return await generateWithClaude(params);
  } catch (error) {
    if (error instanceof ClaudeFailure && error.sticky) {
      claudeUnavailableUntil = Date.now() + CLAUDE_COOLDOWN_MS;
    }
    // Gemini ham ishlamagan bo'lsa, mentorga asosiy provayderning xabari ko'rsatiladi
    if (geminiError && error instanceof AiError) throw geminiError;
    throw error;
  }
}

async function generateWithClaude<Schema extends z.ZodType>({
  schema,
  prompt,
  effort = "medium",
  maxTokens = 16000,
}: GenerateParams<Schema>): Promise<z.infer<Schema>> {
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
      throw new ClaudeFailure("AI kaliti (ANTHROPIC_API_KEY) noto'g'ri yoki ruxsati yo'q", true);
    }
    // Hisobda mablag' tugaganda API 400 qaytaradi — mentorga aniq sababini ko'rsatamiz
    if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
      throw new ClaudeFailure(
        "Anthropic hisobida mablag' yetarli emas. console.anthropic.com → Plans & Billing bo'limida balansni to'ldiring",
        true
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
