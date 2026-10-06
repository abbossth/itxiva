// Guruh dars jadvali: haftaning qaysi kunlari va soat nechadan nechagacha.
// Kunlar ISO tartibida: 1 = Dushanba ... 7 = Yakshanba. Barcha hisob-kitoblar Asia/Tashkent bo'yicha.

export interface GroupSchedule {
  days: number[];
  startTime: string; // "16:30"
  endTime: string; // "18:00"
}

export const ODD_DAYS = [1, 3, 5]; // Toq: Dushanba-Chorshanba-Juma
export const EVEN_DAYS = [2, 4, 6]; // Juft: Seshanba-Payshanba-Shanba

export const UZ_WEEKDAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
export const UZ_WEEKDAYS_SHORT = ["Du", "Se", "Chor", "Pay", "Ju", "Sha", "Yak"];

const APP_TIME_ZONE = "Asia/Tashkent";
// Toshkent yil bo'yi UTC+5 (yozgi vaqtga o'tmaydi)
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const tashkentFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function getTashkentParts(date: Date | string | number = new Date()) {
  const parts: Record<string, string> = {};
  for (const p of tashkentFormatter.formatToParts(new Date(date))) parts[p.type] = p.value;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** "2026-10-06" (Toshkent sanasi) */
export function toDateKey(date: Date | string | number = new Date()): string {
  return getTashkentParts(date).dateKey;
}

/** Toshkent sanasi va vaqtidan haqiqiy Date yasaydi: ("2026-10-06", "16:30") */
export function dateFromKey(dateKey: string, time = "00:00"): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - TASHKENT_OFFSET_MS);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const d = dateFromKey(dateKey, "12:00");
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function normalizeTime(raw: string): string | null {
  const m = raw.trim().replace(/[.;]/g, ":").match(TIME_RE);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

export function isValidSchedule(s?: Partial<GroupSchedule> | null): s is GroupSchedule {
  return Boolean(
    s &&
      Array.isArray(s.days) &&
      s.days.length > 0 &&
      s.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
      typeof s.startTime === "string" &&
      typeof s.endTime === "string" &&
      TIME_RE.test(s.startTime) &&
      TIME_RE.test(s.endTime) &&
      timeToMinutes(s.endTime) > timeToMinutes(s.startTime)
  );
}

/**
 * Excel'dagi jadval matnini tahlil qiladi:
 * "Axmedov Abbosbek\n(Dushanba-Chorshanba-Juma) 16:30-18:00", "Juft 13:30-15:00", "Toq 15:00-16:30"
 */
export function parseScheduleText(text: string): GroupSchedule | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  const timeMatch = lower.match(/(\d{1,2}[:.;]\d{2})\s*[-–—]\s*(\d{1,2}[:.;]\d{2})/);
  if (!timeMatch) return null;
  const startTime = normalizeTime(timeMatch[1]);
  const endTime = normalizeTime(timeMatch[2]);
  if (!startTime || !endTime) return null;

  const days = new Set<number>();
  // Uzunroq nomlar avval tekshiriladi ("shanba" so'zi "dushanba" ichida ham uchraydi)
  let rest = lower;
  for (const [name, day] of [
    ["yakshanba", 7],
    ["chorshanba", 3],
    ["payshanba", 4],
    ["dushanba", 1],
    ["seshanba", 2],
    ["shanba", 6],
    ["juma", 5],
  ] as const) {
    if (rest.includes(name)) {
      days.add(day);
      rest = rest.split(name).join(" ");
    }
  }
  if (days.size === 0) {
    if (/\bjuft\b/.test(lower)) EVEN_DAYS.forEach((d) => days.add(d));
    else if (/\btoq\b/.test(lower)) ODD_DAYS.forEach((d) => days.add(d));
  }
  if (days.size === 0) return null;

  const schedule = { days: [...days].sort((a, b) => a - b), startTime, endTime };
  return isValidSchedule(schedule) ? schedule : null;
}

