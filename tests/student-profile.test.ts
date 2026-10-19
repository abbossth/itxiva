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
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ getDownloadPresignedUrl: async ({ key }: { key: string }) => `https://files.test/${key}` }));

const { User } = await import("@/lib/db/models/user.model");
const { StudentProfile } = await import("@/lib/db/models/student-profile.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const actions = await import("@/actions/student-profile.actions");
const { profileCompleteness } = await import("@/lib/profile-completeness");

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

// Asosiy (5) va ota-ona (4) maydonlari to'liq, hujjat — alohida
const filledBase = {
  birthDate: "2013-05-10",
  gender: "male",
  phone: "+998 90 123 45 67",
  school: "12-maktab",
  address: "Xiva, Ichan qal'a",
  fatherName: "Vali Aliyev",
  fatherPhone: "+998 91 111 11 11",
  motherName: "Malika Aliyeva",
  motherPhone: "+998 93 333 33 33",
};
const birthCert = { birthCertNumber: "I-XR 1234567", birthCertIssuedAt: "2013-05-20", birthCertIssuedBy: "Xiva FHDY" };
const passport = {
  passportNumber: "AD 1234567",
  pinfl: "12345678901234",
  passportIssuedAt: "2024-01-10",
  passportExpiresAt: "2034-01-09",
  passportIssuedBy: "Xiva IIB",
};

describe("profil to'liqligi: guvohnoma yoki pasport", () => {
  const now = new Date("2026-10-19T12:00:00Z");

  it("faqat tanlangan (yoki to'ldirilgan) hujjat hisobga olinadi", () => {
    expect(profileCompleteness({ ...filledBase, ...birthCert }, now)).toMatchObject({ documentType: "birthCert", complete: true, total: 12 });
    expect(profileCompleteness({ ...filledBase, ...passport }, now)).toMatchObject({ documentType: "passport", complete: true, total: 14 });
    // Pasport tanlangan bo'lsa guvohnoma yetmaydi
    expect(profileCompleteness({ ...filledBase, ...birthCert, documentType: "passport" }, now).complete).toBe(false);
  });

  it("hech narsa kiritilmagan bo'lsa yoshga qarab: 16 dan katta — pasport", () => {
    expect(profileCompleteness({ birthDate: "2013-05-10" }, now).documentType).toBe("birthCert");
    expect(profileCompleteness({ birthDate: "2008-05-10" }, now).documentType).toBe("passport");
    expect(profileCompleteness({}, now).documentType).toBe("birthCert");
  });
});

describe("profil 100% uchun coin", () => {
  it("o'quvchi to'ldirsa bir marta 10 coin oladi, qayta saqlash ikkinchi marta bermaydi", async () => {
    const student = await loginAs("ali", "student");
    await openEditing(true);

    const half = await actions.updateOwnProfileAction(filledBase);
    expect(half.data?.rewarded).toBe(0);

    const full = await actions.updateOwnProfileAction({ ...filledBase, ...birthCert, documentType: "birthCert" });
    expect(full.data?.rewarded).toBe(10);
    expect((await actions.getOwnProfile()).personal.documentType).toBe("birthCert");

    const again = await actions.updateOwnProfileAction({ ...filledBase, ...birthCert, documentType: "birthCert", school: "1-maktab" });
    expect(again.data?.rewarded).toBe(0);

    const user = await User.findById(student._id).lean();
    expect(user?.spendableBalance).toBe(10);
    expect(user?.totalCoins).toBe(10);
  });

  it("tahrirlash yopiq bo'lsa mentor to'ldiradi — o'quvchi baribir oladi", async () => {
    const student = await loginAs("ali", "student");
    await loginAs("ustoz", "mentor");
    const res = await actions.updateStudentProfileAction(student._id.toString(), {
      fullName: "ali Test",
      ...filledBase,
      ...passport,
      documentType: "passport",
    });
    expect(res.success).toBe(true);
    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(10);
  });
});

describe("bir martalik topshiriqlar", () => {
  it("profil: nechta maydon to'ldirilgani ko'rinadi, to'liq bo'lganda bajarildi; bot sozlanmagan bo'lsa Telegram yo'q", async () => {
    const { oneTimeTasks } = await import("@/lib/onboarding-rewards");
    const student = await loginAs("ali", "student");
    await openEditing(true);
    await actions.updateOwnProfileAction(filledBase);

    const before = await oneTimeTasks(student._id.toString());
    expect(before.map((t) => t.id)).toEqual(["profile"]);
    expect(before[0]).toMatchObject({ done: false, coins: 10, progress: { current: 9, target: 12 } });

    await actions.updateOwnProfileAction({ ...filledBase, ...birthCert });
    const after = await oneTimeTasks(student._id.toString());
    expect(after[0].done).toBe(true);
    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(10);
  });
});
