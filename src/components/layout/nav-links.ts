import {
  Users,
  BookOpen,
  Trophy,
  ShieldCheck,
  GraduationCap,
  QrCode,
  User,
  BarChart3,
  ShoppingBag,
  PackageCheck,
  FileSpreadsheet,
  ClipboardCheck,
  LayoutDashboard,
  Package,
  Settings,
  SlidersHorizontal,
  Target,
  Medal,
  ListChecks,
  Inbox,
  Coins,
  type LucideIcon,
} from "lucide-react";

/** Desktop sidebar yig'ilgan/yoyilgan holati shu cookie'da saqlanadi ("1" — yig'ilgan) */
export const SIDEBAR_COOKIE = "itxiva_sidebar";

export interface NavLink {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Mobil pastki panelda ko'rinadi (qolganlari "Yana" ichida) */
  primary?: boolean;
  /** Son ko'rsatiladigan havola: buyurtmalar yoki uyga vazifalar */
  badge?: NavBadgeKind;
  /** Sondagi ishlar ro'yxati: son bosilganda shu sahifa ochiladi (bo'lim sahifasining o'zi emas) */
  badgeHref?: string;
  /** Shu bo'limga kiradigan boshqa sahifalar: ular ochiq bo'lganda ham havola faol ko'rinadi */
  match?: string[];
  /** Faqat gamifikatsiya yoqilganda ko'rinadi */
  gamification?: boolean;
  /** Gamifikatsiya yoqilganda mobil pastki paneldagi o'rni (`primary` o'rniga) */
  primaryWithGamification?: boolean;
}

export type NavBadgeKind = "orders" | "homework" | "quests";
export type NavBadges = Partial<Record<NavBadgeKind, number>>;

export const MENTOR_LINKS: NavLink[] = [
  { href: "/", label: "Bosh sahifa", shortLabel: "Bosh", icon: LayoutDashboard, primary: true },
  // Davomat guruhlar ichida: dars davomati sahifalari (/mentor/attendance/...) ham shu bo'limga kiradi
  { href: "/mentor/groups", label: "Guruhlar", shortLabel: "Guruhlar", icon: Users, primary: true, match: ["/mentor/attendance"] },
  // Uyga vazifalar darsning bir qismi: tekshirish sahifalari (/mentor/homework/...) ham shu bo'limga kiradi
  { href: "/mentor/lessons", label: "Darslar", shortLabel: "Darslar", icon: BookOpen, primary: true, badge: "homework", badgeHref: "/mentor/homework", match: ["/mentor/homework"] },
  { href: "/mentor/exams", label: "Imtihonlar", shortLabel: "Imtihon", icon: GraduationCap, primary: true },
  { href: "/mentor/quests", label: "Topshiriqlar", shortLabel: "Topshiriq", icon: Target, badge: "quests", badgeHref: "/mentor/quests/review", gamification: true },
  { href: "/mentor/reports", label: "Hisobotlar", shortLabel: "Hisobot", icon: BarChart3 },
  { href: "/leaderboard", label: "Reyting", shortLabel: "Reyting", icon: Trophy },
  { href: "/mentor/shop", label: "Do'kon", shortLabel: "Do'kon", icon: ShoppingBag, badge: "orders", match: ["/mentor/orders"] },
  { href: "/profile", label: "Sozlamalar", shortLabel: "Sozlama", icon: Settings, match: ["/mentor/settings", "/mentor/import", "/mentor/audit"] },
];

/** Bir bo'limning ichki sahifalari — sahifa tepasida tab sifatida ko'rinadi (SectionTabs) */
export interface NavTab {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: NavBadgeKind;
  gamification?: boolean;
}

export const MENTOR_SECTIONS: { label: string; tabs: NavTab[] }[] = [
  {
    label: "Topshiriqlar",
    tabs: [
      { href: "/mentor/quests", label: "Barcha topshiriqlar", icon: ListChecks, gamification: true },
      { href: "/mentor/quests/review", label: "Tekshiruv navbati", icon: Inbox, badge: "quests", gamification: true },
      { href: "/mentor/quests/badges", label: "Marralar va nishonlar", icon: Medal, gamification: true },
    ],
  },
  {
    label: "Hisobotlar",
    tabs: [
      { href: "/mentor/reports", label: "Umumiy", icon: BarChart3, gamification: true },
      { href: "/mentor/reports/economy", label: "Coin iqtisodiyoti", icon: Coins, gamification: true },
    ],
  },
  {
    label: "Do'kon",
    tabs: [
      { href: "/mentor/shop", label: "Mahsulotlar", icon: Package },
      { href: "/mentor/orders", label: "Buyurtmalar", icon: PackageCheck, badge: "orders" },
    ],
  },
  {
    label: "Sozlamalar",
    tabs: [
      { href: "/profile", label: "Profil va Telegram", icon: User },
      { href: "/mentor/settings", label: "Platforma", icon: SlidersHorizontal },
      { href: "/mentor/import", label: "Excel import", icon: FileSpreadsheet },
      { href: "/mentor/audit", label: "Amallar tarixi", icon: ShieldCheck },
    ],
  },
];

export const STUDENT_LINKS: NavLink[] = [
  { href: "/", label: "Bosh sahifa", shortLabel: "Bosh", icon: LayoutDashboard, primary: true },
  { href: "/lessons", label: "Darslarim", shortLabel: "Darslar", icon: BookOpen, primary: true },
  { href: "/homework", label: "Vazifalarim", shortLabel: "Vazifa", icon: ClipboardCheck, primary: true, primaryWithGamification: false, badge: "homework" },
  { href: "/exams", label: "Imtihonlarim", shortLabel: "Imtihon", icon: GraduationCap },
  { href: "/quests", label: "Topshiriqlar", shortLabel: "Topshiriq", icon: Target, gamification: true, primaryWithGamification: true },
  { href: "/attendance", label: "Davomat", shortLabel: "Davomat", icon: QrCode, primary: true },
  { href: "/shop", label: "Coin do'koni", shortLabel: "Do'kon", icon: ShoppingBag, badge: "orders" },
  { href: "/leaderboard", label: "Reyting", shortLabel: "Reyting", icon: Trophy },
  { href: "/achievements", label: "Yutuqlarim", shortLabel: "Yutuqlar", icon: Medal, gamification: true },
  { href: "/profile", label: "Mening profilim", shortLabel: "Profil", icon: User },
];

/** Rol bo'yicha menyu havolalari; gamifikatsiya o'chiq bo'lsa uning sahifalari ko'rinmaydi */
export function navLinksFor(role: "mentor" | "student", gamification: boolean): NavLink[] {
  return (role === "mentor" ? MENTOR_LINKS : STUDENT_LINKS)
    .filter((l) => gamification || !l.gamification)
    .map((l) => (gamification && l.primaryWithGamification !== undefined ? { ...l, primary: l.primaryWithGamification } : l));
}

/** Mentor bo'limlari (tablar); bo'sh qolgan bo'lim chiqarib tashlanadi */
export function mentorSectionsFor(gamification: boolean): { label: string; tabs: NavTab[] }[] {
  return MENTOR_SECTIONS.map((s) => ({ ...s, tabs: s.tabs.filter((t) => gamification || !t.gamification) })).filter((s) => s.tabs.length > 1);
}

export function isNavLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Havolaning o'zi yoki uning bo'limiga kiradigan sahifalardan biri ochiqmi */
export function isLinkActive(link: Pick<NavLink, "href" | "match">, pathname: string): boolean {
  return [link.href, ...(link.match ?? [])].some((href) => isNavLinkActive(href, pathname));
}
