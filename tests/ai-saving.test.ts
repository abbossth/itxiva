import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";

// AI so'rovlarini tejash: zaxira model faqat kerak bo'lganda, kunlik limitda kutish, natijalar keshi, qayta urinish.

vi.stubEnv("GEMINI_API_KEY", "test-key");
vi.stubEnv("ANTHROPIC_API_KEY", "");

const { generateStructuredWithGemini, quotaRetryMs } = await import("@/lib/ai/gemini");
const { cachedAi, aiCacheKey } = await import("@/lib/ai/cache");
const { AiCache } = await import("@/lib/db/models/ai-cache.model");
const { z } = await import("zod");

const schema = z.object({ ok: z.boolean() });
const okBody = { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }] };
const quotaBody = {
  error: {
    code: 429,
    message: "You exceeded your current quota. Please retry in 8h31m44.24s.",
    details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "30704s" }],
  },
};
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ask = () => generateStructuredWithGemini({ schema, system: "s", prompt: "p", maxTokens: 100 });
const modelOf = (url: unknown) => String(url).split("/models/")[1]?.split(":")[0];

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);
afterEach(() => vi.unstubAllGlobals());

describe("Gemini so'rovlari", () => {
  it("kunlik limitdagi kutish vaqti o'qiladi; qisqa kutish — oddiy band", () => {
    expect(quotaRetryMs(quotaBody)).toBe(30_704_000);
    expect(quotaRetryMs({ error: { message: "Please retry in 8h31m44.24s." } })).toBe(((8 * 60 + 31) * 60 + 44.24) * 1000);
    expect(quotaRetryMs({ error: { message: "Please retry in 20s" } })).toBeNull();
    expect(quotaRetryMs({ error: { message: "Server overloaded" } })).toBeNull();
  });

  it("asosiy model o'z vaqtida javob bersa, zaxira model chaqirilmaydi", async () => {
    const fetchMock = vi.fn(async () => respond(200, okBody));
    vi.stubGlobal("fetch", fetchMock);
    await expect(ask()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("kunlik limit tugagan model keyingi so'rovlarda chaqirilmaydi; hammasi tugasa — darhol xato", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        calls.push(modelOf(url));
        return respond(429, quotaBody);
      })
    );
    await expect(ask()).rejects.toThrow();
    const firstRound = calls.length;
    expect(new Set(calls).size).toBe(3);
    // Kutish vaqti bazada saqlangan (boshqa server nusxalari uchun)
    expect(await AiCache.countDocuments({ key: /^cooldown:/ })).toBe(3);

    await expect(ask()).rejects.toThrow(/kunlik limiti/);
    expect(calls.length).toBe(firstRound);
  });
});

describe("AI keshi", () => {
  it("bir xil kalitda AI qayta chaqirilmaydi; fresh — qayta so'raladi", async () => {
    const run = vi.fn(async () => ({ score: 42 }));
    const key = aiCacheKey("t", ["matn"]);
    expect(await cachedAi(key, run)).toEqual({ score: 42 });
    expect(await cachedAi(key, run)).toEqual({ score: 42 });
    expect(run).toHaveBeenCalledTimes(1);
    await cachedAi(key, run, { fresh: true });
    expect(run).toHaveBeenCalledTimes(2);
    // Xato keshga yozilmaydi
    const failing = vi.fn(async () => {
      throw new Error("band");
    });
    await expect(cachedAi(aiCacheKey("t", ["x"]), failing)).rejects.toThrow();
    await expect(cachedAi(aiCacheKey("t", ["x"]), failing)).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
