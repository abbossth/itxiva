import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { AttendanceSession } = await import("@/lib/db/models/attendance-session.model");
const { AttendanceRecord } = await import("@/lib/db/models/attendance-record.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const actions = await import("@/actions/attendance.actions");
const { closeExpiredSessions } = await import("@/lib/attendance/core");

// 2026-10-07 — chorshanba. Guruh darsi: Du-Chor-Ju 16:30–18:00 (Toshkent)
const at = (time: string, day = "07") => new Date(`2026-10-${day}T${time}:00+05:00`);
const setNow = (time: string, day?: string) => vi.setSystemTime(at(time, day));

async function setup(coins = { ali: 0, vali: 3, guli: 20 }) {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9, schedule: { days: [1, 3, 5], startTime: "16:30", endTime: "18:00" } });
  const mk = (login: keyof typeof coins) =>
    User.create({ login, fullName: login, role: "student", passwordHash: "x", groupId: group._id, totalCoins: coins[login], spendableBalance: coins[login] });
  const [ali, vali, guli] = await Promise.all([mk("ali"), mk("vali"), mk("guli")]);
  actAs(sessionFor(mentor));
  return { mentor, group, ali, vali, guli, gid: group._id.toString() };
}

const coinsOf = async (id: unknown) => {
  const u = await User.findById(id).lean();
  return [u?.totalCoins, u?.spendableBalance];
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow("16:40");
});
afterEach(() => vi.useRealTimers());

describe("davomat: sessiyani ochish", () => {
  it("dars vaqtidan tashqari va dars kuni bo'lmaganda ochilmaydi", async () => {
    const { gid } = await setup();
    setNow("14:00");
    const early = await actions.startAttendanceSessionAction(gid);
    expect(early.success).toBe(false);
    expect(early.message).toContain("faqat dars vaqtida");

    setNow("16:40", "08"); // payshanba — dars yo'q
    expect((await actions.startAttendanceSessionAction(gid)).success).toBe(false);

    setNow("16:20"); // boshlanishidan 10 daqiqa oldin — mumkin
    expect((await actions.startAttendanceSessionAction(gid)).success).toBe(true);
    expect(await AttendanceSession.countDocuments()).toBe(1);
  });

  it("bir darsga ikkinchi sessiya ochilmaydi", async () => {
    const { gid } = await setup();
    const first = await actions.startAttendanceSessionAction(gid);
    const again = await actions.startAttendanceSessionAction(gid);
    // Ochiq sessiya bo'lsa o'sha qaytadi
    expect(again.data?.sessionId).toBe(first.data?.sessionId);

    await actions.closeAttendanceSessionAction(first.data!.sessionId);
    const afterClose = await actions.startAttendanceSessionAction(gid);
    expect(afterClose.success).toBe(false);
    expect(afterClose.message).toContain("allaqachon olingan");
    expect(await AttendanceSession.countDocuments()).toBe(1);
  });
});

describe("davomat: coin qoidasi", () => {
  it("kelgan +5; yopilganda kelmaganga −5, lekin balans 0 dan pastga tushmaydi", async () => {
    const { gid, ali, vali, guli } = await setup();
    const { data } = await actions.startAttendanceSessionAction(gid);
    const session = await AttendanceSession.findById(data!.sessionId);

    actAs(sessionFor(ali));
    const marked = await actions.markAttendanceAction({ code: session!.currentCode });
    expect(marked.data?.coinsEarned).toBe(5);
    expect(await coinsOf(ali._id)).toEqual([5, 5]);

    actAs(sessionFor(await User.findOne({ login: "ustoz" }).orFail()));
    await actions.closeAttendanceSessionAction(data!.sessionId);

    expect(await coinsOf(vali._id)).toEqual([0, 0]); // 3 coini bor edi — faqat 3 tasi olindi
    expect(await coinsOf(guli._id)).toEqual([15, 15]);
    const closed = await AttendanceSession.findById(data!.sessionId).lean();
    expect(closed?.summary).toMatchObject({ totalPresent: 1, totalAbsent: 2 });
    expect(closed?.finalizedAt).toBeTruthy();
  });

  it("kelmagan → sababli aynan olingan miqdorni qaytaradi; qayta bosish yig'ilmaydi", async () => {
    const { gid, vali, guli } = await setup();
    const { data } = await actions.startAttendanceSessionAction(gid);
    await actions.closeAttendanceSessionAction(data!.sessionId);
    const sid = data!.sessionId;
    const set = (studentId: unknown, status: "present" | "late" | "excused" | "absent") =>
      actions.manualUpdateAttendanceAction({ sessionId: sid, studentId: String(studentId), status });

    await set(vali._id, "excused");
    expect(await coinsOf(vali._id)).toEqual([3, 3]); // 5 emas, olingan 3 qaytdi
    await set(guli._id, "excused");
    expect(await coinsOf(guli._id)).toEqual([20, 20]);

    await set(guli._id, "present");
    expect(await coinsOf(guli._id)).toEqual([25, 25]);
    await set(guli._id, "late");
    expect(await coinsOf(guli._id)).toEqual([23, 23]);
    await set(guli._id, "late"); // o'zgarmagan holat — coin qimirlamaydi
    expect(await coinsOf(guli._id)).toEqual([23, 23]);
    await set(guli._id, "absent");
    expect(await coinsOf(guli._id)).toEqual([15, 15]);
    await set(guli._id, "absent");
    expect(await coinsOf(guli._id)).toEqual([15, 15]);
  });

  it("do'konda sarflangan balans alohida hisoblanadi", async () => {
    const { gid, guli } = await setup();
    await User.updateOne({ _id: guli._id }, { $set: { spendableBalance: 2 } }); // reyting 20, balans 2
    const { data } = await actions.startAttendanceSessionAction(gid);
    await actions.closeAttendanceSessionAction(data!.sessionId);
    expect(await coinsOf(guli._id)).toEqual([15, 0]);

    await actions.manualUpdateAttendanceAction({ sessionId: data!.sessionId, studentId: guli._id.toString(), status: "excused" });
    expect(await coinsOf(guli._id)).toEqual([20, 2]);
  });

  it("eski (qoidasiz) sessiya o'z davridagi hisobda qoladi", async () => {
    const { group, mentor, guli } = await setup();
    const old = await AttendanceSession.create({
      groupId: group._id, mentorId: mentor._id, date: at("16:30", "05"), startTime: at("16:30", "05"),
      status: "closed", currentCode: "OLDOLD", currentToken: "old-token", defaultCoinsReward: 10,
    });
    const set = (status: "present" | "absent") =>
      actions.manualUpdateAttendanceAction({ sessionId: old._id.toString(), studentId: guli._id.toString(), status });
    await set("present");
    expect(await coinsOf(guli._id)).toEqual([30, 30]);
    await set("absent"); // eski qoidada jarima yo'q
    expect(await coinsOf(guli._id)).toEqual([20, 20]);
  });
});

