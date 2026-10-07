import mongoose from "mongoose";
import { AttendanceSession, type IAttendanceSession } from "@/lib/db/models/attendance-session.model";
import { AttendanceRecord, type AttendanceMethod, type AttendanceStatus, type IAttendanceRecord } from "@/lib/db/models/attendance-record.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { ATTENDANCE_COINS, coinRulesOf } from "@/lib/attendance-status";
import { addDaysToKey, dateFromKey, isValidSchedule, toDateKey } from "@/lib/schedule";
import { notify } from "@/lib/notifications/notify";

// Davomatning coin hisobi va sessiyani yakunlash. Server action'lar va cron shu yerdan foydalanadi
// (bu fayl "use server" emas — funksiyalarni brauzerdan chaqirib bo'lmaydi).

type SessionLike = Pick<IAttendanceSession, "_id" | "groupId" | "coinRules" | "defaultCoinsReward" | "finalizedAt">;

const REASONS: Record<AttendanceStatus, string> = {
  present: "Darsga kelgani uchun",
  late: "Darsga kechikib kelgani uchun",
  excused: "Davomat «sababli» deb belgilandi",
  absent: "Darsga kelmagani uchun",
};

/** Kelmaganlarga jarima qo'llanadigan holatmi (eski, qoidasiz sessiyalarda jarima yo'q — doim "yakunlangan") */
export function isSessionFinalized(session: Pick<IAttendanceSession, "coinRules" | "finalizedAt">): boolean {
  return !session.coinRules || Boolean(session.finalizedAt);
}

