import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Fonda ishlaydigan plagiat/AI tekshiruvi: testda kutib olinadi
const afterJobs: Promise<unknown>[] = [];
vi.mock("next/server", () => ({ after: (job: () => unknown) => void afterJobs.push(Promise.resolve(job())) }));
const flushAfter = async () => {
  await Promise.all(afterJobs.splice(0));
};
const estimateAiWriting = vi.fn<(params: unknown) => Promise<{ score: number | null; signals: string[] }>>(async () => ({ score: 75, signals: ["Markdown: **Xulosa**"] }));
vi.mock("@/lib/ai/detect-ai", () => ({ estimateAiWriting: (p: unknown) => estimateAiWriting(p) }));
vi.stubEnv("GEMINI_API_KEY", "test");
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
const sendNotifications = vi.fn(async (recipients: { ids: unknown[] }) => recipients.ids.length);
vi.mock("@/lib/notifications/notify", () => ({
  sendNotifications,
  notify: vi.fn(),
  notifyMany: vi.fn(),
  notifyMentors: vi.fn(),
  notifyGroup: vi.fn(),
  notifyAllStudents: vi.fn(),
}));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");
const hw = await import("@/actions/homework.actions");

async function seed(opts: { dueAt?: Date | null; published?: boolean } = {}) {
  const group = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027" });
  const other = await Group.create({ name: "G-2", grade: 8, academicYear: "2026-2027" });
  const mk = (login: string, role: "mentor" | "student", groupId: mongoose.Types.ObjectId | null = null) =>
    User.create({ login, fullName: login, role, groupId, passwordHash: "x", totalCoins: 0, spendableBalance: 0 });
  const mentor = await mk("mentor", "mentor");
  const student = await mk("ali", "student", group._id);
  const outsider = await mk("begona", "student", other._id);
  const lesson = await Lesson.create({
    groupId: group._id,
    quarter: 1,
    order: 1,
    title: "HTML",
    isPublished: opts.published ?? true,
    homework: { isEnabled: true, instructions: "Sahifa yarating", attachments: [], dueAt: opts.dueAt ?? null, coinsReward: 20 },
  });
  return { mentor, student, outsider, lesson, lessonId: lesson._id.toString() };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("uyga vazifa: yuborish", () => {
  it("o'z guruhining vazifasiga javob yuboriladi", async () => {
    const { student, lessonId } = await seed();
    actAs(sessionFor(student));
    const res = await hw.submitHomeworkAction({ lessonId, text: "<h1>Salom</h1>", links: ["https://github.com/ali/loyiha"], files: [] });
    expect(res.success).toBe(true);
    const sub = await HomeworkSubmission.findOne({ studentId: student._id }).lean();
    expect(sub).toMatchObject({ status: "submitted", isLate: false, attempt: 1 });
  });

  it("bo'sh javob, noto'g'ri havola va begona fayl kaliti rad etiladi", async () => {
    const { student, outsider, lessonId } = await seed();
    actAs(sessionFor(student));
    expect((await hw.submitHomeworkAction({ lessonId, text: "  ", links: [], files: [] })).success).toBe(false);
    expect((await hw.submitHomeworkAction({ lessonId, text: "", links: ["javascript:alert(1)"], files: [] })).success).toBe(false);
    const foreignKey = `homework/${lessonId}/${outsider._id}/1-a.zip`;
    expect((await hw.submitHomeworkAction({ lessonId, text: "", links: [], files: [{ key: foreignKey, name: "a.zip" }] })).success).toBe(false);
    expect(await HomeworkSubmission.countDocuments()).toBe(0);
  });

  it("boshqa guruh o'quvchisi va nashr etilmagan dars uchun yuborib bo'lmaydi", async () => {
    const { outsider, lessonId } = await seed();
    actAs(sessionFor(outsider));
    expect((await hw.submitHomeworkAction({ lessonId, text: "javob", links: [], files: [] })).success).toBe(false);

    await clearDb();
    const draft = await seed({ published: false });
    actAs(sessionFor(draft.student));
    expect((await hw.submitHomeworkAction({ lessonId: draft.lessonId, text: "javob", links: [], files: [] })).success).toBe(false);
  });

  it("muddatdan keyin yuborilgan javob 'kechikkan' deb belgilanadi", async () => {
    const { student, lessonId } = await seed({ dueAt: new Date(Date.now() - 60_000) });
    actAs(sessionFor(student));
    expect((await hw.submitHomeworkAction({ lessonId, text: "javob", links: [], files: [] })).success).toBe(true);
    expect((await HomeworkSubmission.findOne().lean())?.isLate).toBe(true);
  });
});

describe("uyga vazifa: baholash", () => {
  async function submitted() {
    const ctx = await seed();
    actAs(sessionFor(ctx.student));
    await hw.submitHomeworkAction({ lessonId: ctx.lessonId, text: "javob", links: [], files: [] });
    const submissionId = (await HomeworkSubmission.findOne())!._id.toString();
    return { ...ctx, submissionId };
  }

  it("baho coin beradi; qayta baholashda faqat farq yoziladi", async () => {
    const { mentor, student, submissionId } = await submitted();
    actAs(sessionFor(mentor));

    expect((await hw.gradeHomeworkAction({ submissionId, score: 80, feedback: "Yaxshi", coins: 16 })).success).toBe(true);
    expect((await hw.gradeHomeworkAction({ submissionId, score: 100, feedback: "Zo'r", coins: 20 })).success).toBe(true);
    expect((await hw.gradeHomeworkAction({ submissionId, score: 50, feedback: "", coins: 10 })).success).toBe(true);

    const user = await User.findById(student._id).lean();
    expect([user?.totalCoins, user?.spendableBalance]).toEqual([10, 10]);
    const ledger = await CoinLedger.find({ studentId: student._id }).sort({ createdAt: 1 }).lean();
    expect(ledger.map((l) => l.amount)).toEqual([16, 4, -10]);
    expect(ledger.every((l) => l.type === "homework")).toBe(true);
  });

  it("bir xil bahoni ikki marta saqlash coinni ikki marta bermaydi", async () => {
    const { mentor, student, submissionId } = await submitted();
    actAs(sessionFor(mentor));
    await Promise.all([
      hw.gradeHomeworkAction({ submissionId, score: 100, feedback: "", coins: 20 }),
      hw.gradeHomeworkAction({ submissionId, score: 100, feedback: "", coins: 20 }),
    ]);
    await hw.gradeHomeworkAction({ submissionId, score: 100, feedback: "", coins: 20 });
    expect((await User.findById(student._id).lean())?.totalCoins).toBe(20);
  });

  it("coin belgilangan mukofotdan oshmaydi, ball 0-100 oralig'ida", async () => {
    const { mentor, submissionId } = await submitted();
    actAs(sessionFor(mentor));
    expect((await hw.gradeHomeworkAction({ submissionId, score: 100, feedback: "", coins: 21 })).success).toBe(false);
    expect((await hw.gradeHomeworkAction({ submissionId, score: 101, feedback: "", coins: 5 })).success).toBe(false);
    expect((await hw.gradeHomeworkAction({ submissionId, score: -1, feedback: "", coins: 5 })).success).toBe(false);
  });

  it("o'quvchi o'zini baholay olmaydi", async () => {
    const { student, submissionId } = await submitted();
    actAs(sessionFor(student));
    await expect(hw.gradeHomeworkAction({ submissionId, score: 100, feedback: "", coins: 20 })).rejects.toThrow(/Ruxsat berilmagan/);
  });

  it("baholangan javobni o'quvchi qayta yubora olmaydi; qaytarilganini yubora oladi", async () => {
    const { mentor, student, lessonId, submissionId } = await submitted();
    actAs(sessionFor(mentor));
    expect((await hw.returnHomeworkAction({ submissionId, feedback: "Rasm qo'shing" })).success).toBe(true);

    actAs(sessionFor(student));
    expect((await hw.submitHomeworkAction({ lessonId, text: "tuzatildi", links: [], files: [] })).success).toBe(true);
    expect((await HomeworkSubmission.findById(submissionId).lean())?.attempt).toBe(2);

    actAs(sessionFor(mentor));
    await hw.gradeHomeworkAction({ submissionId, score: 90, feedback: "", coins: 18 });
    expect((await hw.returnHomeworkAction({ submissionId, feedback: "Yana tuzating" })).success).toBe(false);

    actAs(sessionFor(student));
    expect((await hw.submitHomeworkAction({ lessonId, text: "yana", links: [], files: [] })).success).toBe(false);
  });

  it("javob fayliga faqat mentor yoki egasi kira oladi", async () => {
    const { outsider, submissionId } = await submitted();
    actAs(sessionFor(outsider));
    const res = await hw.getHomeworkFileUrlAction({ submissionId, key: "homework/x/y/z.zip" });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Ruxsat/);
  });
});

