// E'lonlar: auditoriya va muddat qoidalari, mavzular va bayram shablonlari. Brauzerda ham ishlatiladi.

export type AnnouncementTheme = "info" | "important" | "holiday" | "celebration";
export type AnnouncementAudience = "all" | "groups" | "grades";

export const ANNOUNCEMENT_LIMITS = { title: 160, body: 5000, images: 8, files: 10, links: 10 } as const;

export const THEME_META: Record<AnnouncementTheme, { label: string; emoji: string; gradient: string }> = {
  info: { label: "Ma'lumot", emoji: "📢", gradient: "from-sky-500 to-indigo-600" },
  important: { label: "Muhim", emoji: "⚠️", gradient: "from-amber-500 to-rose-600" },
  holiday: { label: "Bayram", emoji: "🎉", gradient: "from-fuchsia-500 via-rose-500 to-amber-400" },
  celebration: { label: "Tabrik", emoji: "🏆", gradient: "from-emerald-500 to-teal-600" },
};

/** O'quvchi e'lon auditoriyasiga kiradimi */
export function audienceIncludes(
  a: { audience: AnnouncementAudience; groupIds?: { toString(): string }[]; grades?: number[] },
  student: { groupId: string | null; grade: number | null }
): boolean {
  if (a.audience === "all") return true;
  if (a.audience === "groups") return Boolean(student.groupId) && (a.groupIds ?? []).some((g) => g.toString() === student.groupId);
  return student.grade !== null && (a.grades ?? []).includes(student.grade);
}

/** E'lon hozir ko'rsatiladimi: nashr etilgan va muddat ichida */
export function announcementActive(a: { status: string; startsAt: Date | string; endsAt: Date | string | null }, now = new Date()): boolean {
  if (a.status !== "published") return false;
  if (new Date(a.startsAt).getTime() > now.getTime()) return false;
  return !a.endsAt || new Date(a.endsAt).getTime() > now.getTime();
}

export type AnnouncementPhase = "draft" | "scheduled" | "active" | "ended" | "archived";

/** E'lon holati (qoralama, rejalashtirilgan, faol, muddati tugagan, arxiv) */
export function announcementPhase(a: { status: string; startsAt: Date | string; endsAt: Date | string | null }, now = new Date()): AnnouncementPhase {
  if (a.status === "archived") return "archived";
  if (a.status !== "published") return "draft";
  if (new Date(a.startsAt).getTime() > now.getTime()) return "scheduled";
  if (a.endsAt && new Date(a.endsAt).getTime() <= now.getTime()) return "ended";
  return "active";
}

export interface AnnouncementTemplate {
  id: string;
  label: string;
  title: string;
  body: string;
  theme: AnnouncementTheme;
  /** Necha kun ko'rsatiladi */
  days: number;
}

/** Tayyor shablonlar: bayramlar va tez-tez kerak bo'ladigan e'lonlar (mentor matnni o'zgartirishi mumkin) */
export const ANNOUNCEMENT_TEMPLATES: AnnouncementTemplate[] = [
  {
    id: "newyear",
    label: "🎄 Yangi yil",
    title: "Yangi yil muborak! 🎄",
    body: "Aziz o'quvchilar!\nKirib kelayotgan Yangi yil bilan chin dildan tabriklaymiz! Yangi yil sizga yangi bilimlar, katta g'alabalar va ezgu niyatlaringiz ijobatini olib kelsin.\n\nBu yil ham birga o'rganamiz, birga o'samiz! 🚀",
    theme: "holiday",
    days: 5,
  },
  {
    id: "navruz",
    label: "🌷 Navro'z",
    title: "Navro'z bayrami muborak! 🌷",
    body: "Aziz o'quvchilar!\nYangilanish va uyg'onish bayrami — Navro'z bilan tabriklaymiz! Bahor kabi yangi g'oyalar, yangi loyihalar va yangi marralar sizni kutmoqda.",
    theme: "holiday",
    days: 4,
  },
  {
    id: "ramazon",
    label: "🌙 Ramazon hayiti",
    title: "Ramazon hayiti muborak! 🌙",
    body: "Aziz o'quvchilar va ularning oilalari!\nRamazon hayiti bilan chin qalbdan tabriklaymiz. Xonadoningizga tinchlik, qut-baraka va shodlik tilaymiz.",
    theme: "holiday",
    days: 3,
  },
  {
    id: "qurbon",
    label: "🕌 Qurbon hayiti",
    title: "Qurbon hayiti muborak! 🕌",
    body: "Aziz o'quvchilar va ularning oilalari!\nQurbon hayiti bilan muborakbod etamiz. Duolaringiz ijobat bo'lsin, xonadoningiz baxt va farovonlikka to'lsin.",
    theme: "holiday",
    days: 3,
  },
  {
    id: "mustaqillik",
    label: "🇺🇿 Mustaqillik kuni",
    title: "Mustaqillik kuni muborak! 🇺🇿",
    body: "Aziz o'quvchilar!\nVatanimiz mustaqilligi bayrami bilan tabriklaymiz! Kelajak — bilimli va ijodkor yoshlar qo'lida. Siz shu kelajaksiz!",
    theme: "holiday",
    days: 3,
  },
  {
    id: "teachers",
    label: "📚 O'qituvchilar kuni",
    title: "O'qituvchilar va murabbiylar kuni! 📚",
    body: "Bugun ustozlarimizni tabriklash kuni! Sizga bilim berayotgan barcha ustozlarga minnatdorchilik bildirishni unutmang 🙌",
    theme: "celebration",
    days: 2,
  },
  {
    id: "women",
    label: "🌸 8-mart",
    title: "8-mart — Xalqaro xotin-qizlar kuni muborak! 🌸",
    body: "Aziz qizlarimiz, onalarimiz va opa-singillarimiz!\nBahor bayrami bilan tabriklaymiz. Hayotingiz gullar kabi chiroyli va quvonchga to'la bo'lsin!",
    theme: "holiday",
    days: 2,
  },
  {
    id: "exam",
    label: "📝 Imtihon eslatmasi",
    title: "Imtihon yaqinlashmoqda 📝",
    body: "Hurmatli o'quvchilar!\nImtihon sanasi: ...\nVaqti: ...\n\nTayyorgarlik uchun darslar va testlarni qayta ko'rib chiqing. Omad!",
    theme: "important",
    days: 7,
  },
  {
    id: "info",
    label: "📢 Oddiy e'lon",
    title: "",
    body: "",
    theme: "info",
    days: 7,
  },
];
