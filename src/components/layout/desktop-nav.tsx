"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENTOR_LINKS, STUDENT_LINKS, isNavLinkActive, type NavBadges } from "./nav-links";
import { NavPending } from "./nav-pending";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface DesktopNavProps {
  user: {
    fullName: string;
    role: "mentor" | "student";
    login: string;
    totalCoins?: number;
  };
  /** Havolalar yonidagi sonlar (yangi buyurtmalar, tekshirilmagan / topshirilmagan vazifalar) */
  badges?: NavBadges;
}

export function DesktopNav({ user, badges = {} }: DesktopNavProps) {
  const pathname = usePathname();
  const role = user.role;

  const links = role === "mentor" ? MENTOR_LINKS : STUDENT_LINKS;

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-slate-200/80 dark:border-slate-800/80 p-4 sticky top-16 h-[calc(100dvh-4rem)] overflow-y-auto justify-between bg-white/40 dark:bg-[#0B1220]/40 backdrop-blur-xs select-none">
      <div className="space-y-1">
        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-3 py-2">
          Asosiy menyu
        </div>

        {links.map((link) => {
          const Icon = link.icon;
          const isActive = isNavLinkActive(link.href, pathname);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all select-none min-h-[44px]",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500",
                isActive
                  ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold border-l-4 border-teal-600 dark:border-teal-400 pl-3 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 shrink-0 transition-colors",
                  isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-400"
                )}
              />
              <span className="truncate flex-1">{link.label}</span>
              {link.badge && (badges[link.badge] ?? 0) > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {badges[link.badge]}
                </span>
              )}
              <NavPending />
            </Link>
          );
        })}
      </div>

      {/* User profile summary block at bottom of sidebar */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80 mt-4">
        <Link
          href={role === "student" ? "/profile" : "/mentor/groups"}
          className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group"
        >
          <Avatar
            name={user.fullName}
            size="sm"
            variant={role === "mentor" ? "gold" : "primary"}
          />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {user.fullName}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-slate-500 truncate">@{user.login}</span>
              <Badge
                variant={role === "mentor" ? "gold" : "teal"}
                className="text-[9px] py-0 px-1.5 leading-tight"
              >
                {role === "mentor" ? "Mentor" : "O'quvchi"}
              </Badge>
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
