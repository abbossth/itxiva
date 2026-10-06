import type { AttendanceStatus } from "@/lib/db/models/attendance-record.model";

export const ATTENDANCE_STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; className: string; activeClassName: string }
> = {
  present: {
    label: "Kelgan",
    short: "✓",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    activeClassName: "bg-emerald-600 border-emerald-600 text-white",
  },
  late: {
    label: "Kechikkan",
    short: "K",
    className: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
    activeClassName: "bg-amber-500 border-amber-500 text-white",
  },
  excused: {
    label: "Sababli",
    short: "S",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    activeClassName: "bg-blue-600 border-blue-600 text-white",
  },
  absent: {
    label: "Kelmagan",
    short: "✗",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    activeClassName: "bg-rose-600 border-rose-600 text-white",
  },
};

export const ATTENDANCE_STATUS_ORDER: AttendanceStatus[] = ["present", "late", "excused", "absent"];
