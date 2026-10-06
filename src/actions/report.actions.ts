"use server";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { AttendanceRecord, AttendanceStatus } from "@/lib/db/models/attendance-record.model";
import { CoinLedger, CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { ExamSubmission } from "@/lib/db/models/exam-submission.model";
import { Exam } from "@/lib/db/models/exam.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Order, OrderStatus } from "@/lib/db/models/order.model";
import { requireMentor } from "@/lib/auth/guards";
import { dateFromKey, addDaysToKey, toDateKey } from "@/lib/schedule";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : null);
const isAttended = (s: AttendanceStatus) => s === "present" || s === "late";

export interface ReportData {
  range: { from: string; to: string };
  overview: {
    students: number;
    lessonsHeld: number;
    attendancePercent: number | null;
    coinsEarned: number;
    coinsSpent: number;
    pendingOrders: number;
  };
  attendanceByGroup: {
    groupId: string;
    name: string;
    lessons: number;
    present: number;
    late: number;
    excused: number;
    absent: number;
    percent: number | null;
  }[];
  attendanceByLesson: { sessionId: string; dateKey: string; groupName: string; percent: number | null; attended: number; total: number }[];
  mostAbsent: { studentId: string; fullName: string; groupName: string; absent: number; total: number; percent: number | null }[];
  quizzesByGroup: { groupId: string; name: string; submissions: number; avgPercent: number | null }[];
  exams: { examId: string; title: string; submissions: number; avgPercent: number | null; passPercent: number | null }[];
  coinsByType: { type: CoinTransactionType; amount: number }[];
  topEarners: { studentId: string; fullName: string; groupName: string; earned: number }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  topProducts: { title: string; count: number; coins: number }[];
}

