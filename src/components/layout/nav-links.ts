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
}

export type NavBadgeKind = "orders" | "homework";
export type NavBadges = Partial<Record<NavBadgeKind, number>>;

export const MENTOR_LINKS: NavLink[] = [
  { href: "/", label: "Bosh sahifa", shortLabel: "Bosh", icon: LayoutDashboard, primary: true },
  { href: "/mentor/groups", label: "Guruhlar", shortLabel: "Guruhlar", icon: Users },
  { href: "/mentor/lessons", label: "Darslar boshqaruvi", shortLabel: "Darslar", icon: BookOpen, primary: true },
  { href: "/mentor/attendance", label: "Davomat jurnali", shortLabel: "Davomat", icon: QrCode, primary: true },
  { href: "/mentor/homework", label: "Uyga vazifalar", shortLabel: "Vazifa", icon: ClipboardCheck, primary: true, badge: "homework" },
  { href: "/mentor/orders", label: "Buyurtmalar", shortLabel: "Buyurtma", icon: PackageCheck, badge: "orders" },
  { href: "/mentor/exams", label: "Imtihonlar", shortLabel: "Imtihon", icon: GraduationCap },
  { href: "/mentor/reports", label: "Hisobotlar", shortLabel: "Hisobot", icon: BarChart3 },
  { href: "/mentor/shop", label: "Do'kon mahsulotlari", shortLabel: "Do'kon", icon: ShoppingBag },
  { href: "/leaderboard", label: "Reyting", shortLabel: "Reyting", icon: Trophy },
  { href: "/mentor/import", label: "Excel import", shortLabel: "Import", icon: FileSpreadsheet },
  { href: "/mentor/audit", label: "Audit loglar", shortLabel: "Audit", icon: ShieldCheck },
];

export const STUDENT_LINKS: NavLink[] = [
  { href: "/", label: "Bosh sahifa", shortLabel: "Bosh", icon: LayoutDashboard, primary: true },
  { href: "/lessons", label: "Darslarim", shortLabel: "Darslar", icon: BookOpen, primary: true },
  { href: "/homework", label: "Vazifalarim", shortLabel: "Vazifa", icon: ClipboardCheck, primary: true, badge: "homework" },
  { href: "/exams", label: "Imtihonlarim", shortLabel: "Imtihon", icon: GraduationCap },
  { href: "/attendance", label: "Davomat", shortLabel: "Davomat", icon: QrCode, primary: true },
  { href: "/shop", label: "Coin do'koni", shortLabel: "Do'kon", icon: ShoppingBag, badge: "orders" },
  { href: "/leaderboard", label: "Reyting", shortLabel: "Reyting", icon: Trophy },
  { href: "/profile", label: "Mening profilim", shortLabel: "Profil", icon: User },
];

export function isNavLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