describe("uyga vazifa: darslar ro'yxati, jurnal va eslatma", () => {
  async function seedClass() {
    const ctx = await seed({ dueAt: new Date(Date.now() - 60_000) });
    const groupId = ctx.lesson.groupId;
    const vali = await User.create({ login: "vali", fullName: "Vali", role: "student", groupId, passwordHash: "x" });
    const guli = await User.create({ login: "guli", fullName: "Guli", role: "student", groupId, passwordHash: "x" });
    const noHw = await Lesson.create({ groupId, quarter: 1, order: 2, title: "CSS", isPublished: true });

    actAs(sessionFor(ctx.student));
    await hw.submitHomeworkAction({ lessonId: ctx.lessonId, text: "javob", links: [], files: [] });
    actAs(sessionFor(vali));
    await hw.submitHomeworkAction({ lessonId: ctx.lessonId, text: "javob 2", links: [], files: [] });
    actAs(sessionFor(ctx.mentor));
    const sub = await HomeworkSubmission.findOne({ studentId: vali._id }).orFail();
    await hw.gradeHomeworkAction({ submissionId: sub._id.toString(), score: 80, feedback: "", coins: 0 });
    return { ...ctx, vali, guli, noHw, groupId: groupId.toString() };
  }

  it("dars bo'yicha sonlar: topshirgan, tekshirilmagan, baholangan", async () => {
    const { lessonId, noHw } = await seedClass();
    const stats = await hw.getHomeworkStatsForLessons([lessonId, noHw._id.toString(), "noto'g'ri-id"]);
    expect(stats[lessonId]).toMatchObject({ totalStudents: 3, submitted: 2, ungraded: 1, graded: 1, returned: 0 });
    // Vazifasi yo'q dars ro'yxatga kirmaydi
    expect(stats[noHw._id.toString()]).toBeUndefined();
  });

  it("jurnal: har bir o'quvchining holati va o'rtacha bali", async () => {
    const { lessonId, groupId, student, vali, guli } = await seedClass();
    const journal = await hw.getHomeworkJournal(groupId, 1);
    expect(journal!.lessons.map((l) => l.title)).toEqual(["HTML"]);
    const of = (id: unknown) => journal!.students.find((s) => s.studentId === String(id))!;
    expect(of(student._id).cells[lessonId]).toMatchObject({ state: "submitted", score: null, isLate: true });
    expect(of(vali._id)).toMatchObject({ done: 1, avgScore: 80 });
    expect(of(guli._id)).toMatchObject({ cells: {}, done: 0, avgScore: null });
    expect(await hw.getHomeworkJournal(groupId, 9)).toBeNull();
  });

  it("eslatma faqat topshirmaganlarga ketadi", async () => {
    const { lessonId, guli, student } = await seedClass();
    sendNotifications.mockClear();
    const res = await hw.remindMissingHomeworkAction(lessonId);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ sent: 1, pending: 1 });
    const [recipients, type, payload] = sendNotifications.mock.calls[0] as unknown as [{ ids: unknown[] }, string, { fromMentor: boolean }];
    expect(recipients.ids.map(String)).toEqual([guli._id.toString()]);
    expect(type).toBe("homework_due");
    expect(payload.fromMentor).toBe(true);

    // O'quvchi eslatma yubora olmaydi
    actAs(sessionFor(student));
    await expect(hw.remindMissingHomeworkAction(lessonId)).rejects.toThrow();
  });

  it("qoralama dars va hamma topshirgan vazifa uchun eslatma ketmaydi", async () => {
    const draft = await seed({ published: false });
    actAs(sessionFor(draft.mentor));
    expect((await hw.remindMissingHomeworkAction(draft.lessonId)).success).toBe(false);
  });
});

