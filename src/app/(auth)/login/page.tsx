"use client";

import { useActionState } from "react";
import { Lock, User } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { loginAction, ActionResult } from "@/actions/auth.actions";

const initialState: ActionResult = {
  success: false,
};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-[#0B1220] p-4 sm:p-6 selection:bg-teal-500/20">
      {/* Top right theme toggle */}
      <div className="flex justify-end max-w-5xl mx-auto w-full pt-2">
        <ThemeToggle />
      </div>

      {/* Main card */}
      <div className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size="lg" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-4">
              Tizimga kirish
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Muhammad al-Xorazmiy vorislari o&apos;quv platformasi
            </p>
          </div>

          {state?.message && !state.success && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-xs sm:text-sm font-medium animate-in fade-in">
              {state.message}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="login"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Login
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <Input
                  id="login"
                  name="login"
                  type="text"
                  placeholder="masalan: ali_valiyev"
                  required
                  autoCapitalize="none"
                  autoComplete="username"
                  className="pl-10"
                />
              </div>
              {state?.errors?.login && (
                <p className="text-[11px] text-rose-500 mt-1">
                  {state.errors.login[0]}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Parol
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="pl-10"
                />
              </div>
              {state?.errors?.password && (
                <p className="text-[11px] text-rose-500 mt-1">
                  {state.errors.password[0]}
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
              Kirish
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Akkauntingiz yo&apos;qmi? Login va parolni mentordan oling.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-slate-400 dark:text-slate-600">
        &copy; {new Date().getFullYear()} ITXiva (itxiva.uz). Xiva, O&apos;zbekiston.
      </footer>
    </div>
  );
}
