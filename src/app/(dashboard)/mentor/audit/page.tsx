import { requireMentorPage } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { AuditLog, IAuditLog } from "@/lib/db/models/audit-log.model";
import { AuditLogView, FormattedAuditLog } from "@/components/mentor/audit-log-view";

export const metadata = {
  title: "Audit loglar — ITXiva",
};

export default async function MentorAuditPage() {
  await requireMentorPage();
  await connectToDatabase();

  const rawLogs = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("actorId", "fullName login")
    .populate("targetUserId", "fullName login")
    .lean();

  const serialized = JSON.parse(JSON.stringify(rawLogs)) as Array<
    IAuditLog & {
      _id: string;
      actorId?: { fullName: string; login: string };
      targetUserId?: { fullName: string; login: string };
    }
  >;

  const logs: FormattedAuditLog[] = serialized.map((log) => ({
    _id: log._id.toString(),
    action: log.action,
    actorId: log.actorId,
    targetUserId: log.targetUserId,
    details: log.details as Record<string, unknown> | undefined,
    ip: log.ip,
    createdAt: log.createdAt,
  }));

  return <AuditLogView logs={logs} />;
}
