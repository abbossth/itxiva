import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { Penalty } = await import("@/lib/db/models/penalty.model");
const attendance = await import("@/actions/attendance.actions");
const penaltyActions = await import("@/actions/penalty.actions");
const { applyMissedHomeworkPenalties } = await import("@/lib/homework-penalties");
const { penaltyAmount } = await import("@/lib/penalty-ladder");

// Guruh darsi: Du-Chor-Ju 16:30–18:00 (Toshkent)
const at = (date: string, time = "20:00") => new Date(`${date}T${time}:00+05:00`);

async function setup(balance = 200) {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9, schedule: { days: [1, 3, 5], startTime: "16:30", endTime: "18:00" } });
  const mk = (login: string, coins: number) =>
    User.create({
      login,
      fullName: login,
      role: "student",
      passwordHash: "x",
      groupId: group._id,
      totalCoins: coins,
      spendableBalance: coins,
      createdAt: at("2026-09-01"),
    });
  const [guli, ali] = await Promise.all([mk("guli", balance), mk("ali", 0)]);
  actAs(sessionFor(mentor));
  return { mentor, group, guli, ali, gid: group._id.toString() };
}

const coinsOf = async (id: unknown) => {
  const u = await User.findById(id).lean();
  return [u?.totalCoins, u?.spendableBalance];
};

