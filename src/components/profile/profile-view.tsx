"use client";

import Link from "next/link";
import { User, Lock, Shield, Award, Sparkles, QrCode, Camera } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CoinBadge } from "@/components/ui/coin-badge";
import { Button } from "@/components/ui/button";
import { PasswordForm } from "@/components/auth/password-form";
import { TelegramSection } from "@/components/profile/telegram-section";
import { CelebrationSetting } from "@/components/profile/celebration-setting";
import { OwnPhoto } from "@/components/profile/own-photo";
import { StudentPersonalForm } from "@/components/students/student-personal-form";
import type { OwnProfileData } from "@/actions/student-profile.actions";
import type { TelegramStatus } from "@/actions/telegram.actions";

interface ProfileViewProps {
  user: {
    userId: string;
    fullName: string;
    login: string;
    role: "student" | "mentor";
    groupName?: string;
    totalCoins?: number;
    spendableBalance?: number;
  };
  telegram: TelegramStatus;
  celebrationsEnabled: boolean;
  /** Faqat o'quvchi uchun: rasm va shaxsiy ma'lumotlar */
  ownProfile?: OwnProfileData | null;
}

export function ProfileView({ user, telegram, celebrationsEnabled, ownProfile }: ProfileViewProps) {
  return (
    // Mentorda sahifa tepasida bo'lim tablari bor — kontent ular bilan bir chiziqda turadi
    <div className={`space-y-4 max-w-3xl animate-in fade-in pb-12 ${user.role === "mentor" ? "" : "mx-auto"}`}>
      {/* Page Title */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
          <User className="w-7 h-7 text-teal-600 dark:text-teal-400" />
          Mening profilim
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Foydalanuvchi hisobi ma&apos;lumotlari va xavfsizlik sozlamalari
        </p>
      </div>

      {/* User Info Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {ownProfile ? (
            <OwnPhoto userId={user.userId} fullName={user.fullName} initialUrl={ownProfile.photoUrl} />
          ) : (
            <Avatar
              name={user.fullName}
              size="lg"
              variant={user.role === "mentor" ? "gold" : "primary"}
            />
          )}
          <div className="space-y-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {user.fullName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>@{user.login}</span>
              {user.groupName && (
                <>
                  <span>•</span>
                  <span className="font-sans font-medium text-teal-700 dark:text-teal-300">
                    {user.groupName} guruhi
                  </span>
                </>
              )}
            </div>
            <div className="pt-1">
              <Badge variant={user.role === "mentor" ? "gold" : "default"}>
                {user.role === "mentor" ? "Mentor" : "O'quvchi"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Coins display */}
        {user.role === "student" && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-4 shrink-0">
            <div>
              <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                Jami tangalar
              </div>
              <div className="mt-1">
                <CoinBadge amount={user.totalCoins || 0} size="md" animate={false} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gamification / Badges Card (for student) */}
      {user.role === "student" && (
        <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
              Mening yutuqlarim va nishonlar
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Faol start</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Platformaga qo&apos;shildi</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Award className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Davomatchi</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Darslarda muntazam</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                <Shield className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Bilimdon</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Testlarni yechish</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Vorislardan biri</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Al-Xorazmiy vorisi</div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Quick Action Card (for student) */}
      {user.role === "student" && (
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-teal-500/10 via-white to-blue-500/10 dark:from-teal-950/40 dark:via-surface dark:to-blue-950/30 border border-teal-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Bugungi dars davomati
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Proyektordagi 6 xonali kod yoki QR belgi orqali davomatdan o&apos;ting: kelsangiz +5, kechiksangiz +3 coin; sababsiz kelmasangiz −5 coin
              </p>
            </div>
          </div>

          <Link href="/attendance" className="shrink-0">
            <Button variant="primary" className="gap-2 min-h-[44px] w-full sm:w-auto font-semibold shadow-xs">
              <Camera className="w-4 h-4" />
              <span>Davomatdan o&apos;tish</span>
            </Button>
          </Link>
        </div>
      )}

      {ownProfile && (
        <section aria-labelledby="own-data-heading" className="space-y-3">
          <h2 id="own-data-heading" className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2 pt-2">
            <User className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Shaxsiy ma&apos;lumotlarim
          </h2>
          <StudentPersonalForm
            // Saqlangach yoki mentor ruxsatni o'zgartirgach forma yangi holatda ochiladi
            key={JSON.stringify(ownProfile.personal) + ownProfile.canEdit}
            mode="student"
            personal={ownProfile.personal}
            locked={!ownProfile.canEdit}
          />
        </section>
      )}

      <TelegramSection initial={telegram} role={user.role} />

      <CelebrationSetting initialEnabled={celebrationsEnabled} />

      {/* Change Password Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
            Parolni yangilash
          </h2>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
          Parol almashtirilgach, boshqa qurilmalarda ochiq qolgan sessiyalar avtomatik yopiladi.
        </p>

        <PasswordForm
          requireCurrent
          idPrefix="profile"
          submitLabel="Parolni saqlash"
          className="max-w-md"
          buttonClassName="font-semibold"
        />
      </div>
    </div>
  );
}
