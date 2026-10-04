import { requireMentor } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { AuditLog, IAuditLog } from "@/lib/db/models/audit-log.model";
import { ShieldCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateUz } from "@/lib/utils";

export default async function MentorAuditPage() {
  await requireMentor();
  await connectToDatabase();

  const rawLogs = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("actorId", "fullName login")
    .populate("targetUserId", "fullName login")
    .lean();

  const logs = JSON.parse(JSON.stringify(rawLogs)) as Array<
    IAuditLog & {
      actorId?: { fullName: string; login: string };
      targetUserId?: { fullName: string; login: string };
    }
  >;

  const getActionBadge = (action: string) => {
    if (action.includes("DELETE")) return <Badge variant="destructive">{action}</Badge>;
    if (action.includes("CREATE") || action.includes("IMPORT")) return <Badge variant="success">{action}</Badge>;
    if (action.includes("RESET")) return <Badge variant="warning">{action}</Badge>;
    return <Badge variant="default">{action}</Badge>;
  };

  return (
    <div className="space-y-6 animate-in fade-in max-w-5xl mx-auto">
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="w-7 h-7 text-teal-600 dark:text-teal-400" />
          Xavfsizlik va Audit Loglar
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Mentor tomonidan amalga oshirilgan muhim amallar tarixi (oxirgi {logs.length} ta yozuv)
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32]">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="p-3.5 sm:p-4 font-bold">Vaqt</th>
              <th className="p-3.5 sm:p-4 font-bold">Amal</th>
              <th className="p-3.5 sm:p-4 font-bold">Bajaruvchi</th>
              <th className="p-3.5 sm:p-4 font-bold">Tafsilotlar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400">
                  Audit loglar hali mavjud emas
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log._id.toString()} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="p-3.5 sm:p-4 text-xs text-slate-500 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatDateUz(log.createdAt)} {new Date(log.createdAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </td>
                  <td className="p-3.5 sm:p-4 whitespace-nowrap">
                    {getActionBadge(log.action)}
                  </td>
                  <td className="p-3.5 sm:p-4 font-medium text-xs sm:text-sm">
                    {log.actorId ? `${log.actorId.fullName} (@${log.actorId.login})` : "Tizim"}
                  </td>
                  <td className="p-3.5 sm:p-4 font-mono text-[11px] text-slate-600 dark:text-slate-300 max-w-xs sm:max-w-md truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
