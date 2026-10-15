import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, guardsMock, sessionFor } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
const notify = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({ notify: (...a: unknown[]) => notify(...a), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));
// Tezlik cheklovi alohida testlanadi
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 9, resetInSeconds: 1 }) }));

// Tasdiqlash tranzaksiyada ishlaydi — haqiqiy replica set bilan
let replSet: MongoMemoryReplSet;
beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("itxiva_review_test");
  vi.stubEnv("MONGODB_URI", process.env.MONGODB_URI);
});
afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseCache = { conn: null, promise: null };
  await replSet.stop();
});

const { connectToDatabase } = await import("@/lib/db/connect");
const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Quest } = await import("@/lib/db/models/quest.model");
const { QuestSubmission } = await import("@/lib/db/models/quest-submission.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { CertificateRegistry } = await import("@/lib/db/models/certificate-registry.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const { normalizeProofUrl, normalizeCertId } = await import("@/lib/gamification/proof");
const review = await import("@/actions/quest-review.actions");

beforeEach(async () => {
  const conn = await connectToDatabase();
  await Promise.all(Object.values(conn.connection.collections).map((c) => c.deleteMany({})));
  notify.mockClear();
});

async function seed(questOverrides: Record<string, unknown> = {}) {
  await AppSettings.create({ key: "global", gamification: { enabled: true, levelUpBonus: 0 } });
  const g = await Group.create({ name: "9.2", grade: 9, academicYear: "2026-2027" });
  const mk = (login: string, role: "mentor" | "student") =>
    User.create({ login, fullName: login === "ali" ? "Ali Valiyev" : login, role, groupId: role === "student" ? g._id : null, passwordHash: "x", mustChangePassword: false, createdAt: new Date("2026-09-01") });
  const quest = await Quest.create({
    title: "Onlayn kurs sertifikati",
    verify: "proof",
    template: "certificate",
    evidence: { link: "required", file: false, certId: true, note: true },
    guard: { uniqueProof: true, dateAfterJoin: true, monthlyLimit: 3 },
    reward: { coinsMin: 60, coinsMax: 150, xp: null, places: [] },
    audience: { groupIds: [], grades: [] },
    repeat: "unlimited",
    status: "published",
    isActive: true,
    notify: { announce: false, onSubmission: true },
    ...questOverrides,
  });
  return { quest, mentor: await mk("mentor", "mentor"), ali: await mk("ali", "student"), vali: await mk("vali", "student") };
}

const cert = (questId: unknown, extra: Record<string, unknown> = {}) => ({
  questId: String(questId),
  platform: "Coursera",
  courseName: "Web Development",
  url: "https://www.coursera.org/verify/ABCD1234?utm_source=x",
  certId: "abcd-1234",
  issuedAt: "2026-10-03",
  note: "HTML va CSS ni o'rgandim, kichik sahifa yasadim.",
  confirmed: true,
  ...extra,
});

describe("dalilni normallashtirish", () => {
  it("faqat https; www, kuzatuv parametrlari, # va oxirgi / olib tashlanadi", () => {
    expect(normalizeProofUrl("https://WWW.Coursera.org/verify/ABC/?utm_source=x&b=2&a=1#top")).toBe("https://coursera.org/verify/ABC?a=1&b=2");
    expect(normalizeProofUrl("http://coursera.org/verify/ABC")).toBeNull();
    expect(normalizeProofUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeProofUrl("https://user:pw@coursera.org/x")).toBeNull();
    expect(normalizeProofUrl("https://localhost/x")).toBeNull();
    expect(normalizeCertId(" abcd-1234 ")).toBe("ABCD1234");
  });
});

describe("dalil yuborish", () => {
  it("talablar tekshiriladi; takroriy dalil va sanasi eski sertifikat qabul qilinmaydi; oylik limit", async () => {
    const { quest, ali, vali } = await seed();
    actAs(sessionFor(ali));
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { url: "" }))).message).toMatch(/havolasini/);
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { url: "http://coursera.org/x" }))).message).toMatch(/https/);
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { confirmed: false }))).message).toMatch(/tasdiqlang/);
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { issuedAt: "2026-08-01" }))).message).toMatch(/oldin/);
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { file: { key: `quests/${quest._id}/${vali._id}/x.pdf`, name: "x.pdf", size: 10, mimeType: "application/pdf" } }))).message).toMatch(/Fayl/);

    expect((await review.submitQuestEvidenceAction(cert(quest._id))).success).toBe(true);
    // Xuddi shu havola (boshqacha yozilgan) yoki ID — rad etiladi
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { url: "https://coursera.org/verify/ABCD1234/", certId: "ZZZ999" }))).success).toBe(false);
    actAs(sessionFor(vali));
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { url: "https://coursera.org/verify/OTHER", certId: "ABCD 1234" }))).message).toMatch(/boshqa o'quvchi/);

    actAs(sessionFor(ali));
    for (const n of [2, 3]) expect((await review.submitQuestEvidenceAction(cert(quest._id, { url: `https://coursera.org/verify/N${n}`, certId: `N${n}XYZ` }))).success).toBe(true);
    expect((await review.submitQuestEvidenceAction(cert(quest._id, { url: "https://coursera.org/verify/N4", certId: "N4XYZ" }))).message).toMatch(/oyiga ko'pi bilan 3/);
  });
});

