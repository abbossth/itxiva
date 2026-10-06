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
  type LucideIcon,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Mobil pastki panelda ko'rinadi (qolganlari "Yana" ichida) */
  primary?: boolean;
  /** Buyurtmalar soni ko'rsatiladigan havola */
  badge?: "orders";
}

export const MENTOR_LINKS: NavLink[] = [
  { href: "/mentor/groups", label: "Guruhlar", shortLabel: "Guruhlar", icon: Users, primary: true },
  { href: "/mentor/lessons", label: "Darslar boshqaruvi", shortLabel: "Darslar", icon: BookOpen, primary: true },
  { href: "/mentor/attendance", label: "Davomat jurnali", shortLabel: "Davomat", icon: QrCode, primary: true },
  { href: "/mentor/orders", label: "Buyurtmalar", shortLabel: "Buyurtma", icon: PackageCheck, primary: true, badge: "orders" },
  { href: "/mentor/exams", label: "Imtihonlar", shortLabel: "Imtihon", icon: GraduationCap },
  { href: "/mentor/reports", label: "Hisobotlar", shortLabel: "Hisobot", icon: BarChart3 },
  { href: "/mentor/shop", label: "Do'kon mahsulotlari", shortLabel: "Do'kon", icon: ShoppingBag },
  { href: "/leaderboard", label: "Reyting", shortLabel: "Reyting", icon: Trophy },
  { href: "/mentor/import", label: "Excel import", shortLabel: "Import", icon: FileSpreadsheet },
  { href: "/mentor/audit", label: "Audit loglar", shortLabel: "Audit", icon: ShieldCheck },
];

export const STUDENT_LINKS: NavLink[] = [
  { href: "/lessons", label: "Darslarim", shortLabel: "Darslar", icon: BookOpen, primary: true },
  { href: "/exams", label: "Imtihonlarim", shortLabel: "Imtihon", icon: GraduationCap, primary: true },
  { href: "/attendance", label: "Davomat", shortLabel: "Davomat", icon: QrCode, primary: true },
  { href: "/shop", label: "Coin do'koni", shortLabel: "Do'kon", icon: ShoppingBag, primary: true, badge: "orders" },
  { href: "/leaderboard", label: "Reyting", shortLabel: "Reyting", icon: Trophy },
  { href: "/profile", label: "Mening profilim", shortLabel: "Profil", icon: User },
];

export function isNavLinkActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
