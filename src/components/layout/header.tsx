"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/actions/auth.actions";

interface HeaderProps {
  user: {
    fullName: string;
    role: "mentor" | "student";
    login: string;
  };
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0B1220]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Logo size="sm" href={user.role === "mentor" ? "/mentor/groups" : "/lessons"} />

        <div className="flex items-center gap-3">
          <ThemeToggle />

          {/* User badge & name */}
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-xs">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                {user.fullName}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                @{user.login}
              </span>
            </div>
            <Badge variant={user.role === "mentor" ? "gold" : "default"} className="ml-1 text-[10px] py-0 px-2">
              {user.role === "mentor" ? "Mentor" : "O'quvchi"}
            </Badge>
          </div>

          {/* Logout button */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center justify-center cursor-pointer"
              aria-label="Tizimdan chiqish"
              title="Chiqish"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
