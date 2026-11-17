import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ getDownloadPresignedUrl: async ({ key }: { key: string }) => `https://files.test/${key}` }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { StudentProfile } = await import("@/lib/db/models/student-profile.model");
const docs = await import("@/actions/document-import.actions");
const { parseDocumentText } = await import("@/lib/document-import");
const { loadProfile, toOwnData } = await import("@/lib/student-profile-data");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

function pinfl(first13: string): string {
  const w = [7, 3, 1];
  return first13 + String([...first13].reduce((s, c, i) => s + Number(c) * w[i % 3], 0) % 10);
}
const P1 = pinfl("6010212700001");
const P2 = pinfl("5150312700002");

describe("JSHSHIR va guvohnoma importi", () => {
  it("o'quvchi ism bo'yicha topiladi, raqamlar shifrlanib yoziladi va o'quvchining o'z profilida ko'rinadi", async () => {
    const group = await Group.create({ name: "XSH-26I0810", grade: 8, academicYear: "2026-2027" });
    const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const lola = await User.create({ login: "lola", fullName: "Testova Lola", role: "student", groupId: group._id, passwordHash: "x" });
    const otkir = await User.create({ login: "otkir", fullName: "Sinov O'tkir", role: "student", groupId: group._id, passwordHash: "x" });
    await StudentProfile.create({ studentId: otkir._id, birthDate: new Date("2012-01-01"), documentType: "passport" });

    const text = [
      `1\tTESTOVA LOLA ANVAR QIZI\t${P1}\tI-HR 0630583\tXiva shahri\t8`,
      `2\tSINOV O‘TKIR BEKZOD O‘G‘LI\t${P2}\tI-HR0351824\tXiva shahri\t8`,
      `3\tBEGONA ODAM ALI O‘G‘LI\t${pinfl("5010112700005")}\tI-HR 0000001\tXiva shahri\t8`,
    ].join("\n");
    const { rows } = parseDocumentText(text);

    actAs(sessionFor(mentor));
    const preview = await docs.previewDocumentImportAction(rows);
    expect(preview.rows?.map((r) => [r.status, r.match?.userId ?? null, r.change])).toEqual([
      ["matched", String(lola._id), "new"],
      ["matched", String(otkir._id), "new"],
      ["unmatched", null, "new"],
    ]);

    const res = await docs.applyDocumentImportAction([
      { ...rows[0], userId: String(lola._id) },
      { ...rows[1], userId: String(otkir._id) },
    ]);
    expect(res.updated).toBe(2);

    const raw = await StudentProfile.findOne({ studentId: lola._id }).lean();
    expect(raw?.pinflEnc).toBeTruthy();
    expect(raw?.pinflEnc).not.toContain(P1);

    const own = toOwnData(await loadProfile(String(lola._id)));
    expect(own).toMatchObject({ pinfl: P1, birthCertNumber: "I-HR 0630583", documentType: "birthCert", birthDate: "2012-02-01", gender: "female" });
    // Tug'ilgan sana bor edi — o'zgarmaydi; tanlangan pasport bo'sh edi — guvohnomaga o'tadi
    const own2 = toOwnData(await loadProfile(String(otkir._id)));
    expect(own2).toMatchObject({ pinfl: P2, birthCertNumber: "I-HR 0351824", documentType: "birthCert", birthDate: "2012-01-01", gender: "male" });

    // Qayta tekshirilsa — o'zgarmaydi
    const again = await docs.previewDocumentImportAction(rows.slice(0, 1));
    expect(again.rows?.[0].change).toBe("same");
  });

  it("o'quvchi bu amallarni chaqira olmaydi; noto'g'ri JSHSHIR rad etiladi", async () => {
    const student = await User.create({ login: "lola", fullName: "Testova Lola", role: "student", passwordHash: "x" });
    actAs(sessionFor(student));
    await expect(docs.previewDocumentImportAction([{ fullName: "Testova Lola", pinfl: P1, docNumber: "I-HR 1", docKind: "birthCert" }])).rejects.toThrow();

    const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    actAs(sessionFor(mentor));
    const bad = P1.slice(0, 13) + String((Number(P1[13]) + 1) % 10);
    const res = await docs.applyDocumentImportAction([{ userId: String(student._id), fullName: "Testova Lola", pinfl: bad, docNumber: "I-HR 1", docKind: "birthCert" }]);
    expect(res.success).toBe(false);
  });
});
