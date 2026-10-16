"use server";

import { groupShortName } from "@/lib/group-name";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Order } from "@/lib/db/models/order.model";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { AttendanceRecord } from "@/lib/db/models/attendance-record.model";
import { HomeworkSubmission, HomeworkStatus } from "@/lib/db/models/homework-submission.model";
import { requireMentor, requireStudent } from "@/lib/auth/guards";
import { formatSchedule, getNextLesson, hasLessonOn } from "@/lib/schedule";
import { getAppSettings } from "@/lib/settings";
import { CoinLedger, type CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { Product } from "@/lib/db/models/product.model";
import { addDaysToKey, toDateKey } from "@/lib/schedule";
import type { HomeworkState } from "@/lib/homework-status";

export interface StudentDashboard {
  firstName: string;
  groupName: string | null;
  nextLesson: { label: string; isNow: boolean } | null;
  attendanceOpen: boolean;
  balance: number;
  totalCoins: number;
  rank: { position: number; total: number } | null;
  homework: {
    todo: { lessonId: string; title: string; dueAt: string | null; state: HomeworkState }[];
    todoCount: number;
    waitingCount: number;
    gradedCount: number;
  };
  recentLessons: { _id: string; title: string; order: number; quarter: number; date: string | null }[];
  ordersToConfirm: number;
}

/** O'quvchi bosh sahifasi: hamma so'rovlar parallel, faqat kerakli maydonlar */
export async function getStudentDashboard(): Promise<StudentDashboard> {
  const session = await requireStudent();
  await connectToDatabase();

  const [me, settings] = await Promise.all([
    User.findById(session.userId).select("fullName groupId totalCoins spendableBalance xp").lean(),
    getAppSettings(),
  ]);
  const groupId = me?.groupId ?? null;
  const totalCoins = me?.totalCoins ?? 0;
  // O'rin reyting sahifasi bilan bir xil o'lchovda: gamifikatsiya yoqilgan bo'lsa XP, aks holda coin
  const rankField = settings.gamification.enabled ? "xp" : "totalCoins";
  const myValue = (settings.gamification.enabled ? me?.xp : me?.totalCoins) ?? 0;

  const [group, activeSession, homeworkLessons, recentLessons, ahead, groupSize, ordersToConfirm] = await Promise.all([
    groupId ? Group.findById(groupId).select("name schedule").lean() : null,
    groupId ? AttendanceSession.findOne({ groupId, status: "active" }).select("_id").lean() : null,
    groupId
      ? Lesson.find({ groupId, isPublished: true, "homework.isEnabled": true })
          .select("title homework.dueAt date")
          .sort({ date: -1 })
          .limit(100)
          .lean()
      : [],
    groupId
      ? Lesson.find({ groupId, isPublished: true }).select("title order quarter date").sort({ date: -1, order: -1 }).limit(3).lean()
      : [],
    groupId
      ? User.countDocuments({ groupId, role: "student", isHiddenFromLeaderboard: { $ne: true }, [rankField]: { $gt: myValue } })
      : 0,
    groupId ? User.countDocuments({ groupId, role: "student", isHiddenFromLeaderboard: { $ne: true } }) : 0,
    Order.countDocuments({ studentId: session.userId, status: "handed_over" }),
  ]);

  const [submissions, alreadyMarked] = await Promise.all([
    homeworkLessons.length > 0
      ? HomeworkSubmission.find({ studentId: session.userId, lessonId: { $in: homeworkLessons.map((l) => l._id) } })
          .select("lessonId status")
          .lean()
      : [],
    activeSession ? AttendanceRecord.exists({ sessionId: activeSession._id, studentId: session.userId }) : null,
  ]);
  const statusOf = new Map<string, HomeworkStatus>(submissions.map((s) => [s.lessonId.toString(), s.status]));

  const todo = homeworkLessons
    .map((l) => ({
      lessonId: l._id.toString(),
      title: l.title,
      dueAt: l.homework?.dueAt ? new Date(l.homework.dueAt).toISOString() : null,
      state: (statusOf.get(l._id.toString()) ?? "missing") as HomeworkState,
    }))
    .filter((h) => h.state === "missing" || h.state === "returned")
    // Muddati yaqini birinchi; muddatsizlar oxirida
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));

  const next = getNextLesson(group?.schedule);

  return {
    firstName: (me?.fullName ?? session.fullName).trim().split(/\s+/)[0] || session.fullName,
    groupName: group?.name ?? null,
    nextLesson: next ? { label: next.label, isNow: next.isNow } : null,
    attendanceOpen: Boolean(activeSession) && !alreadyMarked,
    balance: me?.spendableBalance ?? 0,
    totalCoins,
    rank: groupSize > 0 ? { position: ahead + 1, total: groupSize } : null,
    homework: {
      todo: todo.slice(0, 4),
      todoCount: todo.length,
      waitingCount: submissions.filter((s) => s.status === "submitted").length,
      gradedCount: submissions.filter((s) => s.status === "graded").length,
    },
    recentLessons: recentLessons.map((l) => ({
      _id: l._id.toString(),
      title: l.title,
      order: l.order,
      quarter: l.quarter,
      date: l.date ? new Date(l.date).toISOString() : null,
    })),
    ordersToConfirm,
  };
}

