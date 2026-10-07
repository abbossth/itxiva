"use server";

import crypto from "crypto";
import QRCode from "qrcode";
import { connectToDatabase } from "@/lib/db/connect";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { AttendanceRecord, AttendanceStatus } from "@/lib/db/models/attendance-record.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireStudent, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { ActionResult } from "./auth.actions";
import { formatDateUz, formatDateTimeUz } from "@/lib/utils";
import {
  dateFromKey,
  toDateKey,
  addDaysToKey,
  isValidSchedule,
  isLessonNow,
  getNextLesson,
  getTashkentParts,
} from "@/lib/schedule";
import mongoose from "mongoose";
import { ATTENDANCE_COINS, coinRulesOf, type AttendanceCoinRules } from "@/lib/attendance-status";
import {
  applyAttendanceStatus,
  closeExpiredSessions,
  closeSession,
  convertSessionToCurrentRules,
  deleteSessionWithCoins,
  finalizeSession,
  findSessionOnDay,
  isSessionFinalized,
  recomputeSummary,
  settleRecordCoins,
} from "@/lib/attendance/core";

/** Darsda qatnashgan deb hisoblanadigan holatlar */
const ATTENDED: AttendanceStatus[] = ["present", "late"];
const STATUS_VALUES: AttendanceStatus[] = ["present", "late", "excused", "absent"];

export interface ProjectorSessionData {
  _id: string;
  groupId: string;
  mentorId: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  status: "active" | "closed";
  currentCode: string;
  currentToken: string;
  codeRotatedAt: string;
  rotateIntervalSeconds: number;
  defaultCoinsReward: number;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return result;
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Mentor guruh darsi uchun davomat sessiyasini ochadi.
 * Faqat jadvaldagi dars vaqtida (boshlanishidan 15 daqiqa oldin → tugashigacha) va bir darsga bir marta.
 */
export async function startAttendanceSessionAction(
  groupId: string
): Promise<ActionResult<{ sessionId: string }>> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(groupId)) {
    return { success: false, message: "Guruh topilmadi" };
  }
  await connectToDatabase();

  const group = await Group.findById(groupId);
  if (!group) {
    return { success: false, message: "Guruh topilmadi" };
  }

  await closeExpiredSessions();

  // Bugun shu guruhda davomat bo'lsa, ikkinchisi ochilmaydi
  const existing = await findSessionOnDay(groupId, toDateKey());
  if (existing) {
    if (existing.status === "active") {
      return { success: true, data: { sessionId: existing._id.toString() } };
    }
    return {
      success: false,
      message: "Bugungi dars davomati allaqachon olingan. O'zgartirish kerak bo'lsa, o'sha darsni oching.",
      data: { sessionId: existing._id.toString() },
    };
  }

  if (!isValidSchedule(group.schedule)) {
    return { success: false, message: "Guruhga dars jadvali belgilanmagan. Avval jadvalni kiriting." };
  }
  if (!isLessonNow(group.schedule)) {
    const next = getNextLesson(group.schedule);
    return {
      success: false,
      message: `Davomat faqat dars vaqtida ochiladi.${next ? ` Keyingi dars: ${next.label}.` : ""}`,
    };
  }

  const initialCode = generateCode();
  const initialToken = generateToken();

  const newSession = await AttendanceSession.create({
    groupId,
    mentorId: session.userId,
    date: new Date(),
    startTime: new Date(),
    status: "active",
    currentCode: initialCode,
    currentToken: initialToken,
    codeRotatedAt: new Date(),
    rotateIntervalSeconds: 180,
    previousTokens: [],
    defaultCoinsReward: ATTENDANCE_COINS.present,
    coinRules: ATTENDANCE_COINS,
    summary: { totalPresent: 0, totalLate: 0, totalExcused: 0, totalAbsent: 0 },
  });

  await AuditLog.create({
    actorId: session.userId,
    action: "START_ATTENDANCE",
    details: {
      groupId,
      groupName: group.name,
      sessionId: newSession._id.toString(),
      code: initialCode,
    },
  });

  return {
    success: true,
    data: { sessionId: newSession._id.toString() },
  };
}

/**
 * Rotate attendance code (called every 180s or on demand)
 */
