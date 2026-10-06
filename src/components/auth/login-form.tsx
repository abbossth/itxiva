"use client";

import { useActionState, useState } from "react";
import { Lock, User, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { loginAction, ActionResult } from "@/actions/auth.actions";

const initialState: ActionResult = {
  success: false,
};

interface LoginFormProps {
  nextUrl?: string;
}

export function LoginForm({ nextUrl }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  // Maydonlar boshqariladigan (controlled): xato qaytganda forma tozalanmaydi, yozilgan qiymatlar joyida qoladi
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div>
      {state?.message && !state.success && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 p-3.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-xs sm:text-sm font-medium animate-in fade-in"
        >
          {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {nextUrl && <input type="hidden" name="next" value={nextUrl} />}

        <Field
          htmlFor="login"
          label="Login"
          required
          error={state?.errors?.login?.[0]}
        >
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <Input
              id="login"
              name="login"
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="masalan: ali_valiyev"
              required
              autoCapitalize="none"
              autoComplete="username"
              hasError={Boolean(state?.errors?.login)}
              className="pl-10"
            />
          </div>
        </Field>

        <Field
          htmlFor="password"
          label="Parol"
          required
          error={state?.errors?.password?.[0]}
        >
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              hasError={Boolean(state?.errors?.password)}
              className="pl-10 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-w-[44px] justify-center cursor-pointer transition-colors focus-visible:outline-hidden"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-2 font-semibold shadow-md shadow-teal-500/10"
          isLoading={isPending}
        >
          Kirish
        </Button>
      </form>
    </div>
  );
}
