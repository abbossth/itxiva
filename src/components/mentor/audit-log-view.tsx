"use client";

import { useState } from "react";
import { ShieldCheck, Clock, User, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTimeUz } from "@/lib/utils";

export interface FormattedAuditLog {
  _id: string;
  action: string;
  actorId?: { fullName: string; login: string };
  targetUserId?: { fullName: string; login: string };
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: string | Date;
}

interface AuditLogViewProps {
  logs: FormattedAuditLog[];
}

const ACTION_MAP: Record<string, { label: string; variant: "danger" | "success" | "warning" | "teal" | "default" }> = {
  DELETE_GROUP: { label: "Guruh o'chirildi", variant: "danger" },
  CREATE_GROUP: { label: "Guruh yaratildi", variant: "success" },
  UPDATE_GROUP: { label: "Guruh yangilandi", variant: "teal" },
  DELETE_STUDENT: { label: "O'quvchi o'chirildi", variant: "danger" },
  RESET_PASSWORD: { label: "Parol tiklandi", variant: "warning" },
  MOVE_STUDENT: { label: "O'quvchi ko'chirildi", variant: "teal" },
  IMPORT_STUDENTS: { label: "O'quvchilar import qilindi", variant: "success" },
  CREATE_LESSON: { label: "Dars yaratildi", variant: "success" },
  UPDATE_LESSON: { label: "Dars tahrirlandi", variant: "teal" },
  DELETE_LESSON: { label: "Dars o'chirildi", variant: "danger" },
  TOGGLE_PUBLISH_LESSON: { label: "Dars holati o'zgardi", variant: "warning" },
  CREATE_EXAM: { label: "Imtihon yaratildi", variant: "success" },
  UPDATE_EXAM: { label: "Imtihon yangilandi", variant: "teal" },
  DELETE_EXAM: { label: "Imtihon o'chirildi", variant: "danger" },
  GRADE_EXAM: { label: "Imtihon baholandi", variant: "teal" },
  START_ATTENDANCE: { label: "Davomat boshlandi", variant: "success" },
  CLOSE_ATTENDANCE: { label: "Davomat yakunlandi", variant: "warning" },
  MANUAL_ATTENDANCE: { label: "Qo'lda davomat belgilandi", variant: "teal" },
};

function formatDetails(details?: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return "Tafsilotlar mavjud emas";

  const parts: string[] = [];
  if (details.groupName) parts.push(`Guruh: ${details.groupName}`);
  if (details.name) parts.push(`Nomi: ${details.name}`);
  if (details.title) parts.push(`Sarlavha: ${details.title}`);
  if (details.studentName) parts.push(`O'quvchi: ${details.studentName}`);
  if (details.studentLogin) parts.push(`@${details.studentLogin}`);
  if (details.count !== undefined) parts.push(`Soni: ${details.count} ta`);
  if (details.oldGroup && details.newGroup) parts.push(`${details.oldGroup} ➔ ${details.newGroup}`);
  if (details.status) parts.push(`Holat: ${details.status}`);

  if (parts.length > 0) return parts.join(" • ");

  return Object.entries(details)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

export function AuditLogView({ logs }: AuditLogViewProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="w-7 h-7 text-teal-600 dark:text-teal-400" />
          Xavfsizlik va Audit Loglar
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Mentorlar tomonidan amalga oshirilgan barcha xavfsiz amallar tarixi (oxirgi {logs.length} ta yozuv)
        </p>
      </div>

      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32]">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="p-4 font-bold whitespace-nowrap">Vaqt</th>
              <th className="p-4 font-bold whitespace-nowrap">Amal</th>
              <th className="p-4 font-bold whitespace-nowrap">Bajaruvchi</th>
              <th className="p-4 font-bold">Tafsilotlar</th>
              <th className="p-4 font-bold text-right w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  Audit loglar hali mavjud emas
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const actionInfo = ACTION_MAP[log.action] || {
                  label: log.action,
                  variant: "default",
                };
                const isExpanded = expandedRow === log._id;

                return (
                  <tr key={log._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDateTimeUz(log.createdAt)}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <Badge variant={actionInfo.variant}>{actionInfo.label}</Badge>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {log.actorId ? log.actorId.fullName : "Tizim"}
                        </span>
                        {log.actorId && (
                          <span className="text-xs text-slate-400 font-mono">
                            @{log.actorId.login}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-xs">
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {formatDetails(log.details)}
                        </span>
                        {isExpanded && log.details && (
                          <pre className="mt-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 font-mono text-[11px] text-slate-600 dark:text-slate-400 overflow-x-auto max-w-lg">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {log.details && Object.keys(log.details).length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(log._id)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                          title={isExpanded ? "Yopish" : "JSON kodini ko'rish"}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (< md, fixes K2) */}
      <div className="md:hidden space-y-3">
        {logs.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 text-slate-400">
            Audit loglar hali mavjud emas
          </div>
        ) : (
          logs.map((log) => {
            const actionInfo = ACTION_MAP[log.action] || {
              label: log.action,
              variant: "default",
            };
            const isExpanded = expandedRow === log._id;

            return (
              <div
                key={log._id}
                className="p-4 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={actionInfo.variant}>{actionInfo.label}</Badge>
                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDateTimeUz(log.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Avatar name={log.actorId?.fullName || "Tizim"} size="sm" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {log.actorId ? log.actorId.fullName : "Tizim"}
                    </span>
                    {log.actorId && (
                      <span className="text-slate-400 ml-1 font-mono">@{log.actorId.login}</span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 font-medium pt-1 border-t border-slate-100 dark:border-slate-800/60">
                  {formatDetails(log.details)}
                </div>

                {log.details && Object.keys(log.details).length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(log._id)}
                      className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer pt-1"
                    >
                      <span>{isExpanded ? "Tafsilotlarni yashirish" : "Batafsil JSON"}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && (
                      <pre className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 font-mono text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
