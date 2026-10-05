"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, BookOpen, Trophy, ShieldCheck, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  role: "mentor" | "student";
}

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname();

  const mentorLinks = [
    { href: "/mentor/groups", label: "Guruhlar", icon: Users },
    { href: "/mentor/lessons", label: "Darslar", icon: BookOpen },
    { href: "/mentor/exams", label: "Imtihon", icon: GraduationCap },
    { href: "/leaderboard", label: "Reyting", icon: Trophy },
    { href: "/mentor/audit", label: "Audit", icon: ShieldCheck },
  ];

  const studentLinks = [
    { href: "/lessons", label: "Darslar", icon: BookOpen },
    { href: "/exams", label: "Imtihon", icon: GraduationCap },
    { href: "/leaderboard", label: "Reyting", icon: Trophy },
  ];

  const links = role === "mentor" ? mentorLinks : studentLinks;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-[#0B1220]/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
      aria-label="Pastki navigatsiya"
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
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
                "flex flex-col items-center justify-center flex-1 h-full min-h-[48px] min-w-[48px] py-1 transition-all select-none active:scale-95",
                isActive
                  ? "text-teal-600 dark:text-teal-400 font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <div
                className={cn(
                  "p-1 rounded-xl transition-colors",
                  isActive ? "bg-teal-500/10 text-teal-600 dark:text-teal-400" : ""
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
