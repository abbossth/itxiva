"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { User, Lock, Eye, EyeOff, Shield, Award, Sparkles, CheckCircle2, QrCode, Camera } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CoinBadge } from "@/components/ui/coin-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { changePasswordAction, ActionResult } from "@/actions/auth.actions";

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
}

const initialState: ActionResult = {
  success: false,
};

export function ProfileView({ user }: ProfileViewProps) {
  const [state, formAction, isPending] = useActionState(changePasswordAction, initialState);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in pb-12">
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
          <Avatar
            name={user.fullName}
            size="lg"
            variant={user.role === "mentor" ? "gold" : "primary"}
          />
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
                Proyektordagi 6 xonali kod yoki QR belgi orqali davomatdan o&apos;ting (+10 coin)
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

      {/* Change Password Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
            Parolni yangilash
          </h2>
        </div>

        {state?.success && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 text-sm flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Parol muvaffaqiyatli yangilandi!</span>
          </div>
        )}

        {state?.message && !state.success && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-sm"
          >
            {state.message}
          </div>
        )}

        <form action={formAction} className="space-y-4 max-w-md">
          <Field
            htmlFor="new-password"
            label="Yangi parol"
            required
            hint="Kamida 8 ta belgi (harf va raqamlar)"
            error={state?.errors?.newPassword?.[0]}
          >
            <div className="relative">
              <Input
                id="new-password"
                name="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="Yangi parolni kiriting"
                required
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={showNewPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-w-[44px] justify-center cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          <Field
            htmlFor="confirm-password"
            label="Yangi parolni tasdiqlang"
            required
            error={state?.errors?.confirmPassword?.[0]}
          >
            <div className="relative">
              <Input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Yangi parolni qayta kiriting"
                required
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-w-[44px] justify-center cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          <Button
            type="submit"
            variant="primary"
            className="min-h-[44px] font-semibold"
            isLoading={isPending}
          >
            Parolni saqlash
          </Button>
        </form>
      </div>
    </div>
  );
}
