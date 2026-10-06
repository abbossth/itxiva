import type { HomeworkStatus } from "@/lib/db/models/homework-submission.model";

/** "missing" — o'quvchi hali hech narsa yubormagan (bazada yozuv yo'q) */
export type HomeworkState = HomeworkStatus | "missing";

export const HOMEWORK_STATE_LABELS: Record<HomeworkState, string> = {
  missing: "Topshirilmagan",
  submitted: "Tekshirilmoqda",
  returned: "Qayta ishlash kerak",
  graded: "Baholangan",
};

export const HOMEWORK_STATE_BADGE: Record<HomeworkState, "secondary" | "warning" | "danger" | "success"> = {
  missing: "secondary",
  submitted: "warning",
  returned: "danger",
  graded: "success",
};

/** 100 ball uchun beriladigan coin — sukut qiymati */
export const DEFAULT_HOMEWORK_COINS = 20;
export const HOMEWORK_MAX_TEXT = 20000;
export const HOMEWORK_MAX_LINKS = 5;
export const HOMEWORK_MAX_FILES = 5;
export const HOMEWORK_MAX_FILE_MB = 50;
/** Bajariladigan fayllar qabul qilinmaydi */
export const HOMEWORK_BLOCKED_EXTENSIONS = [".exe", ".bat", ".cmd", ".msi", ".scr", ".apk", ".sh", ".com", ".vbs"];

/** Ballga mutanosib coin taklifi; kechikkan javobga sukut bo'yicha coin berilmaydi */
export function suggestHomeworkCoins(score: number, coinsReward: number, isLate: boolean): number {
  if (isLate) return 0;
  const safeScore = Math.max(0, Math.min(100, score));
  return Math.round((coinsReward * safeScore) / 100);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/** Muddat holati: o'tganmi va qancha qolgani ("2 kun qoldi", "3 soat qoldi") */
export function describeDue(dueAt: string | Date | null | undefined, now: Date = new Date()): {
  overdue: boolean;
  remaining: string;
} | null {
  if (!dueAt) return null;
  const diffMs = new Date(dueAt).getTime() - now.getTime();
  if (Number.isNaN(diffMs)) return null;
  if (diffMs <= 0) return { overdue: true, remaining: "Muddat o'tgan" };
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours >= 48) return { overdue: false, remaining: `${Math.floor(hours / 24)} kun qoldi` };
  if (hours >= 1) return { overdue: false, remaining: `${hours} soat qoldi` };
  return { overdue: false, remaining: `${Math.max(1, Math.floor(diffMs / 60_000))} daqiqa qoldi` };
}
