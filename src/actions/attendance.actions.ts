"use server";

import crypto from "crypto";
import QRCode from "qrcode";
import { connectToDatabase } from "@/lib/db/connect";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { AttendanceRecord, AttendanceStatus } from "@/lib/db/models/attendance-record.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { User, IUser } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireStudent, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { ActionResult } from "./auth.actions";

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
 * Mentor starts an attendance session for a group
 */
export async function startAttendanceSessionAction(
  groupId: string,
  coinsReward: number = 10
): Promise<ActionResult<{ sessionId: string }>> {
  const session = await requireMentor();
  await connectToDatabase();

  const group = await Group.findById(groupId);
  if (!group) {
    return { success: false, message: "Guruh topilmadi" };
  }

  // Close any previously active session for this group
  await AttendanceSession.updateMany(
    { groupId, status: "active" },
    { $set: { status: "closed", endTime: new Date() } }
  );

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
    defaultCoinsReward: coinsReward,
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

  // Fetch all students in group to know absent/total
  const totalStudents = await User.countDocuments({
    groupId: attSession.groupId,
    role: "student",
  });

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

  const cleanCode = params.code?.trim().toUpperCase();
  const cleanToken = params.token?.trim();

  if (!cleanCode && !cleanToken) {
    return {
      success: false,
      message: "Kod yoki QR belgi kiritilmadi.",
    };
  }

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
        { "previousTokens.code": cleanCode, "previousTokens.expiredAt": { $gt: now } },
      ],
    });
  } else if (cleanToken) {
    method = "qr";
    activeSession = await AttendanceSession.findOne({
      status: "active",
      $or: [
        { currentToken: cleanToken },
        { "previousTokens.token": cleanToken, "previousTokens.expiredAt": { $gt: now } },
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

  const coinsAwarded = activeSession.defaultCoinsReward || 10;

  // Create attendance record
  await AttendanceRecord.create({
    sessionId: activeSession._id,
    studentId: effectiveUserId,
    groupId: activeSession.groupId,
    status: "present",
    method,
    markedAt: now,
    coinsAwarded,
  });

  // Award coins to user
  const updatedUser = await User.findByIdAndUpdate(
    effectiveUserId,
    {
      $inc: { totalCoins: coinsAwarded, spendableBalance: coinsAwarded },
    },
    { new: true }
  );

  // Record into CoinLedger
  await CoinLedger.create({
    studentId: effectiveUserId,
    amount: coinsAwarded,
    type: "attendance",
    referenceId: activeSession._id,
    description: `Dars davomati uchun (${method === "qr" ? "QR kod" : "Kiritilgan kod"})`,
    balanceAfter: updatedUser?.totalCoins || coinsAwarded,
  });

  // Increment session present counter
  await AttendanceSession.findByIdAndUpdate(activeSession._id, {
    $inc: { "summary.totalPresent": 1 },
  });

  return {
    success: true,
    message: `Davomat belgilandi! Sizga +${coinsAwarded} coin berildi.`,
    data: {
      coinsEarned: coinsAwarded,
      markedAt: now,
    },
  };
}

/**
 * Mentor closes an attendance session
 */
export async function closeAttendanceSessionAction(
  sessionId: string
): Promise<ActionResult> {
  const session = await requireMentor();
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(sessionId);
  if (!attSession) {
    return { success: false, message: "Sessiya topilmadi" };
  }

  attSession.status = "closed";
  attSession.endTime = new Date();
  await attSession.save();

  // Find all students in group
  const allStudents = (await User.find({
    groupId: attSession.groupId,
    role: "student",
  }).lean()) as unknown as IUser[];

  // Find existing records
  const existingRecords = await AttendanceRecord.find({ sessionId }).lean();
  const existingStudentIds = new Set(
    existingRecords.map((r) => r.studentId.toString())
  );

  // Auto-mark absent for students who didn't check in
  const absentRecords = [];
  for (const st of allStudents) {
    if (!existingStudentIds.has(st._id.toString())) {
      absentRecords.push({
        sessionId: attSession._id,
        studentId: st._id,
        groupId: attSession.groupId,
        status: "absent",
        method: "manual",
        markedAt: new Date(),
        coinsAwarded: 0,
      });
    }
  }

  if (absentRecords.length > 0) {
    await AttendanceRecord.insertMany(absentRecords, { ordered: false });
  }

  // Update final summary
  const presentCount = await AttendanceRecord.countDocuments({
    sessionId,
    status: "present",
  });
  const lateCount = await AttendanceRecord.countDocuments({
    sessionId,
    status: "late",
  });
  const excusedCount = await AttendanceRecord.countDocuments({
    sessionId,
    status: "excused",
  });
  const absentCount = await AttendanceRecord.countDocuments({
    sessionId,
    status: "absent",
  });

  attSession.summary = {
    totalPresent: presentCount,
    totalLate: lateCount,
    totalExcused: excusedCount,
    totalAbsent: absentCount,
  };
  await attSession.save();

  await AuditLog.create({
    actorId: session.userId,
    action: "CLOSE_ATTENDANCE",
    details: {
      sessionId,
      summary: attSession.summary,
    },
  });

  return { success: true, message: "Davomat sessiyasi yakunlandi" };
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
  await connectToDatabase();

  const attSession = await AttendanceSession.findById(params.sessionId);
  if (!attSession) {
    return { success: false, message: "Sessiya topilmadi" };
  }

  let record = await AttendanceRecord.findOne({
    sessionId: params.sessionId,
    studentId: params.studentId,
  });

  const oldStatus = record?.status;
  const newStatus = params.status;

  if (!record) {
    record = new AttendanceRecord({
      sessionId: params.sessionId,
      studentId: params.studentId,
      groupId: attSession.groupId,
      status: newStatus,
      method: "manual",
      markedAt: new Date(),
      coinsAwarded: newStatus === "present" ? attSession.defaultCoinsReward : 0,
      notes: params.notes,
    });
    await record.save();

    if (newStatus === "present") {
      const reward = attSession.defaultCoinsReward || 10;
      await User.findByIdAndUpdate(params.studentId, {
        $inc: { totalCoins: reward, spendableBalance: reward },
      });
      await CoinLedger.create({
        studentId: params.studentId,
        amount: reward,
        type: "attendance",
        referenceId: attSession._id,
        description: "Mentor tomonidan davomat belgilandi (+10 coin)",
      });
    }
  } else {
    // If transitioning from absent/excused to present -> award coins
    if (oldStatus !== "present" && newStatus === "present") {
      const reward = attSession.defaultCoinsReward || 10;
      record.coinsAwarded = reward;
      await User.findByIdAndUpdate(params.studentId, {
        $inc: { totalCoins: reward, spendableBalance: reward },
      });
      await CoinLedger.create({
        studentId: params.studentId,
        amount: reward,
        type: "attendance",
        referenceId: attSession._id,
        description: "Mentor davomatni 'Kelgan' deb yangiladi (+10 coin)",
      });
    }
    // If transitioning from present to absent/excused -> revoke coins
    else if (oldStatus === "present" && newStatus !== "present") {
      const revoked = record.coinsAwarded || 10;
      record.coinsAwarded = 0;
      await User.findByIdAndUpdate(params.studentId, {
        $inc: { totalCoins: -revoked, spendableBalance: -revoked },
      });
      await CoinLedger.create({
        studentId: params.studentId,
        amount: -revoked,
        type: "adjustment",
        referenceId: attSession._id,
        description: "Mentor davomatni bekor qildi (-10 coin)",
      });
    }

    record.status = newStatus;
    if (params.notes !== undefined) record.notes = params.notes;
    await record.save();
  }

  await AuditLog.create({
    actorId: session.userId,
    action: "MANUAL_ATTENDANCE",
    targetUserId: params.studentId,
    details: {
      sessionId: params.sessionId,
      oldStatus,
      newStatus,
      notes: params.notes,
    },
  });

  return { success: true, message: "Davomat o'zgartirildi" };
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

  // Fallback: if no group session, find any active session currently open
  if (!activeSession) {
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
  const dateStr = new Date(session.date).toLocaleDateString("uz-UZ");

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
    const timeStr = r.markedAt ? new Date(r.markedAt).toLocaleTimeString("uz-UZ") : "—";

    csv += `${idx + 1};"${name}";"@${login}";"${groupName}";"${dateStr}";"${statusText}";"${methodText}";"${timeStr}";${r.coinsAwarded}\n`;
  });

  return csv;
}
