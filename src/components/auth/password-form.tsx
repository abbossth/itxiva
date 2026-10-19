"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowBigUp, Check, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { changePasswordAction, ActionResult } from "@/actions/auth.actions";
import { cn } from "@/lib/utils";

const initialState: ActionResult = { success: false };

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };
type FieldName = keyof typeof EMPTY;
const FIELD_ORDER: FieldName[] = ["currentPassword", "newPassword", "confirmPassword"];

const STRENGTH = [
  { label: "Juda zaif", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  { label: "Zaif", bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  { label: "O'rtacha", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { label: "Yaxshi", bar: "bg-teal-500", text: "text-teal-600 dark:text-teal-400" },
  { label: "Kuchli", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
];

/** Parol kuchi 0–4: uzunlik, harf va raqam aralashligi, katta harf yoki belgi. 6 belgidan qisqasi — eng ko'pi "Zaif" */
function passwordStrength(p: string): number {
  if (!p) return 0;
  const mixed = /[a-zA-Z]/.test(p) && /\d/.test(p);
  const extra = /[A-Z]/.test(p) || /[^a-zA-Z0-9]/.test(p);
  if (p.length < 6) return Math.min(1, Number(mixed));
  return 1 + Number(mixed) + Number(p.length >= 10) + Number(extra);
}

interface PasswordFormProps {
  /** Profildan almashtirishda joriy parol so'raladi; vaqtinchalik parol bilan birinchi kirishda — yo'q */
  requireCurrent?: boolean;
  submitLabel: string;
  /** Maydon id'lari uchun old qo'shimcha (bir sahifada boshqa forma bilan to'qnashmasligi uchun) */
  idPrefix?: string;
  className?: string;
  buttonClassName?: string;
  /** Katta (48px) maydonlar va tugma — alohida sahifa uchun */
  large?: boolean;
}

export function PasswordForm({
  requireCurrent = false,
  submitLabel,
  idPrefix = "pwd",
  className,
  buttonClassName,
  large = false,
}: PasswordFormProps) {
  // Maydonlar boshqariladigan (controlled): xato qaytganda yozilgan qiymatlar joyida qoladi
  const [values, setValues] = useState(EMPTY);
  const [visible, setVisible] = useState<Record<FieldName, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [capsLock, setCapsLock] = useState<FieldName | null>(null);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const result = await changePasswordAction(prev, formData);
    if (result?.success) setValues(EMPTY);
    return result;
  }, initialState);

  // Server xato qaytarsa kursor birinchi xatoli maydonga qaytadi
  useEffect(() => {
    const name = FIELD_ORDER.find((n) => state?.errors?.[n]);
    if (!name) return;
    const el = document.getElementById(`${idPrefix}-${name}`) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }, [state, idPrefix]);

  const mismatch = values.confirmPassword.length > 0 && values.newPassword !== values.confirmPassword;
  const strength = passwordStrength(values.newPassword);
  const checks = [
    { ok: values.newPassword.length >= 6, label: "Kamida 6 ta belgi" },
    { ok: /[a-zA-Z]/.test(values.newPassword) && /\d/.test(values.newPassword), label: "Harf va raqam aralash (tavsiya)" },
    { ok: values.confirmPassword.length > 0 && !mismatch, label: "Ikkala parol bir xil" },
  ];

  const passwordField = (name: FieldName, label: string, autoComplete: string, extra?: React.ReactNode, clientError?: string) => {
    const id = `${idPrefix}-${name}`;
    const error = clientError ?? state?.errors?.[name]?.[0];
    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ? name : null);
    return (
      <Field htmlFor={id} label={label} error={error}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
            <Lock className="w-4 h-4" />
          </div>
          <Input
            id={id}
            name={name}
            type={visible[name] ? "text" : "password"}
            value={values[name]}
            onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            onKeyDown={onKey}
            onKeyUp={onKey}
            onBlur={() => setCapsLock(null)}
            required
            minLength={name === "currentPassword" ? undefined : 6}
            maxLength={name === "currentPassword" ? 200 : 50}
            autoComplete={autoComplete}
            // Alohida sahifada kursor birinchi maydonda turadi (profilda — yo'q, sahifa sakramasligi uchun)
            autoFocus={large && name === (requireCurrent ? "currentPassword" : "newPassword")}
            enterKeyHint={name === "confirmPassword" ? "done" : "next"}
            hasError={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn("pl-10 pr-11", large && "min-h-[48px]")}
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
        {capsLock === name && (
          <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 animate-in fade-in">
            <ArrowBigUp className="w-3.5 h-3.5" />
            Caps Lock yoqilgan
          </p>
        )}
        {extra}
      </Field>
    );
  };

  const strengthMeter = values.newPassword && (
    <div className="flex items-center gap-2.5 pt-0.5" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              strength >= i ? STRENGTH[strength].bar : "bg-slate-200 dark:bg-slate-700"
            )}
          />
        ))}
      </div>
      <span className={cn("text-[11px] font-semibold min-w-[4.5rem] text-right", STRENGTH[strength].text)}>
        {STRENGTH[strength].label}
      </span>
    </div>
  );

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
        {passwordField("newPassword", "Yangi parol", "new-password", strengthMeter)}
        {passwordField(
          "confirmPassword",
          "Yangi parolni tasdiqlang",
          "new-password",
          undefined,
          mismatch ? "Parollar bir-biriga mos kelmadi" : undefined
        )}

        <ul className="space-y-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 px-3.5 py-3">
          {checks.map((c) => (
            <li
              key={c.label}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                c.ok ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-slate-500 dark:text-slate-400"
              )}
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors",
                  c.ok ? "bg-emerald-500 text-white" : "ring-1 ring-inset ring-slate-300 dark:ring-slate-600"
                )}
              >
                {c.ok && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              {c.label}
            </li>
          ))}
        </ul>

        <Button
          type="submit"
          variant="primary"
          size={large ? "lg" : undefined}
          className={cn(large && "min-h-[48px] shadow-lg shadow-teal-600/20", buttonClassName)}
          isLoading={isPending}
          disabled={mismatch}
        >
          {submitLabel}
        </Button>
      </form>
    </div>
  );
}
