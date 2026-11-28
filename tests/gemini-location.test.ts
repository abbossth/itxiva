import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Gemini bepul tarifi Yevropada ishlamaydi: so'rov darhol aniq sabab bilan to'xtaydi (6 ta modelni sinab o'tirmaydi)
vi.mock("@/lib/ai/cache", () => ({ readModelCooldowns: async () => new Map(), writeModelCooldown: async () => {} }));
vi.stubEnv("GEMINI_API_KEY", "test");

const { generateStructuredWithGemini, GeminiError } = await import("@/lib/ai/gemini");

afterEach(() => vi.unstubAllGlobals());

describe("Gemini: hudud xatosi va umumiy vaqt chegarasi", () => {
  it("'User location is not supported' — darhol, bitta model bilan, tuzalmaydigan xato", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 400, status: "FAILED_PRECONDITION", message: "User location is not supported for the API use." } }), { status: 400 })
    );
    vi.stubGlobal("fetch", fetch);
    const err = await generateStructuredWithGemini({ schema: z.object({ a: z.string() }), system: "s", prompt: "p", maxTokens: 100 }).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as InstanceType<typeof GeminiError>).sticky).toBe(true);
    expect(String(err.message)).toContain("Yevropa");
    // birinchi model: sxema bilan + sxemasiz (400 dan keyin) — boshqa modellar chaqirilmaydi
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("javob kelmasa umumiy chegarada to'xtaydi (qotib qolmaydi)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise<Response>((_r, reject) => {
            const abort = () => reject(new DOMException("aborted", "AbortError"));
            if (init.signal?.aborted) abort();
            else init.signal?.addEventListener("abort", abort);
          })
      )
    );
    const t0 = Date.now();
    const err = await generateStructuredWithGemini({ schema: z.object({ a: z.string() }), system: "s", prompt: "p", maxTokens: 100, deadlineMs: 300 }).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(String(err.message)).toContain("vaqtda javob bermadi");
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
