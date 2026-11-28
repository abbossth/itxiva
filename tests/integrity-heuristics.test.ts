import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";

vi.stubEnv("R2_ACCESS_KEY_ID", "test");
vi.mock("@/lib/ai/claude", () => ({ isAiConfigured: () => false, generateStructured: vi.fn(), AiError: class extends Error {} }));
const files: Record<string, string> = {};
vi.mock("@/lib/storage/r2", () => ({ downloadBuffer: async (key: string) => Buffer.from(files[key] ?? "") }));

const { heuristicAiSignals, codeSimilarity, codeGrams, codeContainment, commonGrams, looksLikeCode } = await import("@/lib/ai-heuristics");
const { runIntegrityCheck } = await import("@/lib/homework-integrity");
const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const studentText =
  "html bu sayt qilish tili. men h1 bilan sarlavha qildim keyin p bilan matn yozdim, rasmni img bilan qoydim lekin src ni topolmadim keyin papkaga soldim va ishladi";
const chatbotText =
  "Albatta! Keling, ko'rib chiqamiz. **HTML** — bu veb-sahifalarni yaratish uchun ishlatiladigan belgilash tili. Xulosa qilib aytganda, HTML sahifaning tuzilishini belgilaydi → CSS esa ko'rinishini. Umid qilamanki, bu tushunarli bo'ldi.";

describe("AI'siz belgilar", () => {
  it("chatbot matni: markdown, iboralar, maxsus belgilar — yuqori ball, har bir belgi iqtibos bilan", () => {
    const r = heuristicAiSignals(chatbotText);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.signals.join(" ")).toContain("Markdown");
    expect(r.signals.join(" ")).toContain("Chatbot");
  });
  it("o'quvchining oddiy matni nohaq belgilanmaydi; qisqa matn — aniqlab bo'lmaydi", () => {
    expect(heuristicAiSignals(studentText).score).toBe(0);
    expect(heuristicAiSignals("ha bajardim").score).toBeNull();
  });
  it("yozish jarayoni: deyarli hammasi joylashtirilgan bo'lsa — kuchli belgi; qo'lda yozilgan — ball kamayadi", () => {
    const pasted = heuristicAiSignals(studentText, [], { typed: 5, pasted: 300, pastes: 1, ms: 20_000 });
    expect(pasted.score).toBeGreaterThanOrEqual(30);
    expect(pasted.signals[0]).toContain("joylashtirilgan");
    const typed = heuristicAiSignals(studentText, [], { typed: 400, pasted: 0, pastes: 0, ms: 600_000 });
    expect(typed.score).toBe(0);
    expect(typed.signals[0]).toContain("qo'lda yozilgan");
  });
});

const codeA = `function hisobla(narx, soni) {
  // jami narxni hisoblaymiz
  let jami = narx * soni;
  if (jami > 100000) {
    jami = jami - jami * 0.1;
  }
  for (let i = 0; i < soni; i++) {
    console.log("mahsulot", i + 1, narx);
  }
  return jami;
}`;
// Nomlar va izohlar o'zgartirilgan nusxa
const codeB = `function calc(price, count) {
  let total = price * count;
  if (total > 100000) {
    total = total - total * 0.1;
  }
  for (let k = 0; k < count; k++) {
    console.log("item", k + 1, price);
  }
  return total;
}`;
const codeC = `const items = [3, 5, 8];
let s = 0;
while (s < 20) {
  s += items.pop() ?? 1;
}
document.querySelector("#out").textContent = String(s);
alert(s > 10 ? "katta" : "kichik");`;

describe("kod o'xshashligi", () => {
  it("nom va izohlarni o'zgartirish ko'chirmani yashirmaydi; boshqa yechim o'xshamaydi", () => {
    expect(looksLikeCode(codeA)).toBe(true);
    expect(codeSimilarity(codeA, codeB)).toBeGreaterThan(0.8);
    expect(codeSimilarity(codeA, codeC)).toBeLessThan(0.3);
  });
  it("hamma yozadigan umumiy tuzilma hisobga olinmaydi (MOSS usuli)", () => {
    const sets = [codeGrams(codeA), codeGrams(codeB), codeGrams(codeA), codeGrams(codeB)];
    const common = commonGrams(sets, 0.25);
    expect(codeContainment(codeGrams(codeA), codeGrams(codeB), common)).toBe(0);
  });
});

describe("fayl mazmuni bo'yicha plagiat", () => {
  it("boshqa vazifaga boshqa o'quvchi yuborgan aynan shu fayl topiladi (nomi boshqa bo'lsa ham)", async () => {
    const g = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027" });
    const mk = (login: string) => User.create({ login, fullName: login, role: "student", groupId: g._id, passwordHash: "x" });
    const [ali, vali] = await Promise.all([mk("ali"), mk("vali")]);
    const mkLesson = (order: number) => Lesson.create({ groupId: g._id, quarter: 1, order, title: `Dars ${order}`, isPublished: true, homework: { isEnabled: true, instructions: "", attachments: [], coinsReward: 10 } });
    const [l1, l2] = await Promise.all([mkLesson(1), mkLesson(2)]);
    files["k/vali.zip"] = "BIR XIL MAZMUN".repeat(100);
    files["k/ali.zip"] = "BIR XIL MAZMUN".repeat(100);
    const v = await HomeworkSubmission.create({ lessonId: l1._id, groupId: g._id, studentId: vali._id, text: "", files: [{ key: "k/vali.zip", name: "loyiha.zip", size: 1400 }] });
    await runIntegrityCheck(String(v._id));
    const a = await HomeworkSubmission.create({ lessonId: l2._id, groupId: g._id, studentId: ali._id, text: "", files: [{ key: "k/ali.zip", name: "mening-ishim.zip", size: 1400 }] });
    await runIntegrityCheck(String(a._id));
    const after = await HomeworkSubmission.findById(a._id).lean();
    expect(after?.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(after?.integrity).toMatchObject({ similarity: 100, matches: [{ fullName: "vali", percent: 100 }] });
    expect(String(after?.integrity?.matches[0].lessonId)).toBe(String(l1._id));
    void mongoose;
  });
});
