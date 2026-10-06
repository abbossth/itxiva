"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { MENTOR_LINKS, STUDENT_LINKS, SIDEBAR_COOKIE, isNavLinkActive, type NavBadges } from "./nav-links";
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
  /** Holat cookie'da saqlanadi va serverda o'qiladi — sahifa ochilganda sidebar "sakramaydi" */
  defaultCollapsed?: boolean;
}

export function DesktopNav({ user, badges = {}, defaultCollapsed = false }: DesktopNavProps) {
  const pathname = usePathname();
  const role = user.role;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const links = role === "mentor" ? MENTOR_LINKS : STUDENT_LINKS;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "hidden md:flex flex-col shrink-0 border-r border-slate-200/80 dark:border-slate-800/80 sticky top-16 h-[calc(100dvh-4rem)] overflow-y-auto overflow-x-hidden justify-between bg-white/40 dark:bg-bg/40 backdrop-blur-xs select-none transition-[width] duration-200",
        collapsed ? "w-[76px] p-3" : "w-64 p-4"
      )}
    >
      <nav aria-label="Asosiy menyu" className="space-y-1">
        <div className={cn("flex items-center mb-1", collapsed ? "justify-center" : "justify-between pl-3")}>
          {!collapsed && (
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Asosiy menyu
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Menyuni yoyish" : "Menyuni yig'ish"}
            aria-expanded={!collapsed}
            title={collapsed ? "Menyuni yoyish" : "Menyuni yig'ish"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {links.map((link) => {
          const Icon = link.icon;
          const isActive = isNavLinkActive(link.href, pathname);
          const count = link.badge ? badges[link.badge] ?? 0 : 0;

          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              aria-label={collapsed ? (count > 0 ? `${link.label} (${count})` : link.label) : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl text-sm font-medium transition-colors select-none min-h-[44px]",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500",
                collapsed ? "justify-center px-0" : "px-3.5 py-2.5",
                isActive
                  ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              )}
            >
              {isActive && (
                <span aria-hidden className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-teal-600 dark:bg-teal-400" />
              )}
              <Icon
                className={cn(
                  "w-5 h-5 shrink-0 transition-colors",
                  isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400"
                )}
              />
              {!collapsed && <span className="truncate flex-1">{link.label}</span>}
              {count > 0 &&
                (collapsed ? (
                  <span aria-hidden className="absolute top-1.5 right-2.5 h-2 w-2 rounded-full bg-amber-500" />
                ) : (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold font-mono flex items-center justify-center">
                    {count}
                  </span>
                ))}
              {!collapsed && <NavPending />}
            </Link>
          );
        })}
      </nav>

      {/* User profile summary block at bottom of sidebar */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80 mt-4">
        <Link
          href="/profile"
          title={collapsed ? user.fullName : undefined}
          className={cn(
            "flex items-center gap-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group",
            collapsed ? "justify-center p-1.5" : "p-2.5"
          )}
        >
          <Avatar name={user.fullName} size="sm" variant={role === "mentor" ? "gold" : "primary"} />
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                {user.fullName}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">@{user.login}</span>
                <Badge variant={role === "mentor" ? "gold" : "teal"} className="text-[9px] py-0 px-1.5 leading-tight">
                  {role === "mentor" ? "Mentor" : "O'quvchi"}
                </Badge>
              </div>
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}
