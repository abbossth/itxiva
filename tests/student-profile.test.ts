import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";
import type { SessionPayload } from "@/lib/auth/session";

let cookieSession: SessionPayload | null = null;

vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => cookieSession }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/storage/r2", () => ({ getDownloadPresignedUrl: async ({ key }: { key: string }) => `https://files.test/${key}` }));

const { User } = await import("@/lib/db/models/user.model");
const { StudentProfile } = await import("@/lib/db/models/student-profile.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const actions = await import("@/actions/student-profile.actions");

async function loginAs(login: string, role: "student" | "mentor") {
  const user = await User.create({ login, fullName: `${login} Test`, role, passwordHash: "x", mustChangePassword: false });
  cookieSession = {
    userId: user._id.toString(),
    login,
    fullName: user.fullName,
    role,
    groupId: null,
    mustChangePassword: false,
    sessionVersion: 0,
  };
  return user;
}

const openEditing = (open: boolean) =>
  AppSettings.updateOne({ key: "global" }, { $set: { studentProfileEdit: open } }, { upsert: true });

const data = { phone: "+998 90 123 45 67", passportNumber: "AB 0000001", pinfl: "12345678901234", notes: "o'quvchi yozgan izoh" };

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  cookieSession = null;
});

describe("o'quvchining o'z ma'lumotlari", () => {
  it("mentor ochmaguncha o'quvchi saqlay olmaydi", async () => {
    const student = await loginAs("ali", "student");
    const res = await actions.updateOwnProfileAction(data);
    expect(res.success).toBe(false);
    expect(await StudentProfile.countDocuments({ studentId: student._id })).toBe(0);
    expect((await actions.getOwnProfile()).canEdit).toBe(false);
  });

  it("ochiq bo'lsa saqlanadi: hujjat raqamlari shifrlangan, mentor izohiga tegilmaydi", async () => {
    const student = await loginAs("ali", "student");
    await StudentProfile.create({ studentId: student._id, notes: "mentor izohi" });
    await openEditing(true);

    expect((await actions.updateOwnProfileAction(data)).success).toBe(true);

    const stored = await StudentProfile.findOne({ studentId: student._id }).lean();
    expect(stored?.phone).toBe(data.phone);
    expect(stored?.notes).toBe("mentor izohi");
    expect(stored?.passportNumberEnc).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain("AB 0000001");
    expect(JSON.stringify(stored)).not.toContain(data.pinfl);

    const own = await actions.getOwnProfile();
    expect(own.canEdit).toBe(true);
    expect(own.personal.passportNumber).toBe("AB 0000001");
    expect(own.personal).not.toHaveProperty("notes");
  });

  it("noto'g'ri JSHSHIR rad etiladi", async () => {
    await loginAs("ali", "student");
    await openEditing(true);
    expect((await actions.updateOwnProfileAction({ pinfl: "123" })).success).toBe(false);
  });

  it("o'quvchi faqat o'z papkasidagi rasmni ulay oladi", async () => {
    const student = await loginAs("ali", "student");
    expect((await actions.setOwnPhotoAction("avatars/000000000000000000000000/x.webp")).success).toBe(false);
    expect((await actions.setOwnPhotoAction("materials/x.pdf")).success).toBe(false);
    const ok = await actions.setOwnPhotoAction(`avatars/${student._id}/me.webp`);
    expect(ok.success).toBe(true);
    expect(ok.data?.photoUrl).toContain(`avatars/${student._id}/me.webp`);
  });

  it("o'quvchi mentor amallarini chaqira olmaydi, mentor esa o'quvchinikini", async () => {
    const student = await loginAs("ali", "student");
    await expect(actions.updateStudentProfileAction(student._id.toString(), { fullName: "Boshqa Ism" })).rejects.toThrow();
    await expect(actions.getStudentProfile(student._id.toString())).rejects.toThrow();
    await loginAs("ustoz", "mentor");
    await expect(actions.updateOwnProfileAction(data)).rejects.toThrow();
  });
});
