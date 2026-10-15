import { describe, expect, it, vi } from "vitest";

const generateStructured = vi.fn();
vi.mock("@/lib/ai/claude", () => ({ generateStructured: (params: unknown) => generateStructured(params) }));

const { reviewHomeworkWithAi, buildHomeworkReviewPrompt } = await import("@/lib/ai/review-homework");

const input = {
  lessonTitle: "Axborot o'lchov birliklari",
  lessonTopic: "bit, bayt, KB, MB",
  grade: 8,
  instructions: "1) 3 KB necha bayt?",
  studentText: "1) 3 KB = 24 bayt",
  links: ["https://example.com/ish"],
  attempt: 2,
  files: [{ mimeType: "image/png", data: "AAAA", name: "ekran.png", source: "student" as const }],
  unreadFiles: ["loyiha.zip"],
};

describe("AI uyga vazifa tekshiruvi", () => {
  it("ball 0–100 oralig'ida butun songa keltiriladi, fayllar AI'ga yuboriladi", async () => {
    const check = { task: " 1) ", student: "3 KB = 24 bayt", expected: "3072 bayt", verdict: "wrong", comment: "" };
    generateStructured.mockResolvedValueOnce({ score: 140.4, feedback: "  Yaxshi  ", checks: [check], confidence: "medium" });
    const review = await reviewHomeworkWithAi(input);
    expect(review).toEqual({ score: 100, feedback: "Yaxshi", checks: [{ ...check, task: "1)" }], confidence: "medium" });
    expect(generateStructured.mock.calls[0][0].attachments).toEqual([{ mimeType: "image/png", data: "AAAA" }]);

    generateStructured.mockResolvedValueOnce({ score: -5, feedback: "", checks: [], confidence: "low" });
    expect((await reviewHomeworkWithAi(input)).score).toBe(0);
  });

  it("so'rovda topshiriq, javob, havola va o'qilmagan fayllar aytiladi", () => {
    const prompt = buildHomeworkReviewPrompt(input);
    expect(prompt).toContain("1) 3 KB necha bayt?");
    expect(prompt).toContain("1) 3 KB = 24 bayt");
    expect(prompt).toContain("8-sinf");
    expect(prompt).toContain("2-urinish");
    expect(prompt).toContain("ekran.png");
    expect(prompt).toContain("https://example.com/ish");
    expect(prompt).toContain("loyiha.zip");
  });
});
