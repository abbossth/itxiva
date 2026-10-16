"use client";

import { Lock, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PasswordForm } from "@/components/auth/password-form";
import { TelegramSection } from "@/components/profile/telegram-section";
import { CelebrationSetting } from "@/components/profile/celebration-setting";
import type { TelegramStatus } from "@/actions/telegram.actions";

interface ProfileViewProps {
  user: { fullName: string; login: string };
  telegram: TelegramStatus;
  celebrationsEnabled: boolean;
}

/** Mentor profili: hisob, Telegram, salyut va parol (o'quvchida — MyProfileView) */
export function ProfileView({ user, telegram, celebrationsEnabled }: ProfileViewProps) {
  return (
    // Mentorda sahifa tepasida bo'lim tablari bor — kontent ular bilan bir chiziqda turadi
    <div className="space-y-4 max-w-3xl animate-in fade-in pb-12">
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
          <User className="w-7 h-7 text-teal-600 dark:text-teal-400" />
          Mening profilim
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Foydalanuvchi hisobi ma&apos;lumotlari va xavfsizlik sozlamalari
        </p>
      </div>

      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
        <Avatar name={user.fullName} size="lg" variant="gold" />
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">{user.fullName}</h2>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{user.login}</div>
          <div className="pt-1">
            <Badge variant="gold">Mentor</Badge>
          </div>
        </div>
      </div>

      <TelegramSection initial={telegram} role="mentor" />

      <CelebrationSetting initialEnabled={celebrationsEnabled} />

      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">Parolni yangilash</h2>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
          Parol almashtirilgach, boshqa qurilmalarda ochiq qolgan sessiyalar avtomatik yopiladi.
        </p>

        <PasswordForm requireCurrent idPrefix="profile" submitLabel="Parolni saqlash" className="max-w-md" buttonClassName="font-semibold" />
      </div>
    </div>
  );
}
