"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { changePasswordAction, ActionResult } from "@/actions/auth.actions";

const initialState: ActionResult = {
  success: false,
};

export default function ChangePasswordPage() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, initialState);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-bg p-4 sm:p-6">
      <div className="flex justify-end max-w-5xl mx-auto w-full pt-2">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size="md" />
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mt-4 mb-2">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Parolni almashtirish
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              Bu sizning birinchi kirishingiz. Xavfsizlik uchun yangi, o&apos;zingiz biladigan parol o&apos;rnating.
            </p>
          </div>

          {state?.message && !state.success && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-xs sm:text-sm font-medium border border-rose-200 dark:border-rose-900">
              {state.message}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Yangi parol (kamida 6 ta belgi)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-w-[44px] justify-center cursor-pointer transition-colors focus-visible:outline-hidden"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {state?.errors?.newPassword && (
                <p className="text-[11px] text-rose-500 mt-1">
                  {state.errors.newPassword[0]}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Yangi parolni tasdiqlang
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-w-[44px] justify-center cursor-pointer transition-colors focus-visible:outline-hidden"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {state?.errors?.confirmPassword && (
                <p className="text-[11px] text-rose-500 mt-1">
                  {state.errors.confirmPassword[0]}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2 font-semibold"
              isLoading={isPending}
            >
              Parolni saqlash va davom etish
            </Button>
          </form>
        </div>
      </div>

      <footer className="text-center py-4 text-xs text-slate-500 dark:text-slate-400">
        &copy; {new Date().getFullYear()} ITXiva
      </footer>
    </div>
  );
}
