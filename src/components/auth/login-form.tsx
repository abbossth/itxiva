"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, Lock, User, Eye, EyeOff, ArrowBigUp } from "lucide-react";
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
  const [capsLock, setCapsLock] = useState(false);
  // Maydonlar boshqariladigan (controlled): xato qaytganda forma tozalanmaydi, yozilgan qiymatlar joyida qoladi
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Xato qaytsa kursor o'sha maydonga qaytadi va matn belgilanadi — darhol qayta yozish mumkin
  useEffect(() => {
    const target = state?.errors?.login ? loginRef.current : state?.errors?.password ? passwordRef.current : null;
    target?.focus();
    target?.select();
  }, [state]);

  const onPasswordKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);

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
          error={state?.errors?.login?.[0]}
        >
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <Input
              ref={loginRef}
              id="login"
              name="login"
              type="text"
              value={login}
              // Loginda bo'sh joy bo'lmaydi: tasodifan qo'shilgan probellar olib tashlanadi
              onChange={(e) => setLogin(e.target.value.replace(/\s+/g, ""))}
              placeholder="masalan: ali_valiyev"
              required
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              enterKeyHint="next"
              hasError={Boolean(state?.errors?.login)}
              className="pl-10 min-h-[48px]"
            />
          </div>
        </Field>

        <Field
          htmlFor="password"
          label="Parol"
          error={state?.errors?.password?.[0]}
        >
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <Input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onPasswordKey}
              onKeyUp={onPasswordKey}
              onBlur={() => setCapsLock(false)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              enterKeyHint="go"
              hasError={Boolean(state?.errors?.password)}
              className="pl-10 pr-11 min-h-[48px]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-w-[44px] justify-center cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:text-teal-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {capsLock && (
            <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 animate-in fade-in">
              <ArrowBigUp className="w-3.5 h-3.5" />
              Caps Lock yoqilgan — parol katta harflarda yozilyapti
            </p>
          )}
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="group w-full !mt-6 min-h-[48px] font-semibold shadow-lg shadow-teal-600/20"
          isLoading={isPending}
        >
          {isPending ? (
            "Kirilmoqda..."
          ) : (
            <>
              Kirish
              <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