export async function rotateAttendanceSessionAction(
  sessionId: string
): Promise<ActionResult<{ currentCode: string; currentToken: string; codeRotatedAt: Date }>> {
  await requireMentor();
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(sessionId);
  if (!attSession || attSession.status !== "active") {
    return { success: false, message: "Faol sessiya topilmadi" };
  }

  // 20 seconds grace period for previous token & code
  const gracePeriodExpiry = new Date(Date.now() + 20_000);

  const prevList = [
    {
      token: attSession.currentToken,
      code: attSession.currentCode,
      expiredAt: gracePeriodExpiry,
    },
    ...(attSession.previousTokens || []).filter(
      (p) => new Date(p.expiredAt) > new Date()
    ),
  ].slice(0, 5);

  const newCode = generateCode();
  const newToken = generateToken();
  const now = new Date();

  attSession.previousTokens = prevList;
  attSession.currentCode = newCode;
  attSession.currentToken = newToken;
  attSession.codeRotatedAt = now;
  await attSession.save();

  return {
    success: true,
    data: {
      currentCode: newCode,
      currentToken: newToken,
      codeRotatedAt: now,
    },
  };
}

/**
 * Projector view data for mentor screen
 */
export async function getAttendanceSessionForProjector(sessionId: string) {
  await requireMentor();
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(sessionId).lean();
  if (!attSession) return null;

  const group = await Group.findById(attSession.groupId).lean();

  // Calculate elapsed time
  const elapsedSeconds = Math.floor(
    (Date.now() - new Date(attSession.codeRotatedAt).getTime()) / 1000
  );

  // Fetch attendees
  const records = await AttendanceRecord.find({ sessionId })
    .sort({ markedAt: -1 })
    .populate("studentId", "fullName login")
    .lean();

  // Guruhning barcha o'quvchilari: jami soni va hali belgilanmaganlar (kelmaganlar) ro'yxati uchun
  const students = await User.find({ groupId: attSession.groupId, role: "student" })
    .select("fullName login")
    .lean();
  const totalStudents = students.length;
  const markedIds = new Set(
    records.map((r) => (r.studentId as unknown as { _id: mongoose.Types.ObjectId } | null)?._id.toString())
  );
  const absentStudents = students
    .filter((st) => !markedIds.has(st._id.toString()))
    .map((st) => ({ _id: st._id.toString(), fullName: st.fullName, login: st.login }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://itxiva.uz";
  const deepLink = `${appUrl}/a/${attSession.currentToken}`;

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(deepLink, {
      width: 420,
      margin: 2,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    });
  } catch (err) {
    console.error("QR Code generation error:", err);
  }

  const secondsRemaining = Math.max(
    0,
    attSession.rotateIntervalSeconds - elapsedSeconds
  );

  return {
    session: JSON.parse(JSON.stringify(attSession)) as ProjectorSessionData,
    group: group ? { name: group.name, grade: group.grade } : null,
    totalStudents,
    absentStudents,
    records: JSON.parse(JSON.stringify(records)),
    qrDataUrl,
    deepLink,
    secondsRemaining,
  };
}

/**
 * Student marks attendance via 6-digit code OR scanned QR token
 */
export async function markAttendanceAction(params: {
  token?: string;
  code?: string;
}): Promise<ActionResult<{ coinsEarned: number; markedAt: Date }>> {
  const sessionUser = await requireStudent();
  await connectToDatabase();

  // Rate limit: 10 attempts per minute per student
  const rateKey = `att_mark_${sessionUser.userId}`;
  const rate = checkRateLimit(rateKey, 10, 60_000);
  if (!rate.allowed) {
    return {
      success: false,
      message: `Juda ko'p urinish. Iltimos, ${rate.resetInSeconds} soniyadan so'ng urinib ko'ring.`,
    };
  }

  // Find user in database by ID or login
  let dbUser = await User.findById(sessionUser.userId);
  if (!dbUser && sessionUser.login) {
    dbUser = await User.findOne({ login: sessionUser.login.toLowerCase() });
  }

  const effectiveUserId = dbUser?._id ? dbUser._id.toString() : sessionUser.userId;

  const cleanCode = typeof params?.code === "string" ? params.code.trim().toUpperCase() : undefined;
  const cleanToken = typeof params?.token === "string" ? params.token.trim() : undefined;

  if (!cleanCode && !cleanToken) {
    return {
      success: false,
      message: "Kod yoki QR belgi kiritilmadi.",
    };
  }

  // Mentor yopishni unutgan eski sessiyaga belgilab bo'lmaydi
  await closeExpiredSessions();

  const now = new Date();
  let activeSession = null;
  let method: "qr" | "code" = "code";

  // 1. Try finding active session by current code / token OR grace period tokens
  if (cleanCode) {
    method = "code";
    activeSession = await AttendanceSession.findOne({
      status: "active",
      $or: [
        { currentCode: cleanCode },
        { previousTokens: { $elemMatch: { code: cleanCode, expiredAt: { $gt: now } } } },
      ],
    });
  } else if (cleanToken) {
    method = "qr";
    activeSession = await AttendanceSession.findOne({
      status: "active",
      $or: [
        { currentToken: cleanToken },
        { previousTokens: { $elemMatch: { token: cleanToken, expiredAt: { $gt: now } } } },
      ],
    });
  }

  // 2. Fallback: check if student group's active session matches
  if (!activeSession && dbUser?.groupId) {
    const groupSession = await AttendanceSession.findOne({
      groupId: dbUser.groupId,
      status: "active",
    });
    if (groupSession) {
      if (cleanCode) {
        if (
          groupSession.currentCode === cleanCode ||
          (groupSession.previousTokens || []).some(
            (p) => p.code === cleanCode && new Date(p.expiredAt) > now
          )
        ) {
          activeSession = groupSession;
          method = "code";
        }
      } else if (cleanToken) {
        if (
          groupSession.currentToken === cleanToken ||
          (groupSession.previousTokens || []).some(
            (p) => p.token === cleanToken && new Date(p.expiredAt) > now
          )
        ) {
          activeSession = groupSession;
          method = "qr";
        }
      }
    }
  }

  if (!activeSession) {
    return {
      success: false,
      message: "Kiritilgan kod yoki QR belgi eskirgan. Proyektordagi yangi kodni kiriting.",
    };
  }

  // O'quvchi faqat o'z guruhining darsida davomatdan o'ta oladi (jurnal aralashib ketmasligi uchun).
  // Guruhi belgilanmagan o'quvchi istisno — u shu sessiya guruhiga biriktiriladi.
  if (dbUser?.groupId && dbUser.groupId.toString() !== activeSession.groupId.toString()) {
    return {
      success: false,
      message: "Bu kod boshqa guruh darsiga tegishli. O'z guruhingiz darsidagi kodni kiriting.",
    };
  }

  // Check if student already checked in
  const existingRecord = await AttendanceRecord.findOne({
    sessionId: activeSession._id,
    studentId: effectiveUserId,
  });

  if (existingRecord) {
    return {
      success: false,
      message: "Siz ushbu dars uchun allaqachon davomatdan o'tgansiz!",
    };
  }

  // If student didn't have a group set in DB, link them to this group
  if (dbUser && !dbUser.groupId) {
    dbUser.groupId = activeSession.groupId;
    await dbUser.save();
  }

  // Create attendance record. Unique (sessionId, studentId) indeksi parallel so'rovlarda
  // ikki marta coin berilishining oldini oladi.
  let record;
  try {
    record = await AttendanceRecord.create({
      sessionId: activeSession._id,
      studentId: effectiveUserId,
      groupId: activeSession.groupId,
      status: "present",
      method,
      markedAt: now,
      coinsAwarded: 0,
      balanceDelta: 0,
    });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      return {
        success: false,
        message: "Siz ushbu dars uchun allaqachon davomatdan o'tgansiz!",
      };
    }
    throw err;
  }

  const coinsAwarded = await settleRecordCoins(activeSession, record, {
    silent: true,
    description: `Dars davomati uchun (${method === "qr" ? "QR kod" : "Kiritilgan kod"})`,
  });

  // Increment session present counter
  await AttendanceSession.findByIdAndUpdate(activeSession._id, {
    $inc: { "summary.totalPresent": 1 },
  });

  return {
    success: true,
    message: coinsAwarded > 0 ? `Davomat belgilandi! Sizga +${coinsAwarded} coin berildi.` : "Davomat belgilandi!",
    data: {
      coinsEarned: coinsAwarded,
      markedAt: now,
    },
  };
}

