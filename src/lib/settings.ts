import { cache } from "react";
import { connectToDatabase } from "@/lib/db/connect";
import { AppSettings } from "@/lib/db/models/app-settings.model";
import { DEFAULT_ACCENT, isAccentId } from "@/lib/theme-accents";
import { toDateKey } from "@/lib/schedule";
import { parseGamification, type GamificationSettings } from "@/lib/gamification/config";
import { parseAmbience, type AmbienceSettings } from "@/lib/ambience";

export interface AppSettingsData {
  academicYear: string;
  quarter: number;
  accent: string;
  /** O'quvchilar o'z shaxsiy ma'lumotlarini tahrirlay oladi (sukutda yopiq) */
  studentProfileEdit: boolean;
  gamification: GamificationSettings;
  ambience: AmbienceSettings;
}

const YEAR_RE = /^(\d{4})-(\d{4})$/;

export function isAcademicYear(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = YEAR_RE.exec(value);
  return Boolean(m) && Number(m![2]) === Number(m![1]) + 1;
}

/** Sozlanmagan bo'lsa: o'quv yili 1-sentabrdan boshlanadi */
export function currentAcademicYear(): string {
  const [y, m] = toDateKey().split("-").map(Number);
  const start = m >= 9 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** Tanlash uchun o'quv yillari: o'tgan yildan ikki yil keyingigacha (+ saqlangan qiymat) */
export function academicYearOptions(selected?: string): string[] {
  const start = Number(currentAcademicYear().slice(0, 4));
  const years = [-1, 0, 1, 2].map((d) => `${start + d}-${start + d + 1}`);
  if (selected && !years.includes(selected)) years.unshift(selected);
  return years;
}

export function parseQuarter(value: unknown, fallback: number): number {
  const q = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isInteger(q) && q >= 1 && q <= 4 ? q : fallback;
}

// Sozlamalar juda kam o'zgaradi, lekin deyarli har sahifa va amal ularni o'qiydi: server nusxasida 10 soniya
// saqlanadi (bazaga har so'rovda murojaat bo'lmasin). Shu nusxada saqlanganda darhol yangilanadi
// (forgetAppSettings), ikkinchi nusxada — ko'pi bilan 10 soniyada.
const SETTINGS_TTL_MS = process.env.VITEST ? 0 : 10_000;
let settingsCache: { at: number; p: Promise<AppSettingsData> } | null = null;

export function forgetAppSettings() {
  settingsCache = null;
}

/** Platforma sozlamalari (bitta so'rov davomida bazadan bir marta, server nusxasida — 10 soniyada bir marta o'qiladi) */
export const getAppSettings = cache(async (): Promise<AppSettingsData> => {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.p;
  const p = loadAppSettings();
  settingsCache = { at: now, p };
  p.catch(() => {
    if (settingsCache?.p === p) settingsCache = null;
  });
  return p;
});

async function loadAppSettings(): Promise<AppSettingsData> {
  await connectToDatabase();
  const doc = await AppSettings.findOne({ key: "global" }).lean();
  return {
    academicYear: isAcademicYear(doc?.academicYear) ? doc!.academicYear! : currentAcademicYear(),
    quarter: parseQuarter(doc?.quarter, 1),
    accent: isAccentId(doc?.accent) ? doc!.accent! : DEFAULT_ACCENT,
    studentProfileEdit: doc?.studentProfileEdit === true,
    gamification: parseGamification(doc?.gamification),
    ambience: parseAmbience(doc?.ambience),
  };
}
