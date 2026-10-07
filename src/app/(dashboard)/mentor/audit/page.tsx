import mongoose from "mongoose";
import { requireMentorPage } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLogView } from "@/components/mentor/audit-log-view";
import { formatAuditRow, type AuditRefs } from "@/lib/audit-format";
import { groupShortName } from "@/lib/group-name";
import { formatDateUz } from "@/lib/utils";

export const metadata = {
  title: "Amallar tarixi — ITXiva",
};

const LIMIT = 200;
const idsOf = (values: unknown[]) => [...new Set(values.filter((v): v is string => typeof v === "string" && mongoose.isValidObjectId(v)))];

export default async function MentorAuditPage() {
  await requireMentorPage();
  await connectToDatabase();

  const raw = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(LIMIT)
    .populate("actorId", "fullName")
    .populate("targetUserId", "fullName role")
    .lean();

  const logs = raw.map((log) => {
    const actor = log.actorId as unknown as { fullName: string } | null;
    const target = log.targetUserId as unknown as { _id: mongoose.Types.ObjectId; fullName: string; role?: string } | null;
    return {
      _id: log._id.toString(),
      action: log.action,
      actor: actor?.fullName ? { fullName: actor.fullName } : null,
      target: target?.fullName ? { _id: target._id.toString(), fullName: target.fullName, role: target.role } : null,
      details: JSON.parse(JSON.stringify(log.details ?? {})) as Record<string, unknown>,
      createdAt: new Date(log.createdAt as Date).toISOString(),
    };
  });

  // Yozuvlarda tilga olingan dars, davomat va guruhlar: nomini ko'rsatish va faqat mavjudlariga havola berish uchun
  const [lessons, sessions, groups] = await Promise.all([
    Lesson.find({ _id: { $in: idsOf(logs.map((l) => l.details.lessonId)) } }).select("title groupId quarter").lean(),
    AttendanceSession.find({ _id: { $in: idsOf(logs.map((l) => l.details.sessionId)) } }).select("groupId date").lean(),
    Group.find().select("name shortName").lean(),
  ]);
  const refs: AuditRefs = {
    lessons: new Map(lessons.map((l) => [l._id.toString(), { title: l.title, groupId: l.groupId.toString(), quarter: l.quarter }])),
    sessions: new Map(sessions.map((s) => [s._id.toString(), { groupId: s.groupId.toString(), dateLabel: formatDateUz(s.date) }])),
    groups: new Map(groups.map((g) => [g._id.toString(), groupShortName(g)])),
  };

  return <AuditLogView rows={logs.map((log) => formatAuditRow(log, refs))} limit={LIMIT} />;
}