/**
 * Mentor davomat sessiyasini yopadi: belgilanmaganlar "kelmagan" bo'ladi va jarima qo'llanadi
 */
export async function closeAttendanceSessionAction(
  sessionId: string
): Promise<ActionResult> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(sessionId)) {
    return { success: false, message: "Sessiya topilmadi" };
  }
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(sessionId).select("status").lean();
  if (!attSession) {
    return { success: false, message: "Sessiya topilmadi" };
  }
  if (attSession.status === "active") {
    await closeSession(sessionId, session.userId);
  }

  return { success: true, message: "Davomat sessiyasi yakunlandi" };
}

/**
 * Qo'lda kiritilgan darsni yakunlaydi: "kelmagan" bo'lib qolganlarga jarima qo'llanadi
 */
export async function finalizeAttendanceSessionAction(sessionId: string): Promise<ActionResult> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(sessionId)) {
    return { success: false, message: "Sessiya topilmadi" };
  }
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(sessionId).select("status coinRules finalizedAt").lean();
  if (!attSession) return { success: false, message: "Sessiya topilmadi" };
  if (attSession.status !== "closed") {
    return { success: false, message: "Avval davomat sessiyasini yoping" };
  }
  if (isSessionFinalized(attSession)) {
    return { success: true, message: "Davomat allaqachon yakunlangan" };
  }

  await finalizeSession(sessionId);
  await AuditLog.create({
    actorId: session.userId,
    action: "FINALIZE_ATTENDANCE",
    details: { sessionId },
  });
  return { success: true, message: "Davomat yakunlandi" };
}