/** Bosh sahifadagi qiziqtiruvchi bloklar: maqsadlar va diagrammalar uchun ma'lumot */
export interface StudentHomeStats {
  unit: "XP" | "coin";
  /** So'nggi 14 kun: har kunda olingan XP va coin (xarid, jarima va tenglashtirishsiz) */
  days: { key: string; label: string; weekday: string; xp: number; coins: number }[];
  /** Oxirgi baholar (eskidan yangiga): vazifa bali yoki test foizi */
  scores: { kind: "homework" | "quiz"; title: string; percent: number; at: string }[];
  /** Oxirgi darslar davomati (eskidan yangiga) */
  attendance: { status: "present" | "late" | "excused" | "absent"; date: string }[];
  attendancePercent: number | null;
  /** So'nggi 30 kunda coin manbalari */
  sources: { type: CoinTransactionType; amount: number }[];
  /** Do'kondagi keyingi sovg'a: balans yetmaydigan eng arzon mahsulot (hammasi yetsa — eng qimmati) */
  shopGoal: { title: string; price: number; balance: number } | null;
  /** Reytingda bir pog'ona yuqoriga chiqish uchun kerakli farq */
  rankGap: { position: number; total: number; gap: number; aheadName: string | null } | null;
}

const NOT_EARNING: CoinTransactionType[] = ["purchase", "adjustment", "xp_align"];
const UZ_WEEKDAY_SHORT = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

