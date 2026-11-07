import type { AttendanceStatus } from "@/lib/db/models/attendance-record.model";
import { PENALTY_LADDER_LABEL } from "@/lib/penalty-ladder";

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

export type AttendanceCoinRules = Record<AttendanceStatus, number> & {
  /** Sababsiz kelmaganga oy ichidagi zinapoya: 1-marta −10, 2-marta −30, 3-martadan −50 (`absent` — birinchi pog'ona) */
  absentLadder?: boolean;
};

/**
 * Sukutdagi coin qoidasi: kelgan +10, kechikkan +5, sababli 0,
 * sababsiz kelmagan — kalendar oy ichida −10 / −30 / −50 (src/lib/penalties.ts)
 */
export const ATTENDANCE_COINS: AttendanceCoinRules = { present: 10, late: 5, excused: 0, absent: -10, absentLadder: true };

/**
 * Sessiyaning coin qoidasi. Qoida saqlanmagan eski sessiyalar o'z davridagi hisobda qoladi:
 * qatnashganga belgilangan mukofot, qolganlarga 0 (o'tgan darslar qayta hisoblanmaydi).
 */
export function coinRulesOf(session: {
  coinRules?: Partial<AttendanceCoinRules> | null;
  defaultCoinsReward?: number | null;
}): AttendanceCoinRules {
  const r = session.coinRules;
  if (r && typeof r.present === "number") {
    return { present: r.present, late: r.late ?? 0, excused: r.excused ?? 0, absent: r.absent ?? 0, absentLadder: Boolean(r.absentLadder) };
  }
  const reward = session.defaultCoinsReward ?? 10;
  return { present: reward, late: reward, excused: 0, absent: 0 };
}

/** "+5", "−5", "0" */
export function formatCoinDelta(amount: number): string {
  if (amount > 0) return `+${amount}`;
  if (amount < 0) return `−${Math.abs(amount)}`;
  return "0";
}

/** Holat uchun coin qoidasi matni: "+10", sababsiz kelmaganda zinapoya bo'lsa "−10 / −30 / −50" */
export function coinRuleLabel(rules: AttendanceCoinRules, status: AttendanceStatus): string {
  return status === "absent" && rules.absentLadder ? PENALTY_LADDER_LABEL : formatCoinDelta(rules[status]);
}