/**
 * Davomat sessiyasini butunlay o'chiradi (masalan, dublikat): berilgan va olingan coinlar qaytariladi
 */
export async function deleteAttendanceSessionAction(sessionId: string): Promise<ActionResult<{ groupId: string }>> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(sessionId)) {
    return { success: false, message: "Sessiya topilmadi" };
  }
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(sessionId).select("groupId date status").lean();
  if (!attSession) return { success: false, message: "Sessiya topilmadi" };

  const result = await deleteSessionWithCoins(sessionId);
  await AuditLog.create({
    actorId: session.userId,
    action: "DELETE_ATTENDANCE",
    details: {
      sessionId,
      groupId: attSession.groupId.toString(),
      dateKey: toDateKey(attSession.date),
      records: result?.records ?? 0,
      coinsReverted: result?.reverted ?? 0,
    },
  });

  return {
    success: true,
    message: "Davomat o'chirildi, coinlar qayta hisoblandi",
    data: { groupId: attSession.groupId.toString() },
  };
}

/**
 * Eski qoidada olingan davomatni joriy coin qoidasiga o'tkazadi (coinlar qayta hisoblanadi)
 */
export async function convertAttendanceRulesAction(sessionId: string): Promise<ActionResult<{ changed: number }>> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(sessionId)) {
    return { success: false, message: "Sessiya topilmadi" };
  }
  await connectToDatabase();

  const result = await convertSessionToCurrentRules(sessionId);
  if (!result) {
    return { success: false, message: "Bu dars allaqachon joriy qoidada yoki hali yopilmagan" };
  }
  await recomputeSummary(sessionId);
  await AuditLog.create({
    actorId: session.userId,
    action: "CONVERT_ATTENDANCE_RULES",
    details: { sessionId, changed: result.changed },
  });
  return {
    success: true,
    message: `Yangi qoidaga o'tkazildi: ${result.changed} ta o'quvchining coini qayta hisoblandi`,
    data: result,
  };
}

/**
 * Mentor manually updates a student's attendance record
 */
export async function manualUpdateAttendanceAction(params: {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  notes?: string;
}): Promise<ActionResult> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(params.sessionId) || !mongoose.isValidObjectId(params.studentId)) {
    return { success: false, message: "Sessiya yoki o'quvchi topilmadi" };
  }
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(params.sessionId);
  if (!attSession) {
    return { success: false, message: "Sessiya topilmadi" };
  }

  if (!STATUS_VALUES.includes(params.status)) {
    return { success: false, message: "Noto'g'ri holat" };
  }
  const student = await User.findOne({ _id: params.studentId, role: "student" }).select("_id").lean();
  if (!student) {
    return { success: false, message: "O'quvchi topilmadi" };
  }

  const notes = typeof params.notes === "string" ? params.notes.trim().slice(0, 300) : undefined;
  const { oldStatus } = await applyAttendanceStatus(attSession, params.studentId, params.status, { notes });

  await recomputeSummary(attSession._id);

  await AuditLog.create({
    actorId: session.userId,
    action: "MANUAL_ATTENDANCE",
    targetUserId: params.studentId,
    details: {
      sessionId: params.sessionId,
      oldStatus,
      newStatus: params.status,
      notes,
    },
  });

  return { success: true, message: "Davomat o'zgartirildi" };
}