/** Shu kungi darsni qo'lda kiritadi, `present` dagilarni "kelgan" qiladi va yakunlaydi (qolganlar — sababsiz) */
async function lessonDay(gid: string, dateKey: string, present: string[] = []) {
  vi.setSystemTime(at(dateKey));
  const { data } = await attendance.createManualSessionAction({ groupId: gid, dateKey });
  const sid = data!.sessionId;
  for (const studentId of present) {
    await attendance.manualUpdateAttendanceAction({ sessionId: sid, studentId, status: "present" });
  }
  expect((await attendance.finalizeAttendanceSessionAction(sid)).success).toBe(true);
  return sid;
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("jarima zinapoyasi", () => {
  it("1-marta −10, 2-marta −30, keyin har safar −50", () => {
    expect([1, 2, 3, 4, 7].map(penaltyAmount)).toEqual([10, 30, 50, 50, 50]);
  });
});

describe("sababsiz dars qoldirish", () => {
  it("bir oy ichida jarima oshib boradi va har biri alohida yoziladi", async () => {
    const { gid, guli } = await setup();
    const balances: number[] = [];
    for (const day of ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12"]) {
      await lessonDay(gid, day);
      balances.push((await coinsOf(guli._id))[1]!);
    }
    expect(balances).toEqual([190, 160, 110, 60]);

    const penalties = await Penalty.find({ studentId: guli._id }).sort({ no: 1 }).lean();
    expect(penalties.map((p) => [p.no, p.wanted, p.applied, p.monthKey])).toEqual([
      [1, 10, 10, "2026-10"],
      [2, 30, 30, "2026-10"],
      [3, 50, 50, "2026-10"],
      [4, 50, 50, "2026-10"],
    ]);
    expect(penalties[1].reason).toBe("Darsga sababsiz kelmagani uchun (oktabrda 2-marta)");
    expect(await CoinLedger.countDocuments({ studentId: guli._id, type: "penalty" })).toBe(4);
  });

  it("kelgan +10 oladi va jarima hisobiga kirmaydi", async () => {
    const { gid, guli } = await setup();
    await lessonDay(gid, "2026-10-05", [guli._id.toString()]);
    expect(await coinsOf(guli._id)).toEqual([210, 210]);
    await lessonDay(gid, "2026-10-07");
    expect(await coinsOf(guli._id)).toEqual([200, 200]); // oydagi birinchi sababsiz — −10
  });

  it("yangi oyda hisob qaytadan boshlanadi", async () => {
    const { gid, guli } = await setup();
    await lessonDay(gid, "2026-10-28");
    await lessonDay(gid, "2026-10-30");
    expect(await coinsOf(guli._id)).toEqual([160, 160]);
    await lessonDay(gid, "2026-11-02");
    expect(await coinsOf(guli._id)).toEqual([150, 150]);
    expect((await Penalty.findOne({ studentId: guli._id, monthKey: "2026-11" }).lean())?.no).toBe(1);
  });

  it("'sababli' qilinsa coin qaytadi va jarima o'chadi; keyingi jarimalar o'z tartibida qoladi", async () => {
    const { gid, guli } = await setup();
    const first = await lessonDay(gid, "2026-10-05");
    await lessonDay(gid, "2026-10-07");
    expect(await coinsOf(guli._id)).toEqual([160, 160]);

    await attendance.manualUpdateAttendanceAction({ sessionId: first, studentId: guli._id.toString(), status: "excused" });
    expect(await coinsOf(guli._id)).toEqual([170, 170]);
    expect(await Penalty.countDocuments({ studentId: guli._id })).toBe(1);

    // Oyda endi bitta jarima bor — keyingisi 2-marta (−30)
    await lessonDay(gid, "2026-10-09");
    expect(await coinsOf(guli._id)).toEqual([140, 140]);
  });

  it("balans yetmasa borini oladi, 0 dan pastga tushmaydi", async () => {
    const { gid, guli } = await setup(15);
    await lessonDay(gid, "2026-10-05");
    await lessonDay(gid, "2026-10-07");
    expect(await coinsOf(guli._id)).toEqual([0, 0]);
    const second = await Penalty.findOne({ studentId: guli._id, no: 2 }).lean();
    expect(second).toMatchObject({ wanted: 30, applied: 5 });
  });

  it("o'chirilgan dars jarimasi ham o'chadi", async () => {
    const { gid, guli } = await setup();
    const sid = await lessonDay(gid, "2026-10-05");
    expect((await attendance.deleteAttendanceSessionAction(sid)).success).toBe(true);
    expect(await coinsOf(guli._id)).toEqual([200, 200]);
    expect(await Penalty.countDocuments()).toBe(0);
  });
});

describe("topshirilmagan uyga vazifa", () => {
  async function homeworkLesson(groupId: import("mongoose").Types.ObjectId, dueAt: Date, title = "HTML") {
    return Lesson.create({
      groupId,
      quarter: 2,
      order: 1,
      title,
      isPublished: true,
      homework: { isEnabled: true, instructions: "Sahifa yarating", attachments: [], dueAt, coinsReward: 20 },
    });
  }

  it("muddat o'tgach topshirmaganlardan olinadi, topshirganlarga tegmaydi; takror ishlash bitta jarima", async () => {
    const { group, guli, ali } = await setup();
    await User.updateOne({ _id: ali._id }, { $set: { totalCoins: 50, spendableBalance: 50 } });
    const lesson = await homeworkLesson(group._id, at("2026-11-11", "16:30"));
    await HomeworkSubmission.create({ lessonId: lesson._id, groupId: group._id, studentId: ali._id, text: "Tayyor" });

    expect(await applyMissedHomeworkPenalties(at("2026-11-11", "16:00"))).toEqual({ lessons: 0, penalized: 0 }); // muddat hali o'tmagan
    expect(await applyMissedHomeworkPenalties(at("2026-11-11", "16:35"))).toEqual({ lessons: 1, penalized: 1 });
    expect(await coinsOf(guli._id)).toEqual([190, 190]);
    expect(await coinsOf(ali._id)).toEqual([50, 50]);

    expect(await applyMissedHomeworkPenalties(at("2026-11-11", "16:40"))).toEqual({ lessons: 0, penalized: 0 });
    expect(await coinsOf(guli._id)).toEqual([190, 190]);
    const p = await Penalty.findOne({ studentId: guli._id }).lean();
    expect(p).toMatchObject({ kind: "homework", no: 1, wanted: 10, applied: 10 });
    expect(p?.reason).toBe("«HTML» uyga vazifasi muddatida topshirilmagani uchun (noyabrda 1-marta)");
  });

  it("vazifa jarimalari davomatdan alohida sanaladi va oy ichida oshadi", async () => {
    const { gid, group, guli } = await setup();
    await lessonDay(gid, "2026-11-09"); // davomat: −10
    await homeworkLesson(group._id, at("2026-11-11", "16:30"), "HTML");
    await homeworkLesson(group._id, at("2026-11-13", "16:30"), "CSS");
    await applyMissedHomeworkPenalties(at("2026-11-14", "09:00"));
    // davomat −10, vazifa −10 va −30
    expect(await coinsOf(guli._id)).toEqual([150, 150]);
  });

  it("muddat uzaytirilsa yangi muddat o'tgach qayta tekshiriladi, lekin ikki marta olinmaydi", async () => {
    const { group, guli } = await setup();
    const lesson = await homeworkLesson(group._id, at("2026-11-11", "16:30"));
    await applyMissedHomeworkPenalties(at("2026-11-11", "17:00"));
    await Lesson.updateOne({ _id: lesson._id }, { $set: { "homework.dueAt": at("2026-11-12", "16:30") } });
    expect((await applyMissedHomeworkPenalties(at("2026-11-12", "17:00"))).lessons).toBe(1);
    expect(await coinsOf(guli._id)).toEqual([190, 190]);
  });

  it("qoida kuchga kirgunga qadar tugagan muddatlar va keyin qo'shilgan o'quvchilar jarimasiz", async () => {
    const { group, guli } = await setup();
    await homeworkLesson(group._id, at("2026-11-05", "16:30"), "Eski");
    const lesson = await homeworkLesson(group._id, at("2026-11-11", "16:30"), "Yangi");
    const late = await User.create({
      login: "yangi",
      fullName: "yangi",
      role: "student",
      passwordHash: "x",
      groupId: group._id,
      totalCoins: 40,
      spendableBalance: 40,
      createdAt: at("2026-11-12"),
    });
    await applyMissedHomeworkPenalties(at("2026-11-12", "10:00"));
    expect(await Penalty.countDocuments({ studentId: guli._id })).toBe(1);
    expect((await Penalty.findOne({ studentId: guli._id }).lean())?.refId.toString()).toBe(lesson._id.toString());
    expect(await coinsOf(late._id)).toEqual([40, 40]);
  });
});

describe("saytdagi jarima oynasi", () => {
  it("ko'rilmagan jarimalar bir marta ko'rsatiladi", async () => {
    const { gid, guli } = await setup();
    await lessonDay(gid, "2026-10-05");
    await lessonDay(gid, "2026-10-07");

    actAs(sessionFor(guli));
    const notice = await penaltyActions.getUnseenPenaltiesAction();
    expect(notice?.items.map((i) => i.applied)).toEqual([10, 30]);
    expect(notice).toMatchObject({ total: 40, balance: 160, next: { absence: 50 } });

    await penaltyActions.acknowledgePenaltiesAction(notice!.items.map((i) => i.id));
    expect(await penaltyActions.getUnseenPenaltiesAction()).toBeNull();
  });

  it("boshqa o'quvchining jarimasini ko'rilgan qilib bo'lmaydi", async () => {
    const { gid, guli, ali } = await setup();
    await lessonDay(gid, "2026-10-05");
    const ids = (await Penalty.find({ studentId: guli._id }).lean()).map((p) => p._id.toString());
    actAs(sessionFor(ali));
    await penaltyActions.acknowledgePenaltiesAction(ids);
    actAs(sessionFor(guli));
    expect((await penaltyActions.getUnseenPenaltiesAction())?.items).toHaveLength(1);
  });
});