export async function recomputeSummary(sessionId: string | mongoose.Types.ObjectId) {
  const counts = await AttendanceRecord.aggregate<{ _id: AttendanceStatus; n: number }>([
    { $match: { sessionId: new mongoose.Types.ObjectId(String(sessionId)) } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const by = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  const summary = {
    totalPresent: by.present ?? 0,
    totalLate: by.late ?? 0,
    totalExcused: by.excused ?? 0,
    totalAbsent: by.absent ?? 0,
  };
  await AttendanceSession.updateOne({ _id: sessionId }, { $set: { summary } });
  return summary;
}

/** Manfiy o'zgarish balansni 0 dan pastga tushirmaydi */
function clampDelta(delta: number, balance: number): number {
  return delta < 0 ? Math.max(delta, -Math.max(balance, 0)) : delta;
}

async function moveCoins(
  studentId: string | mongoose.Types.ObjectId,
  wantTotal: number,
  wantBalance: number
): Promise<{ dTotal: number; dBalance: number; totalAfter?: number; balanceAfter?: number }> {
  if (wantTotal === 0 && wantBalance === 0) return { dTotal: 0, dBalance: 0 };
  const user = await User.findById(studentId).select("totalCoins spendableBalance").lean();
  if (!user) return { dTotal: 0, dBalance: 0 };
  const dTotal = clampDelta(wantTotal, user.totalCoins ?? 0);
  const dBalance = clampDelta(wantBalance, user.spendableBalance ?? 0);
  if (dTotal === 0 && dBalance === 0) return { dTotal: 0, dBalance: 0 };
  const updated = await User.findByIdAndUpdate(
    studentId,
    { $inc: { totalCoins: dTotal, spendableBalance: dBalance } },
    { returnDocument: "after" }
  );
  return { dTotal, dBalance, totalAfter: updated?.totalCoins, balanceAfter: updated?.spendableBalance };
}

/**
 * Yozuvning coin ta'sirini uning hozirgi holatiga moslaydi.
 * Yozuv o'zining haqiqiy ta'sirini saqlaydi (`coinsAwarded`, `balanceDelta`), shuning uchun holat necha marta
 * o'zgartirilmasin, coin yig'ilib ketmaydi va jarima bekor qilinganda aynan olingan miqdor qaytadi.
 */
export async function settleRecordCoins(
  session: SessionLike,
  record: IAttendanceRecord,
  opts: { silent?: boolean; description?: string } = {}
): Promise<number> {
  const rules = coinRulesOf(session);
  // Yakunlanmagan darsda "kelmagan" hali jarima emas: mentor belgilab bo'lguncha kutiladi
  const target = record.status === "absent" && !isSessionFinalized(session) ? Math.max(rules.absent, 0) : rules[record.status];
  const prevTotal = record.coinsAwarded ?? 0;
  const prevBalance = record.balanceDelta ?? prevTotal;

  const moved = await moveCoins(record.studentId, target - prevTotal, target - prevBalance);
  record.coinsAwarded = prevTotal + moved.dTotal;
  record.balanceDelta = prevBalance + moved.dBalance;
  await record.save();

  const amount = moved.dTotal || moved.dBalance;
  if (amount !== 0) {
    await CoinLedger.create({
      studentId: record.studentId,
      amount,
      type: amount > 0 ? "attendance" : "adjustment",
      referenceId: session._id,
      description: opts.description ?? REASONS[record.status],
      balanceAfter: moved.totalAfter,
    });
    if (!opts.silent) {
      notify(record.studentId, "coins_changed", { amount, reason: REASONS[record.status], balance: moved.balanceAfter });
    }
  }
  return amount;
}

/** O'quvchining shu darsdagi holatini o'rnatadi (yozuv bo'lmasa yaratadi) va coinni moslaydi */
export async function applyAttendanceStatus(
  session: SessionLike,
  studentId: string | mongoose.Types.ObjectId,
  status: AttendanceStatus,
  opts: { notes?: string; method?: AttendanceMethod; silent?: boolean } = {}
): Promise<{ oldStatus: AttendanceStatus | null; coinDelta: number }> {
  let record = await AttendanceRecord.findOne({ sessionId: session._id, studentId });
  const oldStatus = record?.status ?? null;

  if (!record) {
    record = await AttendanceRecord.create({
      sessionId: session._id,
      studentId,
      groupId: session.groupId,
      status,
      method: opts.method ?? "manual",
      markedAt: new Date(),
      coinsAwarded: 0,
      balanceDelta: 0,
      notes: opts.notes,
    });
  } else {
    if (opts.notes !== undefined) record.notes = opts.notes;
    // Holat o'zgarmagan bo'lsa coin qayta hisoblanmaydi (faqat izoh saqlanadi)
    if (oldStatus === status) {
      await record.save();
      return { oldStatus, coinDelta: 0 };
    }
    record.status = status;
  }

  const coinDelta = await settleRecordCoins(session, record, { silent: opts.silent });
  return { oldStatus, coinDelta };
}

/**
 * Darsni yakunlaydi: belgilanmagan o'quvchilar "kelmagan" bo'ladi va kelmaganlarga jarima qo'llanadi.
 * Bir sessiya uchun faqat bir marta ishlaydi.
 */
export async function finalizeSession(sessionId: string | mongoose.Types.ObjectId): Promise<boolean> {
  const now = new Date();
  const session = await AttendanceSession.findOneAndUpdate(
    { _id: sessionId, finalizedAt: null },
    { $set: { finalizedAt: now } },
    { returnDocument: "after" }
  );
  if (!session) return false;

  const [students, existing] = await Promise.all([
    User.find({ groupId: session.groupId, role: "student" }).select("_id").lean(),
    AttendanceRecord.find({ sessionId: session._id }).select("studentId").lean(),
  ]);
  const marked = new Set(existing.map((r) => r.studentId.toString()));
  const missing = students.filter((st) => !marked.has(st._id.toString()));
  if (missing.length > 0) {
    await AttendanceRecord.insertMany(
      missing.map((st) => ({
        sessionId: session._id,
        studentId: st._id,
        groupId: session.groupId,
        status: "absent",
        method: "manual",
        markedAt: now,
        coinsAwarded: 0,
        balanceDelta: 0,
      })),
      { ordered: false }
    ).catch((error) => {
      // Parallel belgilash bilan to'qnashuv (unikal indeks) — mavjud yozuv ustun turadi
      if ((error as { code?: number })?.code !== 11000) throw error;
    });
  }

  const absent = await AttendanceRecord.find({ sessionId: session._id, status: "absent" });
  for (const record of absent) {
    await settleRecordCoins(session, record);
  }
  await recomputeSummary(session._id);
  return true;
}

/** Ochiq sessiyani yopadi va yakunlaydi */
export async function closeSession(sessionId: string | mongoose.Types.ObjectId, actorId?: string): Promise<boolean> {
  const closed = await AttendanceSession.findOneAndUpdate(
    { _id: sessionId, status: "active" },
    { $set: { status: "closed", endTime: new Date() } },
    { returnDocument: "after" }
  );
  if (!closed) return false;
  await finalizeSession(closed._id);
  const summary = await recomputeSummary(closed._id);
  await AuditLog.create({
    actorId: actorId ?? closed.mentorId,
    action: "CLOSE_ATTENDANCE",
    details: { sessionId: closed._id.toString(), summary, auto: !actorId },
  });
  return true;
}

// Dars tugaganidan keyin sessiya shuncha vaqt ochiq qolishi mumkin
const CLOSE_GRACE_MS = 30 * 60 * 1000;
// Jadvali yo'q guruhda sessiya eng ko'pi bilan shuncha ochiq turadi
const MAX_OPEN_MS = 3 * 60 * 60 * 1000;

/** Mentor yopishni unutgan sessiyalar: dars tugaganidan 30 daqiqa o'tgach yoki ertasi kuni avtomatik yopiladi */
export async function closeExpiredSessions(now: Date = new Date()): Promise<number> {
  const active = await AttendanceSession.find({ status: "active" }).select("groupId date startTime").lean();
  if (active.length === 0) return 0;

  const groups = await Group.find({ _id: { $in: active.map((s) => s.groupId) } }).select("schedule").lean();
  const scheduleOf = new Map(groups.map((g) => [g._id.toString(), g.schedule]));
  const todayKey = toDateKey(now);

  let closed = 0;
  for (const s of active) {
    const dateKey = toDateKey(s.date);
    const schedule = scheduleOf.get(s.groupId.toString());
    const expiresAt = isValidSchedule(schedule)
      ? dateFromKey(dateKey, schedule.endTime).getTime() + CLOSE_GRACE_MS
      : new Date(s.startTime).getTime() + MAX_OPEN_MS;
    if (dateKey !== todayKey || now.getTime() > expiresAt) {
      if (await closeSession(s._id)) closed++;
    }
  }
  return closed;
}

/** Guruhning shu kundagi sessiyasi (bo'lsa) */
export function findSessionOnDay(groupId: string | mongoose.Types.ObjectId, dateKey: string) {
  return AttendanceSession.findOne({
    groupId,
    date: { $gte: dateFromKey(dateKey), $lt: dateFromKey(addDaysToKey(dateKey, 1)) },
  }).sort({ status: 1, createdAt: 1 });
}

/**
 * Sessiyani butunlay o'chiradi: har bir yozuv bergan/olgan coin qaytariladi, yozuvlar va sessiya o'chiriladi.
 * O'quvchilarga xabar yuborilmaydi.
 */
export async function deleteSessionWithCoins(sessionId: string | mongoose.Types.ObjectId): Promise<{ records: number; reverted: number } | null> {
  const session = await AttendanceSession.findById(sessionId);
  if (!session) return null;

  const records = await AttendanceRecord.find({ sessionId: session._id });
  let reverted = 0;
  for (const record of records) {
    const total = record.coinsAwarded ?? 0;
    const balance = record.balanceDelta ?? total;
    const moved = await moveCoins(record.studentId, -total, -balance);
    const amount = moved.dTotal || moved.dBalance;
    if (amount !== 0) {
      reverted++;
      await CoinLedger.create({
        studentId: record.studentId,
        amount,
        type: "adjustment",
        referenceId: session._id,
        description: "Davomat o'chirildi — coin qayta hisoblandi",
        balanceAfter: moved.totalAfter,
      });
    }
  }
  await AttendanceRecord.deleteMany({ sessionId: session._id });
  await AttendanceSession.deleteOne({ _id: session._id });
  return { records: records.length, reverted };
}

/**
 * Eski qoidada (qatnashganga belgilangan mukofot, jarimasiz) olingan davomatni joriy qoidaga o'tkazadi:
 * har bir yozuvning coini qayta hisoblanadi (masalan kelgan +10 → +5, kelmagan 0 → −5).
 * O'quvchilarga xabar yuborilmaydi; o'zgarish coin tarixida ko'rinadi.
 */
export async function convertSessionToCurrentRules(sessionId: string | mongoose.Types.ObjectId): Promise<{ changed: number } | null> {
  const session = await AttendanceSession.findOneAndUpdate(
    { _id: sessionId, coinRules: null, status: "closed" },
    { $set: { coinRules: ATTENDANCE_COINS, defaultCoinsReward: ATTENDANCE_COINS.present, finalizedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!session) return null;

  const records = await AttendanceRecord.find({ sessionId: session._id });
  let changed = 0;
  for (const record of records) {
    const amount = await settleRecordCoins(session, record, {
      silent: true,
      description: "Davomat yangi coin qoidasiga o'tkazildi",
    });
    if (amount !== 0) changed++;
  }
  return { changed };
}
