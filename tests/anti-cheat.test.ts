import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);

const { User } = await import("@/lib/db/models/user.model");
const { CheatEvent } = await import("@/lib/db/models/cheat-event.model");
const { reportCheatAction } = await import("@/actions/anti-cheat.actions");
const { answerLengthBias, promptScale } = await import("@/lib/quiz-quality");
const { wrapText } = await import("@/components/anti-cheat/protected-text");
const { describeCheats, cheatTotal } = await import("@/lib/anti-cheat/kinds");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("to'g'ri javob uzunligidan bilinib qolishi", () => {
  it("to'g'ri javob boshqalardan ancha uzun bo'lsa — belgilanadi", () => {
    const q = {
      type: "single_choice",
      options: ["Kompyuter xotirasi", "Protsessor", "Ma'lumotlarni vaqtincha saqlaydigan va elektr o'chganda o'chib ketadigan tezkor xotira", "Monitor"],
      correctAnswers: ["Ma'lumotlarni vaqtincha saqlaydigan va elektr o'chganda o'chib ketadigan tezkor xotira"],
    };
    expect(answerLengthBias(q).biased).toBe(true);
  });
  it("variantlar teng uzunlikda yoki qisqa sonlar bo'lsa — yaxshi", () => {
    expect(answerLengthBias({ type: "single_choice", options: ["12", "15", "125", "7"], correctAnswers: ["125"] }).biased).toBe(false);
    expect(
      answerLengthBias({
        type: "single_choice",
        options: ["Ma'lumotni vaqtincha saqlaydi", "Ma'lumotni doimiy saqlaydi", "Rasmni ekranga chiqaradi", "Ovozni kuchaytirib beradi"],
        correctAnswers: ["Ma'lumotni vaqtincha saqlaydi"],
      }).biased
    ).toBe(false);
    // Eng uzun noto'g'ri variant ham shunday uzun — to'g'ri javob ajralib turmaydi
    expect(
      answerLengthBias({
        type: "single_choice",
        options: ["Ha", "Yo'q", "Ma'lumotni vaqtincha, elektr bor paytda saqlaydigan xotira", "Ma'lumotni doimiy, elektrsiz ham saqlaydigan qattiq disk turi"],
        correctAnswers: ["Ma'lumotni vaqtincha, elektr bor paytda saqlaydigan xotira"],
      }).biased
    ).toBe(false);
    expect(answerLengthBias({ type: "short_answer", options: [], correctAnswers: ["x"] }).biased).toBe(false);
  });
  it("bir nechta javobli: to'g'rilar o'rtacha ancha uzun bo'lsa — belgilanadi", () => {
    const long1 = "Kodni qatorma-qator bajaradi va xatoni darhol ko'rsatadi";
    const long2 = "Dasturni ishga tushirishdan oldin tarjima qilmaydi";
    expect(answerLengthBias({ type: "multiple_choice", options: [long1, "Tez", long2, "Arzon"], correctAnswers: [long1, long2] }).biased).toBe(true);
  });
  it("uzun savolda shrift kichrayadi", () => {
    expect(promptScale("2 + 2 = ?")).toBe(1);
    expect(promptScale("a".repeat(200))).toBeLessThan(0.8);
    expect(promptScale("a".repeat(600))).toBe(0.5);
  });
});

describe("himoyalangan matn: qatorlarga bo'lish", () => {
  const measure = (s: string) => s.length; // har belgi 1 birlik
  it("so'z bo'yicha bo'ladi, qator oxiridagi bo'shliqni tashlaydi", () => {
    expect(wrapText(measure, "salom dunyo bu test", 11)).toEqual(["salom dunyo", "bu test"]);
  });
  it("yangi qatorlarni saqlaydi va juda uzun so'zni harf bo'yicha bo'ladi", () => {
    expect(wrapText(measure, "ab\n\ncd", 10)).toEqual(["ab", "", "cd"]);
    expect(wrapText(measure, "abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("qoidabuzarliklarni yozish", () => {
  it("o'quvchi brauzeri yuborgan sanoqlar qo'shilib boradi; 'fast'ni brauzer yubora olmaydi", async () => {
    const ali = await User.create({ fullName: "Ali", login: "ali", passwordHash: "x".repeat(60), role: "student" });
    actAs(sessionFor(ali));
    const refId = "6b0172eac146412d806cbca4";
    expect((await reportCheatAction({ context: "quiz", refId, counts: { leave: 2, copy: 1 } })).success).toBe(true);
    expect((await reportCheatAction({ context: "quiz", refId, counts: { leave: 1, screenshot: 1 } })).success).toBe(true);
    expect((await reportCheatAction({ context: "quiz", refId, counts: { fast: 5 } as never })).success).toBe(true);
    expect((await reportCheatAction({ context: "quiz", refId: "yaroqsiz", counts: { leave: 1 } })).success).toBe(false);
    const row = await CheatEvent.findOne({ studentId: ali._id }).lean();
    expect(row).toMatchObject({ total: 5, counts: { leave: 3, copy: 1, screenshot: 1 } });
    expect(row?.counts.fast ?? 0).toBe(0);
    expect(cheatTotal(row!.counts)).toBe(5);
    expect(describeCheats(row!.counts)).toBe("3 marta boshqa oyna/ilovaga o'tdi, 1 marta nusxalashga urindi, 1 marta screenshot olishga urindi");
  });
});
