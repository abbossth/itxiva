"use server";

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

  const me = await User.findById(session.userId).select("fullName groupId totalCoins spendableBalance").lean();
  const groupId = me?.groupId ?? null;
  const totalCoins = me?.totalCoins ?? 0;

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
      ? User.countDocuments({ groupId, role: "student", isHiddenFromLeaderboard: { $ne: true }, totalCoins: { $gt: totalCoins } })
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
    Group.find({ isActive: true }).select("name grade schedule").sort({ grade: 1, name: 1 }).lean(),
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
