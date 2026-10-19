"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Eye, MousePointerClick } from "lucide-react";
import type { AnnouncementStats } from "@/actions/announcement.actions";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn, formatDateTimeUz } from "@/lib/utils";
import { ColumnHeader, TableFilterBar, useTableControls, type ColumnDef } from "@/components/ui/table-controls";

type Row = AnnouncementStats["students"][number];
const COLUMNS: ColumnDef<Row>[] = [
  { key: "fullName", label: "O'quvchi", value: (s) => s.fullName, filter: "text" },
  { key: "groupName", label: "Guruh", value: (s) => s.groupName },
  { key: "seenAt", label: "Ko'rdi", value: (s) => s.seenAt, filter: false },
  { key: "dismissed", label: "Tushundi", value: (s) => (s.dismissedAt ? "Ha" : "Yo'q"), filter: "options" },
  { key: "clicks", label: "Bosdi", value: (s) => s.clicks },
];

type Filter = "all" | "unseen" | "seen" | "clicked";

/** Auditoriya ro'yxati: kim ko'rdi, kim tushundi, kim bosdi — filtr bilan */
export function AnnouncementAudience({ students }: { students: AnnouncementStats["students"] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const unseen = students.filter((s) => !s.seenAt).length;
  const segment = students.filter((s) =>
    filter === "unseen" ? !s.seenAt : filter === "seen" ? Boolean(s.seenAt) : filter === "clicked" ? s.clicks > 0 : true
  );
  const table = useTableControls(segment, COLUMNS);
  const shown = table.rows;

  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900 dark:text-slate-100">O&apos;quvchilar</h2>
        <SegmentedControl<Filter>
          size="sm"
          ariaLabel="Filtr"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `Hammasi (${students.length})` },
            { value: "unseen", label: `Ko'rmagan (${unseen})` },
            { value: "seen", label: `Ko'rgan (${students.length - unseen})` },
            { value: "clicked", label: "Bosgan" },
          ]}
        />
      </div>
      <TableFilterBar table={table} />
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Bu ro&apos;yxat bo&apos;sh</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-2 font-bold"><ColumnHeader table={table} column="fullName">O&apos;quvchi</ColumnHeader></th>
                <th className="px-2 py-2 font-bold"><ColumnHeader table={table} column="groupName">Guruh</ColumnHeader></th>
                <th className="px-2 py-2 font-bold"><ColumnHeader table={table} column="seenAt">Ko&apos;rdi</ColumnHeader></th>
                <th className="px-2 py-2 text-center font-bold"><ColumnHeader table={table} column="dismissed" align="center">Tushundi</ColumnHeader></th>
                <th className="px-2 py-2 text-center font-bold"><ColumnHeader table={table} column="clicks" align="center">Bosdi</ColumnHeader></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((s) => (
                <tr key={s._id}>
                  <td className="py-2 pr-2">
                    <Link href={`/mentor/students/${s._id}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:underline">
                      {s.fullName}
                    </Link>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{s.groupName}</td>
                  <td className="px-2 py-2 text-xs">
                    {s.seenAt ? (
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                        <Eye className="h-3.5 w-3.5 text-teal-600" />
                        {formatDateTimeUz(s.seenAt)}
                        {s.views > 1 && <span className="text-slate-400"> ×{s.views}</span>}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {s.dismissedAt ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="tushundi" /> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {s.clicks > 0 ? (
                      <span className={cn("inline-flex items-center gap-1 text-xs font-bold text-sky-700 dark:text-sky-300")}>
                        <MousePointerClick className="h-3.5 w-3.5" />
                        {s.clicks}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
