"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { changePasswordAction, ActionResult } from "@/actions/auth.actions";

const initialState: ActionResult = { success: false };

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };
type FieldName = keyof typeof EMPTY;

interface PasswordFormProps {
  /** Profildan almashtirishda joriy parol so'raladi; vaqtinchalik parol bilan birinchi kirishda — yo'q */
  requireCurrent?: boolean;
  submitLabel: string;
  /** Maydon id'lari uchun old qo'shimcha (bir sahifada boshqa forma bilan to'qnashmasligi uchun) */
  idPrefix?: string;
  className?: string;
  buttonClassName?: string;
}

export function PasswordForm({
  requireCurrent = false,
  submitLabel,
  idPrefix = "pwd",
  className,
  buttonClassName,
}: PasswordFormProps) {
  // Maydonlar boshqariladigan (controlled): xato qaytganda yozilgan qiymatlar joyida qoladi
  const [values, setValues] = useState(EMPTY);
  const [visible, setVisible] = useState<Record<FieldName, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const result = await changePasswordAction(prev, formData);
    if (result?.success) setValues(EMPTY);
    return result;
  }, initialState);

  const mismatch = values.confirmPassword.length > 0 && values.newPassword !== values.confirmPassword;

  const passwordField = (name: FieldName, label: string, autoComplete: string, hint?: string, clientError?: string) => {
    const id = `${idPrefix}-${name}`;
    const error = clientError ?? state?.errors?.[name]?.[0];
    return (
      <Field htmlFor={id} label={label} required hint={hint} error={error}>
        <div className="relative">
          <Input
            id={id}
            name={name}
            type={visible[name] ? "text" : "password"}
            value={values[name]}
            onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            required
            minLength={name === "currentPassword" ? undefined : 6}
            maxLength={name === "currentPassword" ? 200 : 50}
            autoComplete={autoComplete}
            hasError={Boolean(error)}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => ({ ...v, [name]: !v[name] }))}
            aria-label={visible[name] ? "Parolni yashirish" : "Parolni ko'rsatish"}
            aria-pressed={visible[name]}
            className="absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center rounded-r-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors"
          >
            {visible[name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </Field>
    );
  };

  return (
    <div className={className}>
      {state?.success && (
        <div
          role="status"
          className="mb-4 p-3.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 text-sm flex items-start gap-2"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{state.message || "Parol muvaffaqiyatli yangilandi!"}</span>
        </div>
      )}

      {state?.message && !state.success && (
        <div
          role="alert"
          className="mb-4 p-3.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-sm font-medium"
        >
          {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {requireCurrent && passwordField("currentPassword", "Joriy parol", "current-password")}
        {passwordField("newPassword", "Yangi parol", "new-password", "Kamida 6 ta belgi. Boshqalar bilmaydigan parol tanlang.")}
        {passwordField(
          "confirmPassword",
          "Yangi parolni tasdiqlang",
          "new-password",
          undefined,
          mismatch ? "Parollar bir-biriga mos kelmadi" : undefined
        )}

        <Button type="submit" variant="primary" className={buttonClassName} isLoading={isPending} disabled={mismatch}>
          {submitLabel}
        </Button>
      </form>
    </div>
  );
}
