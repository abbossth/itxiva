import { describe, expect, it } from "vitest";
import { isValidPinfl, maskValue, parseDocumentText, pinflBirthInfo } from "@/lib/document-import";

// Soxta, lekin nazorat raqami to'g'ri JSHSHIRlar: oxirgi raqam hisoblab qo'yiladi
function pinfl(first13: string): string {
  const w = [7, 3, 1];
  const sum = [...first13].reduce((s, c, i) => s + Number(c) * w[i % 3], 0);
  return first13 + String(sum % 10);
}
const A = pinfl("6010212700001"); // 01.02.2012, qiz
const B = pinfl("5150312700002"); // 15.03.2012, o'g'il
const C = pinfl("5150312700003");
const BAD = B.slice(0, 13) + String((Number(B[13]) + 1) % 10);

describe("hujjat ro'yxatini o'qish", () => {
  it("PDF matni: bir qatorda bir nechta o'quvchi, seriya raqamga yopishgan", () => {
    const text = [
      "FISH Jshshir Serya raqam Tuman/shahar Sinf",
      `1 TESTOVA LOLA ANVAR QIZI ${A} I-HR 0630583 Xiva shahri 8 Web Full-stack dasturlash asoslari`,
      `XSH-IT-8.2 Axmedov Abbosbek Xikmat o‘g‘li`,
      `2 SINOV O‘TKIR BEKZOD O‘G‘LI ${B} I-HR0351824 Xiva shahri 8 Web 2026-2027 3 Namunov Alisher Rustamovich ${C} AB 5468025 Xiva shahri 11`,
    ].join("\n");
    const { rows, conflicts } = parseDocumentText(text);
    expect(conflicts).toEqual([]);
    expect(rows).toEqual([
      { fullName: "TESTOVA LOLA ANVAR QIZI", pinfl: A, pinflValid: true, docNumber: "I-HR 0630583", docKind: "birthCert" },
      { fullName: "SINOV O‘TKIR BEKZOD O‘G‘LI", pinfl: B, pinflValid: true, docNumber: "I-HR 0351824", docKind: "birthCert" },
      { fullName: "Namunov Alisher Rustamovich", pinfl: C, pinflValid: true, docNumber: "AB 5468025", docKind: "passport" },
    ]);
  });

  it("Google Sheets'dan nusxa (tab bilan ajratilgan)", () => {
    const { rows } = parseDocumentText(`63\tTestova Lola Anvar Qizi\t${A}\tI-HR 0332967\tXiva shahri\t8\n`);
    expect(rows[0]).toMatchObject({ fullName: "Testova Lola Anvar Qizi", pinfl: A, docNumber: "I-HR 0332967" });
  });

  it("takror qatorlar: noto'g'ri JSHSHIR o'rnini bosmaydi, ikki xil to'g'ri JSHSHIR — ziddiyat", () => {
    const text = [
      `1 Sinov Otkir Bekzod ${B} I-HR 0000001 Xiva`,
      `2 Sinov Otkir Bekzod ${BAD} I-HR 0000002 Xiva`,
      `3 Testova Lola Anvar ${A} I-HR 0000003 Xiva`,
      `4 Testova Lola Anvar ${pinfl("6020212700009")} I-HR 0000004 Xiva`,
    ].join("\n");
    const { rows, conflicts } = parseDocumentText(text);
    expect(rows.find((r) => r.fullName.startsWith("Sinov"))).toMatchObject({ pinfl: B, docNumber: "I-HR 0000002" });
    expect(rows.find((r) => r.fullName.startsWith("Testova"))).toMatchObject({ pinfl: "", docNumber: "I-HR 0000004" });
    expect(conflicts).toHaveLength(1);
  });

  it("JSHSHIR: nazorat raqami, tug'ilgan sana va jins, niqoblash", () => {
    expect(isValidPinfl(A)).toBe(true);
    expect(isValidPinfl(BAD)).toBe(false);
    expect(pinflBirthInfo(A)).toEqual({ birthDate: "2012-02-01", gender: "female" });
    expect(pinflBirthInfo(B)).toEqual({ birthDate: "2012-03-15", gender: "male" });
    expect(maskValue("60402127210021")).toBe("604••••••••021");
  });
});