describe("uyga vazifa: plagiat va AI tekshiruvi", () => {
  const answer = `1) 3 KB = 24 bayt chunki kilobaytda sakkiz bit bor deb hisobladim
2) 2 GB = 2024 MB
3) 0,5GB = 1/2=1024 * 3 = 3072GB qilib chiqdi`;

  it("ko'chirilgan javob ikkala tomonda ham belgilanadi; o'quvchiga boshqaning ismi ko'rinmaydi", async () => {
    const { student, lessonId, lesson } = await seed();
    const copier = await User.create({
      login: "vali", fullName: "Vali", role: "student", groupId: lesson.groupId, passwordHash: "x", totalCoins: 0, spendableBalance: 0,
    });

    actAs(sessionFor(student));
    expect((await hw.submitHomeworkAction({ lessonId, text: answer, links: [], files: [] })).success).toBe(true);
    expect((await HomeworkSubmission.findOne({ studentId: student._id }).lean())?.integrity?.status).toBe("pending");
    await flushAfter();

    actAs(sessionFor(copier));
    await hw.submitHomeworkAction({ lessonId, text: answer.toUpperCase(), links: [], files: [] });
    await flushAfter();

    const copied = await HomeworkSubmission.findOne({ studentId: copier._id }).lean();
    expect(copied?.integrity).toMatchObject({ status: "done", aiScore: 75, aiSignals: ["Markdown: **Xulosa**"] });
    expect(copied?.integrity?.similarity).toBeGreaterThanOrEqual(90);
    expect(copied?.integrity?.matches[0]).toMatchObject({ fullName: "ali" });

    // Birinchi yuborgan o'quvchining hisobotiga ham ko'chirgan qo'shiladi
    const source = await HomeworkSubmission.findOne({ studentId: student._id }).lean();
    expect(source?.integrity?.similarity).toBeGreaterThanOrEqual(90);
    expect(source?.integrity?.matches[0]).toMatchObject({ fullName: "Vali" });

    const own = await hw.getHomeworkForStudent(lessonId);
    expect(own?.submission?.integrity?.matches[0]).toEqual({ percent: source!.integrity!.similarity });

    // Qayta yuborilgan, endi o'xshamaydigan javob ikkinchi tomondan ham olib tashlanadi
    await hw.submitHomeworkAction({
      lessonId,
      text: "Men hammasini qaytadan o'zim yechdim: uch kilobayt uch ming yetmish ikki baytga teng bo'ladi, ikki gigabayt esa 2048 megabayt.",
      links: [],
      files: [],
    });
    await flushAfter();
    expect((await HomeworkSubmission.findOne({ studentId: copier._id }).lean())?.integrity).toMatchObject({ similarity: 0, matches: [] });
  });

  it("bir xil fayl (nomi boshqa bo'lsa ham) plagiat deb topiladi; matnsiz javobda AI tekshirilmaydi", async () => {
    const { student, lessonId, lesson } = await seed();
    const copier = await User.create({
      login: "vali", fullName: "Vali", role: "student", groupId: lesson.groupId, passwordHash: "x", totalCoins: 0, spendableBalance: 0,
    });
    const file = (owner: { _id: { toString(): string } }, name: string) => ({
      key: `homework/${lessonId}/${owner._id.toString()}/${name}`, name, mimeType: "image/png", size: 48213,
    });
    actAs(sessionFor(student));
    await hw.submitHomeworkAction({ lessonId, text: "", links: [], files: [file(student, "ekran.png")] });
    actAs(sessionFor(copier));
    await hw.submitHomeworkAction({ lessonId, text: "", links: [], files: [file(copier, "rasm.png")] });
    await flushAfter();
    estimateAiWriting.mockClear();

    const copied = await HomeworkSubmission.findOne({ studentId: copier._id }).lean();
    expect(copied?.integrity).toMatchObject({ status: "done", similarity: 100, aiScore: null });
    expect(estimateAiWriting).not.toHaveBeenCalled();
  });

  it("mentor tekshiruvsiz eski javobni tekshiradi; o'quvchi bu amalni chaqira olmaydi", async () => {
    const { mentor, student, lesson } = await seed();
    const old = await HomeworkSubmission.create({
      lessonId: lesson._id, groupId: lesson.groupId, studentId: student._id, text: answer, status: "submitted",
    });
    expect(old.integrity).toBeNull();

    actAs(sessionFor(student));
    await expect(hw.checkHomeworkIntegrityAction(old._id.toString())).rejects.toThrow();

    actAs(sessionFor(mentor));
    const res = await hw.checkHomeworkIntegrityAction(old._id.toString());
    expect(res).toMatchObject({ success: true, data: { status: "done", similarity: 0, aiScore: 75 } });
  });
});
