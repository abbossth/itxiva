"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, User as UserIcon, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SearchButton } from "@/components/layout/command-palette-trigger";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/actions/auth.actions";

interface HeaderProps {
  user: {
    fullName: string;
    role: "mentor" | "student";
    login: string;
  };
}

export function Header({ user }: HeaderProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-bg/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Logo size="sm" href="/" animated />

        <div className="flex items-center gap-2.5 sm:gap-3">
          <SearchButton />
          <ThemeToggle />

          {/* Desktop User badge & name */}
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

          {/* Desktop Logout button */}
          <form action={logoutAction} className="hidden sm:block">
            <button
              type="submit"
              className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center justify-center cursor-pointer"
              aria-label="Tizimdan chiqish"
              title="Chiqish"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </form>

          {/* Mobile Profile Trigger Button */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Mening profilim va sozlamalar"
            className="sm:hidden p-1 min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            {/* Bosh harflar ekran o'quvchisi uchun yashirin — tugma nomi aria-label'dan olinadi */}
            <span aria-hidden="true">
              <Avatar
                name={user.fullName}
                size="sm"
                variant={user.role === "mentor" ? "gold" : "primary"}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Profile & Actions BottomSheet */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Foydalanuvchi hisobi"
      >
        <div className="space-y-5 pb-2">
          {/* User Info Card */}
          <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
            <Avatar
              name={user.fullName}
              size="lg"
              variant={user.role === "mentor" ? "gold" : "primary"}
            />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {user.fullName}
              </span>
              <span className="text-xs text-slate-500 font-mono">@{user.login}</span>
              <div className="mt-1.5">
                <Badge variant={user.role === "mentor" ? "gold" : "default"}>
                  {user.role === "mentor" ? "Mentor" : "O'quvchi"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Navigation Links in Sheet */}
          <div className="space-y-1">
            {user.role === "student" && (
              <Link
                href="/profile"
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors min-h-[44px]"
              >
                <UserIcon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Mening profilim</span>
              </Link>
            )}
            {user.role === "mentor" && (
              <Link
                href="/mentor/audit"
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors min-h-[44px]"
              >
                <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Amallar tarixi</span>
              </Link>
            )}
          </div>

          {/* Logout Action */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="danger"
                className="w-full justify-center gap-2 font-semibold"
              >
                <LogOut className="w-4 h-4" />
                <span>Tizimdan chiqish</span>
              </Button>
            </form>
          </div>
        </div>
      </BottomSheet>
    </header>
  );
}