describe("tekshiruv", () => {
  it("parallel ikki tasdiq — bir marta coin; noto'g'ri miqdor rad etiladi; o'quvchi tasdiqlay olmaydi", async () => {
    const { quest, ali, mentor } = await seed();
    actAs(sessionFor(ali));
    const sub = await review.submitQuestEvidenceAction(cert(quest._id));
    const id = sub.data!.id;
    await expect(review.approveQuestSubmissionAction({ submissionId: id, coins: 120 })).rejects.toThrow();

    actAs(sessionFor(mentor));
    expect((await review.approveQuestSubmissionAction({ submissionId: id, coins: 500 })).message).toMatch(/60–150/);
    const results = await Promise.all([1, 2, 3].map(() => review.approveQuestSubmissionAction({ submissionId: id, coins: 120 })));
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await User.findById(ali._id).lean()).toMatchObject({ spendableBalance: 120, xp: 120 });
    expect(await CoinLedger.countDocuments({ studentId: ali._id, type: "quest" })).toBe(1);
    expect(await CertificateRegistry.countDocuments()).toBe(1);
    expect(notify).toHaveBeenCalledWith(ali._id, "quest_result", expect.objectContaining({ approved: true, coins: 120 }));
  });

  it("ikki o'quvchi bir xil sertifikat: birinchisi tasdiqlangach ikkinchisi reyestr tufayli o'tmaydi", async () => {
    const { quest, ali, vali, mentor } = await seed();
    // Navbatga ikkalasi ham tushgan (masalan bir vaqtda yuborishgan)
    const base = { questId: quest._id, status: "pending" as const, monthKey: "2026-10", evidence: { normUrl: "https://coursera.org/verify/same", normCertId: "SAME1" } };
    const [a, b] = await QuestSubmission.insertMany([{ ...base, studentId: ali._id }, { ...base, studentId: vali._id }]);
    actAs(sessionFor(mentor));
    expect((await review.approveQuestSubmissionAction({ submissionId: String(a._id), coins: 60 })).success).toBe(true);
    const second = await review.approveQuestSubmissionAction({ submissionId: String(b._id), coins: 60 });
    expect(second.message).toMatch(/avval qabul qilingan/);
    // Tranzaksiya bekor bo'ldi: holat o'zgarmadi, coin berilmadi
    expect((await QuestSubmission.findById(b._id).lean())?.status).toBe("pending");
    expect((await User.findById(vali._id).lean())?.spendableBalance ?? 0).toBe(0);
  });

  it("rad etilgandan keyin qayta yuborish mumkin; bekor qilish coin va XP ni qaytaradi", async () => {
    const { quest, ali, mentor } = await seed({ repeat: "once" });
    actAs(sessionFor(ali));
    const first = await review.submitQuestEvidenceAction(cert(quest._id));
    actAs(sessionFor(mentor));
    expect((await review.rejectQuestSubmissionAction({ submissionId: first.data!.id, reason: "Ism mos emas" })).success).toBe(true);
    expect((await review.rejectQuestSubmissionAction({ submissionId: first.data!.id, reason: "Yana" })).success).toBe(false);

    actAs(sessionFor(ali));
    const second = await review.submitQuestEvidenceAction(cert(quest._id));
    expect(second.success).toBe(true);
    actAs(sessionFor(mentor));
    await review.approveQuestSubmissionAction({ submissionId: second.data!.id, coins: 90 });
    expect((await review.revokeQuestSubmissionAction({ submissionId: second.data!.id, reason: "Soxta sertifikat" })).success).toBe(true);
    expect(await User.findById(ali._id).lean()).toMatchObject({ spendableBalance: 0, xp: 0 });
    // Reyestr yozuvi qoladi — xuddi shu dalil qayta qabul qilinmaydi
    actAs(sessionFor(ali));
    expect((await review.submitQuestEvidenceAction(cert(quest._id))).success).toBe(false);
  });

  it("haftalik masala: o'rinlar tasdiqlanish tartibida", async () => {
    const { quest, mentor } = await seed({
      verify: "competition",
      template: "weekly_problem",
      evidence: { link: "optional", file: false, certId: false, note: true },
      guard: { uniqueProof: false, dateAfterJoin: false, monthlyLimit: null },
      reward: { coinsMin: 20, coinsMax: 50, xp: null, places: [50, 30, 20] },
      repeat: "weekly",
    });
    const students = await Promise.all(["s1", "s2", "s3", "s4"].map((l) => User.create({ login: l, fullName: l, role: "student", passwordHash: "x" })));
    const subs = await QuestSubmission.insertMany(students.map((st) => ({ questId: quest._id, studentId: st._id, status: "pending" as const, monthKey: "2026-10", periodKey: "w:2026-W42", evidence: { note: "yechim" } })));
    actAs(sessionFor(mentor));
    for (const s of subs) await review.approveQuestSubmissionAction({ submissionId: String(s._id), coins: 0 });
    const saved = await QuestSubmission.find({ _id: { $in: subs.map((s) => s._id) } }).sort({ reviewedAt: 1 }).lean();
    expect(saved.map((s) => [s.place, s.coins])).toEqual([[1, 50], [2, 30], [3, 20], [null, 0]]);
  });
});