describe("davomat: qo'lda kiritish", () => {
  it("faqat jadvaldagi dars kuniga, kuniga bitta", async () => {
    const { gid } = await setup();
    setNow("20:00");
    expect((await actions.createManualSessionAction({ groupId: gid, dateKey: "2026-10-06" })).success).toBe(false); // seshanba
    expect((await actions.createManualSessionAction({ groupId: gid, dateKey: "2026-10-09" })).success).toBe(false); // kelajak

    const first = await actions.createManualSessionAction({ groupId: gid, dateKey: "2026-10-05" });
    expect(first.success).toBe(true);
    const again = await actions.createManualSessionAction({ groupId: gid, dateKey: "2026-10-05" });
    expect(again.data?.sessionId).toBe(first.data?.sessionId);
    expect(await AttendanceSession.countDocuments()).toBe(1);
  });

  it("bugungi dars boshlanmaguncha kiritib bo'lmaydi", async () => {
    const { gid } = await setup();
    setNow("10:00");
    expect((await actions.createManualSessionAction({ groupId: gid, dateKey: "2026-10-07" })).success).toBe(false);
  });

  it("jarima faqat yakunlangandan keyin qo'llanadi", async () => {
    const { gid, ali, guli } = await setup();
    setNow("20:00");
    const { data } = await actions.createManualSessionAction({ groupId: gid, dateKey: "2026-10-05" });
    const sid = data!.sessionId;
    expect(await coinsOf(guli._id)).toEqual([20, 20]); // hali jarima yo'q

    await actions.manualUpdateAttendanceAction({ sessionId: sid, studentId: ali._id.toString(), status: "present" });
    expect(await coinsOf(ali._id)).toEqual([5, 5]);

    expect((await actions.finalizeAttendanceSessionAction(sid)).success).toBe(true);
    expect(await coinsOf(guli._id)).toEqual([15, 15]);
    expect(await coinsOf(ali._id)).toEqual([5, 5]);

    // Ikkinchi marta yakunlash hech narsani o'zgartirmaydi
    await actions.finalizeAttendanceSessionAction(sid);
    expect(await coinsOf(guli._id)).toEqual([15, 15]);
  });
});

describe("davomat: o'chirish va avtomatik yopilish", () => {
  it("o'chirilganda barcha coinlar qaytadi va yozuvlar yo'qoladi", async () => {
    const { gid, ali, vali, guli } = await setup();
    const { data } = await actions.startAttendanceSessionAction(gid);
    await actions.manualUpdateAttendanceAction({ sessionId: data!.sessionId, studentId: ali._id.toString(), status: "present" });
    await actions.closeAttendanceSessionAction(data!.sessionId);
    expect(await coinsOf(ali._id)).toEqual([5, 5]);

    const res = await actions.deleteAttendanceSessionAction(data!.sessionId);
    expect(res.success).toBe(true);
    expect(await coinsOf(ali._id)).toEqual([0, 0]);
    expect(await coinsOf(vali._id)).toEqual([3, 3]);
    expect(await coinsOf(guli._id)).toEqual([20, 20]);
    expect(await AttendanceSession.countDocuments()).toBe(0);
    expect(await AttendanceRecord.countDocuments()).toBe(0);
    // Tarix saqlanadi: har bir harakat va uning qaytarilishi
    expect(await CoinLedger.countDocuments({ studentId: guli._id })).toBe(2);

    // O'chirilgach shu kunga yana ochish mumkin
    expect((await actions.startAttendanceSessionAction(gid)).success).toBe(true);
  });

  it("o'quvchi davomatni o'chira olmaydi", async () => {
    const { gid, ali } = await setup();
    const { data } = await actions.startAttendanceSessionAction(gid);
    actAs(sessionFor(ali));
    await expect(actions.deleteAttendanceSessionAction(data!.sessionId)).rejects.toThrow();
    expect(await AttendanceSession.countDocuments()).toBe(1);
  });

  it("yopish unutilgan sessiya dars tugagach avtomatik yopiladi", async () => {
    const { gid, guli } = await setup();
    const { data } = await actions.startAttendanceSessionAction(gid);

    expect(await closeExpiredSessions(at("18:20"))).toBe(0); // 30 daqiqa hali o'tmagan
    expect(await closeExpiredSessions(at("18:31"))).toBe(1);
    const s = await AttendanceSession.findById(data!.sessionId).lean();
    expect(s?.status).toBe("closed");
    expect(await coinsOf(guli._id)).toEqual([15, 15]);
  });
});