export async function getStudentHomeStats(): Promise<StudentHomeStats> {
  const session = await requireStudent();
  await connectToDatabase();
  const [me, settings] = await Promise.all([
    User.findById(session.userId).select("groupId xp totalCoins spendableBalance").lean(),
    getAppSettings(),
  ]);
  const xpMode = settings.gamification.enabled;
  const field = xpMode ? "xp" : "totalCoins";
  const myValue = Math.round((xpMode ? me?.xp : me?.totalCoins) ?? 0);
  const studentId = new mongoose.Types.ObjectId(session.userId);
  const groupId = me?.groupId ?? null;

  const today = toDateKey();
  const firstDay = addDaysToKey(today, -13);
  const since14 = new Date(Date.now() - 15 * 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const [dayRows, sourceRows, homework, quizzes, records, products, above, groupSize] = await Promise.all([
    CoinLedger.aggregate<{ _id: string; xp: number; coins: number }>([
      { $match: { studentId, createdAt: { $gte: since14 }, type: { $nin: NOT_EARNING } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "Asia/Tashkent" } },
          xp: { $sum: { $max: [0, { $ifNull: ["$xp", 0] }] } },
          coins: { $sum: { $max: [0, "$amount"] } },
        },
      },
    ]),
    CoinLedger.aggregate<{ _id: CoinTransactionType; amount: number }>([
      { $match: { studentId, createdAt: { $gte: since30 }, amount: { $gt: 0 }, type: { $nin: NOT_EARNING } } },
      { $group: { _id: "$type", amount: { $sum: "$amount" } } },
      { $sort: { amount: -1 } },
    ]),
    HomeworkSubmission.find({ studentId, status: "graded", score: { $ne: null } })
      .select("lessonId score submittedAt")
      .sort({ submittedAt: -1 })
      .limit(8)
      .lean(),
    QuizSubmission.find({ studentId, status: "graded", maxScore: { $gt: 0 } })
      .select("lessonId totalScore maxScore submittedAt")
      .sort({ submittedAt: -1 })
      .limit(8)
      .lean(),
    AttendanceRecord.find({ studentId }).select("sessionId status").lean(),
    Product.find({ isActive: true, kind: { $ne: "streak_shield" }, $or: [{ stock: null }, { stock: { $gt: 0 } }] })
      .select("title price")
      .sort({ price: 1 })
      .lean(),
    groupId
      ? User.find({ groupId, role: "student", isHiddenFromLeaderboard: { $ne: true }, [field]: { $gt: myValue } })
          .select(`fullName ${field}`)
          .sort({ [field]: 1 })
          .lean()
      : [],
    groupId ? User.countDocuments({ groupId, role: "student", isHiddenFromLeaderboard: { $ne: true } }) : 0,
  ]);

  // Kunlar: bo'sh kunlar ham 0 bilan ko'rsatiladi
  const byDay = new Map(dayRows.map((r) => [r._id, r]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const key = addDaysToKey(firstDay, i);
    const weekday = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
    const r = byDay.get(key);
    return { key, label: key.slice(8), weekday: UZ_WEEKDAY_SHORT[weekday], xp: Math.round(r?.xp ?? 0), coins: Math.round(r?.coins ?? 0) };
  });

  // Baholar: vazifa va testlar aralash, sana bo'yicha
  const lessonIds = [...homework.map((h) => h.lessonId), ...quizzes.map((q) => q.lessonId)];
  const titles = new Map((await Lesson.find({ _id: { $in: lessonIds } }).select("title").lean()).map((l) => [String(l._id), l.title]));
  const scores = [
    ...homework.map((h) => ({
      kind: "homework" as const,
      title: titles.get(String(h.lessonId)) ?? "Vazifa",
      percent: Math.max(0, Math.min(100, Math.round(h.score ?? 0))),
      at: new Date(h.submittedAt ?? Date.now()).toISOString(),
    })),
    ...quizzes.map((q) => ({
      kind: "quiz" as const,
      title: titles.get(String(q.lessonId)) ?? "Test",
      percent: Math.round((q.totalScore / q.maxScore) * 100),
      at: new Date(q.submittedAt ?? Date.now()).toISOString(),
    })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-10);

  // Davomat: oxirgi 12 dars
  const sessions = await AttendanceSession.find({ _id: { $in: records.map((r) => r.sessionId) } }).select("date").lean();
  const dateOf = new Map(sessions.map((x) => [String(x._id), x.date]));
  const dated = records
    .flatMap((r) => {
      const d = dateOf.get(String(r.sessionId));
      return d ? [{ status: r.status, date: new Date(d).toISOString() }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const counted = dated.filter((r) => r.status !== "excused");
  const attended = counted.filter((r) => r.status === "present" || r.status === "late").length;

  const balance = me?.spendableBalance ?? 0;
  const next = products.find((p) => p.price > balance) ?? products[products.length - 1] ?? null;
  const nearest = above[0];

  return {
    unit: xpMode ? "XP" : "coin",
    days,
    scores,
    attendance: dated.slice(-12),
    attendancePercent: counted.length > 0 ? Math.round((attended / counted.length) * 100) : null,
    sources: sourceRows.map((r) => ({ type: r._id, amount: r.amount })),
    shopGoal: next ? { title: next.title, price: next.price, balance } : null,
    rankGap:
      groupSize > 0
        ? {
            // Reyting sahifasidagidek: o'zidan ko'p to'plaganlar soni + 1
            position: above.length + 1,
            total: groupSize,
            gap: nearest ? Math.round((xpMode ? nearest.xp : nearest.totalCoins) ?? 0) - myValue + 1 : 0,
            aheadName: nearest ? nearest.fullName.trim().split(/\s+/)[0] : null,
          }
        : null,
  };
}

export interface MentorDashboard {
  firstName: string;
  ungradedHomework: number;
  homeworkToCheck: { lessonId: string; title: string; groupName: string; ungraded: number }[];
  pendingOrders: number;
  ordersPreview: { _id: string; productTitle: string; price: number; studentName: string; createdAt: string | null }[];
  activeSessions: { _id: string; groupName: string }[];
  groups: {
    _id: string;
    name: string;
    shortName: string;
    grade: number;
    students: number;
    schedule: string;
    hasLessonToday: boolean;
    todayTime: string | null;
    lessons: number;
  }[];
  totals: { students: number; groups: number; lessons: number };
}

export async function getMentorDashboard(): Promise<MentorDashboard> {
  const session = await requireMentor();
  await connectToDatabase();

  const [groups, studentCounts, lessonCounts, ungradedByLesson, pendingOrders, orders, activeSessions] = await Promise.all([
    Group.find({ isActive: true }).select("name shortName grade schedule").sort({ grade: 1, name: 1 }).lean(),
    User.aggregate<{ _id: mongoose.Types.ObjectId | null; count: number }>([
      { $match: { role: "student" } },
      { $group: { _id: "$groupId", count: { $sum: 1 } } },
    ]),
    Lesson.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([{ $group: { _id: "$groupId", count: { $sum: 1 } } }]),
    HomeworkSubmission.aggregate<{ _id: mongoose.Types.ObjectId; count: number; oldest: Date }>([
      { $match: { status: "submitted" } },
      { $group: { _id: "$lessonId", count: { $sum: 1 }, oldest: { $min: "$submittedAt" } } },
      { $sort: { oldest: 1 } },
    ]),
    Order.countDocuments({ status: "pending" }),
    Order.find({ status: "pending" }).select("productTitle price studentId createdAt").sort({ createdAt: 1 }).limit(4).lean(),
    AttendanceSession.find({ status: "active" }).select("groupId").lean(),
  ]);

  const top = ungradedByLesson.slice(0, 5);
  const [lessons, orderStudents] = await Promise.all([
    top.length > 0 ? Lesson.find({ _id: { $in: top.map((u) => u._id) } }).select("title groupId").lean() : [],
    orders.length > 0 ? User.find({ _id: { $in: orders.map((o) => o.studentId) } }).select("fullName").lean() : [],
  ]);

  const groupName = new Map(groups.map((g) => [g._id.toString(), g.name]));
  const lessonOf = new Map(lessons.map((l) => [l._id.toString(), l]));
  const studentName = new Map(orderStudents.map((u) => [u._id.toString(), u.fullName]));
  const studentsIn = new Map(studentCounts.map((c) => [String(c._id), c.count]));
  const lessonsIn = new Map(lessonCounts.map((c) => [c._id.toString(), c.count]));

  return {
    firstName: session.fullName.trim().split(/\s+/)[0] || session.fullName,
    ungradedHomework: ungradedByLesson.reduce((sum, u) => sum + u.count, 0),
    homeworkToCheck: top.flatMap((u) => {
      const lesson = lessonOf.get(u._id.toString());
      return lesson
        ? [{ lessonId: u._id.toString(), title: lesson.title, groupName: groupName.get(lesson.groupId.toString()) ?? "—", ungraded: u.count }]
        : [];
    }),
    pendingOrders,
    ordersPreview: orders.map((o) => ({
      _id: o._id.toString(),
      productTitle: o.productTitle,
      price: o.price,
      studentName: studentName.get(o.studentId.toString()) ?? "O'quvchi",
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    })),
    activeSessions: activeSessions.map((s) => ({ _id: s._id.toString(), groupName: groupName.get(s.groupId.toString()) ?? "Guruh" })),
    groups: groups
      .map((g) => {
        const today = hasLessonOn(g.schedule);
        return {
          _id: g._id.toString(),
          name: g.name,
          shortName: groupShortName(g),
          grade: g.grade,
          students: studentsIn.get(g._id.toString()) ?? 0,
          schedule: formatSchedule(g.schedule),
          hasLessonToday: today,
          todayTime: today && g.schedule ? `${g.schedule.startTime}–${g.schedule.endTime}` : null,
          lessons: lessonsIn.get(g._id.toString()) ?? 0,
        };
      })
      // Bugun darsi borlar tepada, vaqt bo'yicha
      .sort((a, b) => Number(b.hasLessonToday) - Number(a.hasLessonToday) || (a.todayTime ?? "").localeCompare(b.todayTime ?? "")),
    totals: {
      students: [...studentsIn.entries()].filter(([id]) => groupName.has(id)).reduce((sum, [, c]) => sum + c, 0),
      groups: groups.length,
      lessons: [...lessonsIn.entries()].filter(([id]) => groupName.has(id)).reduce((sum, [, c]) => sum + c, 0),
    },
  };
}