export async function getReportData(params: {
  from: string;
  to: string;
  groupId?: string;
}): Promise<ReportData | null> {
  await requireMentor();
  if (!DATE_RE.test(params.from) || !DATE_RE.test(params.to) || params.from > params.to) return null;
  const groupId = params.groupId && mongoose.isValidObjectId(params.groupId) ? params.groupId : undefined;
  await connectToDatabase();

  const start = dateFromKey(params.from);
  const end = dateFromKey(addDaysToKey(params.to, 1));
  const groupFilter = groupId ? { groupId } : {};

  const [groups, students] = await Promise.all([
    Group.find(groupId ? { _id: groupId } : { isActive: true }).select("name").sort({ name: 1 }).lean(),
    User.find({ role: "student", ...groupFilter }).select("fullName groupId").lean(),
  ]);
  const groupName = new Map(groups.map((g) => [g._id.toString(), g.name]));
  const studentById = new Map(students.map((s) => [s._id.toString(), s]));
  const studentIds = students.map((s) => s._id);
  const nameOfGroup = (id?: unknown) => (id ? groupName.get(String(id)) ?? "—" : "Guruhsiz");

  // ---------- Davomat ----------
  const sessions = await AttendanceSession.find({ status: "closed", date: { $gte: start, $lt: end }, ...groupFilter })
    .select("groupId date")
    .sort({ date: 1 })
    .lean();
  const records = await AttendanceRecord.find({ sessionId: { $in: sessions.map((s) => s._id) } })
    .select("sessionId studentId groupId status")
    .lean();

  const bySession = new Map<string, { attended: number; total: number }>();
  const byGroup = new Map<string, { lessons: number; present: number; late: number; excused: number; absent: number }>();
  const byStudent = new Map<string, { absent: number; total: number; attended: number }>();
  for (const s of sessions) {
    const key = s.groupId.toString();
    if (!byGroup.has(key)) byGroup.set(key, { lessons: 0, present: 0, late: 0, excused: 0, absent: 0 });
    byGroup.get(key)!.lessons++;
    bySession.set(s._id.toString(), { attended: 0, total: 0 });
  }
  for (const r of records) {
    const g = byGroup.get(r.groupId.toString());
    if (g) g[r.status]++;
    // Sababli qoldirilgan dars foiz hisobiga kirmaydi
    if (r.status === "excused") continue;
    const sess = bySession.get(r.sessionId.toString());
    if (sess) {
      sess.total++;
      if (isAttended(r.status)) sess.attended++;
    }
    const sid = r.studentId.toString();
    if (!byStudent.has(sid)) byStudent.set(sid, { absent: 0, total: 0, attended: 0 });
    const st = byStudent.get(sid)!;
    st.total++;
    if (isAttended(r.status)) st.attended++;
    else st.absent++;
  }

  let attendedAll = 0;
  let totalAll = 0;
  for (const v of bySession.values()) {
    attendedAll += v.attended;
    totalAll += v.total;
  }

  // ---------- Coinlar ----------
  const ledger = await CoinLedger.find({
    createdAt: { $gte: start, $lt: end },
    ...(groupId ? { studentId: { $in: studentIds } } : {}),
  })
    .select("studentId amount type")
    .lean();
  const coinsByType = new Map<CoinTransactionType, number>();
  const earnedByStudent = new Map<string, number>();
  let coinsEarned = 0;
  let coinsSpent = 0;
  for (const l of ledger) {
    coinsByType.set(l.type, (coinsByType.get(l.type) ?? 0) + l.amount);
    if (l.type === "purchase") coinsSpent += -l.amount;
    // Xarid va uning qaytarilishi "topilgan coin" hisoblanmaydi
    else if (l.type !== "adjustment" || l.amount < 0) {
      coinsEarned += l.amount;
      const sid = l.studentId.toString();
      earnedByStudent.set(sid, (earnedByStudent.get(sid) ?? 0) + l.amount);
    }
  }

  // ---------- Testlar va imtihonlar ----------
  const [quizSubs, examSubs] = await Promise.all([
    QuizSubmission.find({
      submittedAt: { $gte: start, $lt: end },
      status: { $in: ["submitted", "graded"] },
      ...(groupId ? { studentId: { $in: studentIds } } : {}),
    })
      .select("studentId totalScore maxScore")
      .lean(),
    ExamSubmission.find({
      submittedAt: { $gte: start, $lt: end },
      status: { $in: ["submitted", "graded"] },
      ...groupFilter,
    })
      .select("examId totalScore maxScore isPassed status")
      .lean(),
  ]);

  const quizByGroup = new Map<string, { n: number; sum: number }>();
  for (const q of quizSubs) {
    const st = studentById.get(q.studentId.toString());
    if (!st?.groupId || q.maxScore <= 0) continue;
    const key = st.groupId.toString();
    if (!quizByGroup.has(key)) quizByGroup.set(key, { n: 0, sum: 0 });
    const g = quizByGroup.get(key)!;
    g.n++;
    g.sum += (q.totalScore / q.maxScore) * 100;
  }

  const examAgg = new Map<string, { n: number; sum: number; graded: number; passed: number }>();
  for (const e of examSubs) {
    const key = e.examId.toString();
    if (!examAgg.has(key)) examAgg.set(key, { n: 0, sum: 0, graded: 0, passed: 0 });
    const a = examAgg.get(key)!;
    a.n++;
    if (e.status === "graded" && e.maxScore > 0) {
      a.graded++;
      a.sum += (e.totalScore / e.maxScore) * 100;
      if (e.isPassed) a.passed++;
    }
  }
  const examDocs = await Exam.find({ _id: { $in: [...examAgg.keys()] } }).select("title").lean();
  const examTitle = new Map(examDocs.map((e) => [e._id.toString(), e.title]));

  // ---------- Do'kon ----------
  const orders = await Order.find({
    createdAt: { $gte: start, $lt: end },
    ...(groupId ? { studentId: { $in: studentIds } } : {}),
  })
    .select("status productTitle price")
    .lean();
  const ordersByStatus = new Map<OrderStatus, number>();
  const products = new Map<string, { count: number; coins: number }>();
  for (const o of orders) {
    ordersByStatus.set(o.status, (ordersByStatus.get(o.status) ?? 0) + 1);
    if (o.status === "rejected" || o.status === "cancelled") continue;
    if (!products.has(o.productTitle)) products.set(o.productTitle, { count: 0, coins: 0 });
    const p = products.get(o.productTitle)!;
    p.count++;
    p.coins += o.price;
  }
  const pendingOrders = await Order.countDocuments({
    status: "pending",
    ...(groupId ? { studentId: { $in: studentIds } } : {}),
  });

  const studentRow = (sid: string) => {
    const st = studentById.get(sid);
    return st ? { studentId: sid, fullName: st.fullName, groupName: nameOfGroup(st.groupId) } : null;
  };

  return {
    range: { from: params.from, to: params.to },
    overview: {
      students: students.length,
      lessonsHeld: sessions.length,
      attendancePercent: pct(attendedAll, totalAll),
      coinsEarned,
      coinsSpent,
      pendingOrders,
    },
    attendanceByGroup: groups.map((g) => {
      const a = byGroup.get(g._id.toString()) ?? { lessons: 0, present: 0, late: 0, excused: 0, absent: 0 };
      return {
        groupId: g._id.toString(),
        name: g.name,
        ...a,
        percent: pct(a.present + a.late, a.present + a.late + a.absent),
      };
    }),
    attendanceByLesson: sessions.map((s) => {
      const v = bySession.get(s._id.toString())!;
      return {
        sessionId: s._id.toString(),
        dateKey: toDateKey(s.date),
        groupName: nameOfGroup(s.groupId),
        percent: pct(v.attended, v.total),
        attended: v.attended,
        total: v.total,
      };
    }),
    mostAbsent: [...byStudent.entries()]
      .filter(([, v]) => v.absent > 0)
      .sort((a, b) => b[1].absent - a[1].absent)
      .slice(0, 10)
      .flatMap(([sid, v]) => {
        const row = studentRow(sid);
        return row ? [{ ...row, absent: v.absent, total: v.total, percent: pct(v.attended, v.total) }] : [];
      }),
    quizzesByGroup: groups.map((g) => {
      const q = quizByGroup.get(g._id.toString());
      return {
        groupId: g._id.toString(),
        name: g.name,
        submissions: q?.n ?? 0,
        avgPercent: q && q.n > 0 ? Math.round(q.sum / q.n) : null,
      };
    }),
    exams: [...examAgg.entries()].map(([examId, a]) => ({
      examId,
      title: examTitle.get(examId) ?? "O'chirilgan imtihon",
      submissions: a.n,
      avgPercent: a.graded > 0 ? Math.round(a.sum / a.graded) : null,
      passPercent: pct(a.passed, a.graded),
    })),
    coinsByType: [...coinsByType.entries()].map(([type, amount]) => ({ type, amount })),
    topEarners: [...earnedByStudent.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .flatMap(([sid, earned]) => {
        const row = studentRow(sid);
        return row ? [{ ...row, earned }] : [];
      }),
    ordersByStatus: [...ordersByStatus.entries()].map(([status, count]) => ({ status, count })),
    topProducts: [...products.entries()]
      .map(([title, v]) => ({ title, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

export interface StudentReport {
  student: {
    _id: string;
    fullName: string;
    login: string;
    groupName: string | null;
    totalCoins: number;
    spendableBalance: number;
    lastLoginAt: string | null;
  };
  attendance: {
    percent: number | null;
    counts: Record<AttendanceStatus, number>;
    records: { sessionId: string; date: string; status: AttendanceStatus; notes: string }[];
  };
  quizzes: { title: string; totalScore: number; maxScore: number; status: string; submittedAt: string | null }[];
  exams: { title: string; totalScore: number; maxScore: number; status: string; isPassed: boolean; submittedAt: string | null }[];
  ledger: { amount: number; type: CoinTransactionType; description: string; createdAt: string | null }[];
  orders: { productTitle: string; price: number; status: OrderStatus; createdAt: string | null }[];
}

const iso = (d?: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** Bitta o'quvchi bo'yicha to'liq hisobot */
export async function getStudentReport(studentId: string): Promise<StudentReport | null> {
  await requireMentor();
  if (!mongoose.isValidObjectId(studentId)) return null;
  await connectToDatabase();

  const student = await User.findOne({ _id: studentId, role: "student" }).select("-passwordHash").lean();
  if (!student) return null;

  const [group, records, quizSubs, examSubs, ledger, orders] = await Promise.all([
    student.groupId ? Group.findById(student.groupId).select("name").lean() : null,
    AttendanceRecord.find({ studentId }).select("sessionId status notes").lean(),
    QuizSubmission.find({ studentId }).select("lessonId totalScore maxScore status submittedAt").sort({ submittedAt: -1 }).lean(),
    ExamSubmission.find({ studentId, status: { $ne: "in_progress" } })
      .select("examId totalScore maxScore status isPassed submittedAt")
      .sort({ submittedAt: -1 })
      .lean(),
    CoinLedger.find({ studentId }).sort({ createdAt: -1 }).limit(50).lean(),
    Order.find({ studentId }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  const [sessionDocs, lessonDocs, examDocs] = await Promise.all([
    AttendanceSession.find({ _id: { $in: records.map((r) => r.sessionId) } }).select("date").lean(),
    Lesson.find({ _id: { $in: quizSubs.map((q) => q.lessonId) } }).select("title").lean(),
    Exam.find({ _id: { $in: examSubs.map((e) => e.examId) } }).select("title").lean(),
  ]);
  const sessionDate = new Map(sessionDocs.map((s) => [s._id.toString(), s.date]));
  const lessonTitle = new Map(lessonDocs.map((l) => [l._id.toString(), l.title]));
  const examTitle = new Map(examDocs.map((e) => [e._id.toString(), e.title]));

  const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const r of records) counts[r.status]++;

  return {
    student: {
      _id: student._id.toString(),
      fullName: student.fullName,
      login: student.login,
      groupName: group?.name ?? null,
      totalCoins: student.totalCoins ?? 0,
      spendableBalance: student.spendableBalance ?? 0,
      lastLoginAt: iso(student.lastLoginAt),
    },
    attendance: {
      percent: pct(counts.present + counts.late, counts.present + counts.late + counts.absent),
      counts,
      records: records
        .flatMap((r) => {
          const date = sessionDate.get(r.sessionId.toString());
          return date
            ? [{ sessionId: r.sessionId.toString(), date: new Date(date).toISOString(), status: r.status, notes: r.notes ?? "" }]
            : [];
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    },
    quizzes: quizSubs.map((q) => ({
      title: lessonTitle.get(q.lessonId.toString()) ?? "O'chirilgan dars",
      totalScore: q.totalScore,
      maxScore: q.maxScore,
      status: q.status,
      submittedAt: iso(q.submittedAt),
    })),
    exams: examSubs.map((e) => ({
      title: examTitle.get(e.examId.toString()) ?? "O'chirilgan imtihon",
      totalScore: e.totalScore,
      maxScore: e.maxScore,
      status: e.status,
      isPassed: e.isPassed,
      submittedAt: iso(e.submittedAt),
    })),
    ledger: ledger.map((l) => ({ amount: l.amount, type: l.type, description: l.description, createdAt: iso(l.createdAt) })),
    orders: orders.map((o) => ({ productTitle: o.productTitle, price: o.price, status: o.status, createdAt: iso(o.createdAt) })),
  };
}