function sameDays(a: number[], b: number[]) {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

/** "Du-Chor-Ju · 16:30–18:00" */
export function formatSchedule(s?: Partial<GroupSchedule> | null): string {
  if (!isValidSchedule(s)) return "Jadval belgilanmagan";
  const days = [...s.days].sort((a, b) => a - b);
  return `${days.map((d) => UZ_WEEKDAYS_SHORT[d - 1]).join("-")} · ${s.startTime}–${s.endTime}`;
}

export function scheduleKind(s?: Partial<GroupSchedule> | null): "toq" | "juft" | "custom" {
  if (!isValidSchedule(s)) return "custom";
  const days = [...s.days].sort((a, b) => a - b);
  if (sameDays(days, ODD_DAYS)) return "toq";
  if (sameDays(days, EVEN_DAYS)) return "juft";
  return "custom";
}

/** Bugun (yoki berilgan kunda) shu guruhning darsi bormi */
export function hasLessonOn(s: Partial<GroupSchedule> | null | undefined, date: Date | string | number = new Date()) {
  return isValidSchedule(s) && s.days.includes(getTashkentParts(date).weekday);
}

/** Ayni damda dars ketayaptimi (boshlanishidan 15 daqiqa oldin ham "hozir" hisoblanadi) */
export function isLessonNow(s: Partial<GroupSchedule> | null | undefined, now: Date = new Date()) {
  if (!isValidSchedule(s)) return false;
  const { weekday, minutes } = getTashkentParts(now);
  return (
    s.days.includes(weekday) &&
    minutes >= timeToMinutes(s.startTime) - 15 &&
    minutes <= timeToMinutes(s.endTime)
  );
}

/** [fromKey, toKey] oralig'idagi barcha dars sanalari ("YYYY-MM-DD") */
export function getLessonDatesInRange(
  s: Partial<GroupSchedule> | null | undefined,
  fromKey: string,
  toKey: string
): string[] {
  if (!isValidSchedule(s)) return [];
  const result: string[] = [];
  let key = fromKey;
  // 400 kundan ortiq oraliq so'ralmaydi
  for (let i = 0; i < 400 && key <= toKey; i++) {
    if (s.days.includes(getTashkentParts(dateFromKey(key, "12:00")).weekday)) result.push(key);
    key = addDaysToKey(key, 1);
  }
  return result;
}

/** Keyingi dars boshlanish vaqti (hozir ketayotgan dars ham qaytariladi) */
export function getNextLesson(
  s: Partial<GroupSchedule> | null | undefined,
  now: Date = new Date()
): { start: Date; end: Date; isNow: boolean; label: string } | null {
  if (!isValidSchedule(s)) return null;
  const todayKey = toDateKey(now);
  for (let i = 0; i < 8; i++) {
    const key = addDaysToKey(todayKey, i);
    const start = dateFromKey(key, s.startTime);
    const end = dateFromKey(key, s.endTime);
    const weekday = getTashkentParts(start).weekday;
    if (!s.days.includes(weekday) || end.getTime() <= now.getTime()) continue;
    const isNow = start.getTime() <= now.getTime();
    const dayLabel = i === 0 ? "Bugun" : i === 1 ? "Ertaga" : UZ_WEEKDAYS[weekday - 1];
    return { start, end, isNow, label: `${dayLabel} ${s.startTime}–${s.endTime}` };
  }
  return null;
}

/** Berilgan dars sanasidan KEYINGI birinchi dars boshlanishi — uyga vazifa muddati uchun */
export function getNextLessonAfter(
  s: Partial<GroupSchedule> | null | undefined,
  lessonDateKey: string
): Date | null {
  if (!isValidSchedule(s)) return null;
  const [next] = getLessonDatesInRange(s, addDaysToKey(lessonDateKey, 1), addDaysToKey(lessonDateKey, 8));
  return next ? dateFromKey(next, s.startTime) : null;
}

/** <input type="datetime-local"> uchun qiymat — brauzer qaysi vaqt mintaqasida bo'lmasin, Toshkent vaqti bilan */
export function toTashkentInputValue(date: Date | string | number): string {
  const { dateKey, minutes } = getTashkentParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateKey}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "2026-10-09T16:30" (Toshkent vaqti) -> Date; noto'g'ri qiymatda null */
export function fromTashkentInputValue(value: string): Date | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return null;
  const date = dateFromKey(m[1], m[2]);
  return Number.isNaN(date.getTime()) ? null : date;
}
