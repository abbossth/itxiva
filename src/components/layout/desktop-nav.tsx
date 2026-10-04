"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, BookOpen, Trophy, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface DesktopNavProps {
  role: "mentor" | "student";
}

export function DesktopNav({ role }: DesktopNavProps) {
  const pathname = usePathname();

  const mentorLinks = [
    { href: "/mentor/groups", label: "Guruhlar", icon: Users },
    { href: "/mentor/lessons", label: "Darslar boshqaruvi", icon: BookOpen },
    { href: "/leaderboard", label: "Reyting", icon: Trophy },
    { href: "/mentor/audit", label: "Audit loglar", icon: ShieldCheck },
  ];

  const studentLinks = [
    { href: "/lessons", label: "Darslarim", icon: BookOpen },
    { href: "/leaderboard", label: "Reyting", icon: Trophy },
  ];

  const links = role === "mentor" ? mentorLinks : studentLinks;

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-slate-200/80 dark:border-slate-800/80 p-4 space-y-1">
      <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 py-2">
        Menyu
      </div>
      {links.map((link) => {
        const Icon = link.icon;
        const isActive =
          link.href === "/leaderboard"
            ? pathname === "/leaderboard"
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all select-none min-h-[44px]",
              isActive
                ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            )}
          >
            <Icon className={cn("w-5 h-5", isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-400")} />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}