export interface SessionRosterRow {
  studentId: string;
  fullName: string;
  login: string;
  status: AttendanceStatus | null;
  method: "qr" | "code" | "manual" | null;
  markedAt: string | null;
  coinsAwarded: number;
  notes: string;
}

export interface SessionDetail {
  session: {
    _id: string;
    date: string;
    startTime: string;
    endTime: string | null;
    status: "active" | "closed";
    defaultCoinsReward: number;
    /** Holat -> coin */
    coinRules: AttendanceCoinRules;
    /** false — kelmaganlarga jarima hali qo'llanmagan (qo'lda kiritilgan, yakunlanmagan dars) */
    isFinalized: boolean;
    isManual: boolean;
    /** Eski coin qoidasida olingan dars — mentor uni joriy qoidaga o'tkazishi mumkin */
    isLegacyRules: boolean;
  };
  group: { _id: string; name: string; grade: number } | null;
  roster: SessionRosterRow[];
}

/**
 * Bitta dars davomati: guruhning BARCHA o'quvchilari holati bilan (kelmaganlar ham)
 */
export async function getAttendanceSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  await requireMentor();
  if (!mongoose.isValidObjectId(sessionId)) return null;
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(sessionId).lean();
  if (!attSession) return null;

  const [group, students, records] = await Promise.all([
    Group.findById(attSession.groupId).select("name grade").lean(),
    User.find({ groupId: attSession.groupId, role: "student" }).select("fullName login").lean(),
    AttendanceRecord.find({ sessionId }).populate("studentId", "fullName login").lean(),
  ]);

  const rows = new Map<string, SessionRosterRow>();
  for (const st of students) {
    rows.set(st._id.toString(), {
      studentId: st._id.toString(),
      fullName: st.fullName,
      login: st.login,
      status: null,
      method: null,
      markedAt: null,
      coinsAwarded: 0,
      notes: "",
    });
  }
  for (const r of records) {
    // Keyin boshqa guruhga ko'chirilgan o'quvchining eski yozuvi ham ko'rinadi
    const st = r.studentId as unknown as { _id: mongoose.Types.ObjectId; fullName: string; login: string } | null;
    if (!st) continue;
    rows.set(st._id.toString(), {
      studentId: st._id.toString(),
      fullName: st.fullName,
      login: st.login,
      status: r.status,
      method: r.method,
      markedAt: r.markedAt ? new Date(r.markedAt).toISOString() : null,
      coinsAwarded: r.coinsAwarded ?? 0,
      notes: r.notes ?? "",
    });
  }

  return {
    session: {
      _id: attSession._id.toString(),
      date: new Date(attSession.date).toISOString(),
      startTime: new Date(attSession.startTime).toISOString(),
      endTime: attSession.endTime ? new Date(attSession.endTime).toISOString() : null,
      status: attSession.status,
      defaultCoinsReward: attSession.defaultCoinsReward,
      coinRules: coinRulesOf(attSession),
      isFinalized: isSessionFinalized(attSession),
      isManual: Boolean(attSession.isManual),
      isLegacyRules: !attSession.coinRules,
    },
    group: group ? { _id: group._id.toString(), name: group.name, grade: group.grade } : null,
    roster: [...rows.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

export interface AttendanceJournal {
  group: { _id: string; name: string };
  /** isDuplicate — shu kunda bittadan ortiq davomat bor (ortiqchasini o'chirish kerak) */
  sessions: { _id: string; dateKey: string; status: "active" | "closed"; isDuplicate: boolean }[];
  students: {
    studentId: string;
    fullName: string;
    /** sessiya ID -> holat */
    marks: Record<string, AttendanceStatus>;
    attended: number;
    total: number;
    percent: number | null;
  }[];
}

/**
 * Davomat jurnali: o'quvchilar x darslar matritsasi (dateKey'lar Toshkent vaqti bo'yicha, "YYYY-MM-DD")
 */
export async function getAttendanceJournal(params: {
  groupId: string;
  from: string;
  to: string;
}): Promise<AttendanceJournal | null> {
  await requireMentor();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!mongoose.isValidObjectId(params.groupId) || !dateRe.test(params.from) || !dateRe.test(params.to)) {
    return null;
  }
  await connectToDatabase();

  const group = await Group.findById(params.groupId).select("name").lean();
  if (!group) return null;

  const sessions = await AttendanceSession.find({
    groupId: params.groupId,
    date: { $gte: dateFromKey(params.from), $lt: dateFromKey(addDaysToKey(params.to, 1)) },
  })
    .select("date status")
    .sort({ date: 1 })
    .lean();

  const [students, records] = await Promise.all([
    User.find({ groupId: params.groupId, role: "student" }).select("fullName").sort({ fullName: 1 }).lean(),
    AttendanceRecord.find({ sessionId: { $in: sessions.map((s) => s._id) } })
      .select("sessionId studentId status")
      .lean(),
  ]);

  const marksByStudent = new Map<string, Record<string, AttendanceStatus>>();
  for (const r of records) {
    const key = r.studentId.toString();
    if (!marksByStudent.has(key)) marksByStudent.set(key, {});
    marksByStudent.get(key)![r.sessionId.toString()] = r.status;
  }
  const closedIds = sessions.filter((s) => s.status === "closed").map((s) => s._id.toString());
  const perDay = new Map<string, number>();
  for (const s of sessions) perDay.set(toDateKey(s.date), (perDay.get(toDateKey(s.date)) ?? 0) + 1);

  return {
    group: { _id: group._id.toString(), name: group.name },
    sessions: sessions.map((s) => ({
      _id: s._id.toString(),
      dateKey: toDateKey(s.date),
      status: s.status,
      isDuplicate: (perDay.get(toDateKey(s.date)) ?? 0) > 1,
    })),
    students: students.map((st) => {
      const marks = marksByStudent.get(st._id.toString()) ?? {};
      // Foiz faqat yakunlangan darslar bo'yicha; sababli qoldirilgan dars hisobga olinmaydi
      const counted = closedIds.filter((id) => marks[id] !== "excused");
      const attended = counted.filter((id) => marks[id] && ATTENDED.includes(marks[id])).length;
      return {
        studentId: st._id.toString(),
        fullName: st.fullName,
        marks,
        attended,
        total: counted.length,
        percent: counted.length > 0 ? Math.round((attended / counted.length) * 100) : null,
      };
    }),
  };
}

/**
 * QR ochilmagan (yoki o'tib ketgan) dars uchun qo'lda davomat sessiyasi.
 * Sessiya darhol yopiq holda yaratiladi, hamma "kelmagan" — mentor kelganlarni belgilab chiqadi.
 */
export async function createManualSessionAction(params: {
  groupId: string;
  dateKey: string;
}): Promise<ActionResult<{ sessionId: string }>> {
  const mentor = await requireMentor();
  if (!mongoose.isValidObjectId(params.groupId) || !/^\d{4}-\d{2}-\d{2}$/.test(params.dateKey)) {
    return { success: false, message: "Guruh yoki sana noto'g'ri" };
  }
  const todayKey = toDateKey();
  if (params.dateKey > todayKey) {
    return { success: false, message: "Kelajakdagi sana uchun davomat ochib bo'lmaydi" };
  }
  await connectToDatabase();

  const group = await Group.findById(params.groupId).lean();
  if (!group) return { success: false, message: "Guruh topilmadi" };

  const duplicate = await findSessionOnDay(params.groupId, params.dateKey).select("_id").lean();
  if (duplicate) {
    return {
      success: true,
      message: "Bu kun uchun davomat allaqachon mavjud",
      data: { sessionId: duplicate._id.toString() },
    };
  }

  if (!isValidSchedule(group.schedule)) {
    return { success: false, message: "Guruhga dars jadvali belgilanmagan. Avval jadvalni kiriting." };
  }
  // Davomat faqat jadvaldagi dars kuniga kiritiladi
  const dayStart = dateFromKey(params.dateKey, group.schedule.startTime);
  if (!group.schedule.days.includes(getTashkentParts(dayStart).weekday)) {
    return { success: false, message: "Bu kunda guruhning darsi yo'q. Jadvaldagi dars kunini tanlang." };
  }
  if (params.dateKey === todayKey && Date.now() < dayStart.getTime() - 15 * 60_000) {
    return { success: false, message: `Bugungi dars hali boshlanmagan (${group.schedule.startTime}).` };
  }

  const schedule = isValidSchedule(group.schedule) ? group.schedule : null;
  const start = dateFromKey(params.dateKey, schedule?.startTime ?? "12:00");
  const end = dateFromKey(params.dateKey, schedule?.endTime ?? "13:30");

  const created = await AttendanceSession.create({
    groupId: params.groupId,
    mentorId: mentor.userId,
    date: start,
    startTime: start,
    endTime: end,
    status: "closed",
    currentCode: generateCode(),
    currentToken: generateToken(),
    codeRotatedAt: start,
    previousTokens: [],
    defaultCoinsReward: ATTENDANCE_COINS.present,
    coinRules: ATTENDANCE_COINS,
    isManual: true,
    // Kelmaganlarga jarima mentor belgilab bo'lib, "Yakunlash"ni bosganda qo'llanadi
    finalizedAt: null,
  });

  const students = await User.find({ groupId: params.groupId, role: "student" }).select("_id").lean();
  if (students.length > 0) {
    await AttendanceRecord.insertMany(
      students.map((st) => ({
        sessionId: created._id,
        studentId: st._id,
        groupId: params.groupId,
        status: "absent",
        method: "manual",
        markedAt: start,
        coinsAwarded: 0,
        balanceDelta: 0,
      }))
    );
  }
  await recomputeSummary(created._id);

  await AuditLog.create({
    actorId: mentor.userId,
    action: "MANUAL_ATTENDANCE_SESSION",
    details: { groupId: params.groupId, groupName: group.name, dateKey: params.dateKey, sessionId: created._id.toString() },
  });

  return { success: true, data: { sessionId: created._id.toString() } };
}

export interface GroupsAttendanceOverview {
  /** Ayni damda ochiq sessiyalar */
  active: { _id: string; groupId: string; groupName: string; startTime: string; present: number }[];
  /** guruh ID -> bugungi sessiya (bo'lsa) */
  today: Record<string, { _id: string; status: "active" | "closed" }>;
  /** guruh ID -> joriy oydagi davomat foizi (yakunlangan darslar bo'yicha; hali dars bo'lmasa null) */
  monthPercent: Record<string, number | null>;
}

/**
 * Guruhlar sahifasi uchun davomat xulosasi: ochiq sessiyalar, bugungi darslar holati va oylik foiz
 */
export async function getGroupsAttendanceOverview(): Promise<GroupsAttendanceOverview> {
  await requireMentor();
  await connectToDatabase();

  await closeExpiredSessions();

  const todayKey = toDateKey();
  const monthStart = dateFromKey(`${todayKey.slice(0, 7)}-01`);
  const sessions = await AttendanceSession.find({
    $or: [{ status: "active" }, { date: { $gte: monthStart, $lt: dateFromKey(addDaysToKey(todayKey, 1)) } }],
  })
    .select("groupId date startTime status summary")
    .sort({ date: -1 })
    .populate("groupId", "name")
    .lean();

  const overview: GroupsAttendanceOverview = { active: [], today: {}, monthPercent: {} };
  const totals = new Map<string, { attended: number; counted: number }>();

  for (const s of sessions) {
    const group = s.groupId as unknown as { _id: mongoose.Types.ObjectId; name: string } | null;
    if (!group) continue;
    const groupId = group._id.toString();
    const id = s._id.toString();

    if (s.status === "active") {
      overview.active.push({
        _id: id,
        groupId,
        groupName: group.name,
        startTime: new Date(s.startTime).toISOString(),
        present: s.summary?.totalPresent ?? 0,
      });
    }
    if (toDateKey(s.date) === todayKey && (!overview.today[groupId] || s.status === "active")) {
      overview.today[groupId] = { _id: id, status: s.status };
    }
    // Foiz qoidasi jurnal bilan bir xil: faqat yakunlangan darslar, sababli qoldirilgani hisobga olinmaydi
    if (s.status === "closed" && new Date(s.date).getTime() >= monthStart.getTime()) {
      const attended = (s.summary?.totalPresent ?? 0) + (s.summary?.totalLate ?? 0);
      const t = totals.get(groupId) ?? { attended: 0, counted: 0 };
      t.attended += attended;
      t.counted += attended + (s.summary?.totalAbsent ?? 0);
      totals.set(groupId, t);
    }
  }
  for (const [groupId, t] of totals) {
    overview.monthPercent[groupId] = t.counted > 0 ? Math.round((t.attended / t.counted) * 100) : null;
  }
  return overview;
}

/**
 * Get all attendance sessions for mentor dashboard
 */
export async function getAttendanceSessionsForMentor(groupId?: string) {
  await requireMentor();
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  if (groupId) filter.groupId = groupId;

  const sessions = await AttendanceSession.find(filter)
    .sort({ createdAt: -1 })
    .populate("groupId", "name grade")
    .populate("mentorId", "fullName")
    .lean();

  return JSON.parse(JSON.stringify(sessions));
}

/**
 * Get student's personal attendance history
 */
export async function getStudentAttendanceHistory() {
  const user = await requireStudent();
  await connectToDatabase();

  const records = await AttendanceRecord.find({ studentId: user.userId })
    .sort({ markedAt: -1 })
    .populate({
      path: "sessionId",
      select: "date status defaultCoinsReward",
    })
    .populate("groupId", "name grade")
    .lean();

  return JSON.parse(JSON.stringify(records));
}

/**
 * Get active attendance session for student's group or school-wide active session
 */
export async function getActiveAttendanceSessionForStudent() {
  const user = await requireAuth();
  if (user.role !== "student") return null;

  await connectToDatabase();

  let dbUser = await User.findById(user.userId).lean();
  if (!dbUser && user.login) {
    dbUser = await User.findOne({ login: user.login.toLowerCase() }).lean();
  }

  const effectiveUserId = dbUser?._id ? dbUser._id.toString() : user.userId;
  const targetGroupId = dbUser?.groupId || user.groupId;

  let activeSession = null;
  if (targetGroupId) {
    activeSession = await AttendanceSession.findOne({
      groupId: targetGroupId,
      status: "active",
    }).lean();
  }

  // Guruhi belgilanmagan o'quvchiga istalgan faol sessiya ko'rsatiladi (u shu guruhga biriktiriladi)
  if (!activeSession && !targetGroupId) {
    activeSession = await AttendanceSession.findOne({
      status: "active",
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!activeSession) return null;

  const hasMarked = await AttendanceRecord.exists({
    sessionId: activeSession._id,
    studentId: effectiveUserId,
  });

  const group = await Group.findById(activeSession.groupId).select("name grade").lean();

  return {
    sessionId: activeSession._id.toString(),
    groupName: group?.name || "Dars",
    rotateIntervalSeconds: activeSession.rotateIntervalSeconds,
    defaultCoinsReward: activeSession.defaultCoinsReward,
    hasMarked: Boolean(hasMarked),
  };
}

/**
 * Export session attendance to CSV
 */
export async function exportAttendanceCsvAction(sessionId: string): Promise<string> {
  await requireMentor();
  await connectToDatabase();

  const session = await AttendanceSession.findById(sessionId).populate("groupId", "name grade").lean();
  if (!session) throw new Error("Sessiya topilmadi");

  const records = await AttendanceRecord.find({ sessionId })
    .populate("studentId", "fullName login")
    .sort({ "studentId.fullName": 1 })
    .lean();

  const groupName = (session.groupId as unknown as { name?: string })?.name || "Guruh";
  const dateStr = formatDateUz(session.date);

  let csv = `\uFEFF#;FIO;Login;Guruh;Sana;Holat;Usul;Vaqt;Coinlar\n`;

  records.forEach((r, idx) => {
    const student = r.studentId as unknown as { fullName?: string; login?: string };
    const name = student?.fullName || "—";
    const login = student?.login || "—";
    const statusText =
      r.status === "present"
        ? "Kelgan"
        : r.status === "late"
        ? "Kechikkan"
        : r.status === "excused"
        ? "Sababli"
        : "Kelmagan";
    const methodText = r.method === "qr" ? "QR Kod" : r.method === "code" ? "Kod" : "Qo'lda";
    const timeStr = r.markedAt ? formatDateTimeUz(r.markedAt) : "—";

    csv += `${idx + 1};"${name}";"@${login}";"${groupName}";"${dateStr}";"${statusText}";"${methodText}";"${timeStr}";${r.coinsAwarded}\n`;
  });

  return csv;
}
