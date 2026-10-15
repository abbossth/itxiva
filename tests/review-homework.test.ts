import { describe, expect, it, vi } from "vitest";

const generateStructured = vi.fn();
vi.mock("@/lib/ai/claude", () => ({ generateStructured: (params: unknown) => generateStructured(params) }));

const originality = {
  aiLikelihood: "low",
  aiSignals: ["  Imlo xatolari bor  ", ""],
  copyLikelihood: "high",
  copySignals: [],
  verifyQuestions: ["3 KB ni qanday hisobladingiz?", "b", "c", "d"],
};

const { reviewHomeworkWithAi, buildHomeworkReviewPrompt, composeStudentFeedback } = await import("@/lib/ai/review-homework");

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
    generateStructured.mockResolvedValueOnce({ score: 140.4, feedback: "  Yaxshi  ", checks: [check], confidence: "medium", originality });
    const review = await reviewHomeworkWithAi(input);
    expect(review).toEqual({
      score: 100,
      feedback: "Yaxshi\n\nXatolar:\n• 1) «3 KB = 24 bayt» → to'g'risi: 3072 bayt",
      checks: [{ ...check, task: "1)" }],
      confidence: "medium",
      originality: { ...originality, aiSignals: ["Imlo xatolari bor"], verifyQuestions: ["3 KB ni qanday hisobladingiz?", "b", "c"] },
    });
    expect(generateStructured.mock.calls[0][0].attachments).toEqual([{ mimeType: "image/png", data: "AAAA" }]);

    generateStructured.mockResolvedValueOnce({ score: -5, feedback: "", checks: [], confidence: "low", originality });
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
    expect(prompt).toContain("o'xshashi topilmadi");

    const withPeers = buildHomeworkReviewPrompt({
      ...input,
      similarAnswers: [{ percent: 91, text: "Akbarbekning javobi" }],
      previousAnswers: ["avvalgi ish"],
    });
    expect(withPeers).toContain("o'xshashligi 91%");
    expect(withPeers).toContain("Akbarbekning javobi");
    expect(withPeers).toContain("avvalgi ish");
  });

  it("o'quvchi izohiga har bir xato tushuntirishi bilan qo'shiladi, to'g'ri va tekshirilmaganlar qo'shilmaydi", () => {
    const text = composeStudentFeedback("Barakalla!", [
      { task: "7)", student: "2 MB", expected: "2 MB", verdict: "correct", comment: "" },
      { task: "8)", student: "0,5GB =\n3072GB", expected: "512 MB", verdict: "wrong", comment: "0,5 ni 1024 ga ko'paytirish kerak edi." },
      { task: "12)", student: "yo'q", expected: "Ha, sig'adi", verdict: "partial", comment: "" },
      { task: "14)", student: "", expected: "", verdict: "missing", comment: "Fayl kengaytmalarini yozish kerak edi." },
      { task: "15)", student: "Foto", expected: "", verdict: "unchecked", comment: "Rasmni ko'ra olmadim" },
    ]);
    expect(text).toBe(
      "Barakalla!\n\nXatolar:\n" +
        "• 8) «0,5GB = 3072GB» → to'g'risi: 512 MB\n  0,5 ni 1024 ga ko'paytirish kerak edi.\n" +
        "• 12) «yo'q» → to'g'risi: Ha, sig'adi (qisman to'g'ri)\n" +
        "• 14) — bajarilmagan.\n  Fayl kengaytmalarini yozish kerak edi."
    );
    expect(composeStudentFeedback("Hammasi to'g'ri", [])).toBe("Hammasi to'g'ri");
  });
});
