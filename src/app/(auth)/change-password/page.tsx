import { redirect } from "next/navigation";
import { Check, EyeOff, KeyRound, Lightbulb, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { PasswordForm } from "@/components/auth/password-form";
import { AuthFeatures, AuthHeadline, AuthShell } from "@/components/auth/auth-shell";
import { logoutAction } from "@/actions/auth.actions";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Parolni almashtirish — ITXiva",
  robots: { index: false },
};

const TIPS = [
  { icon: KeyRound, title: "Faqat o'zingiz biladigan parol", text: "Mentor bergan vaqtinchalik parol shundan keyin ishlamaydi" },
  { icon: EyeOff, title: "Hech kimga aytmang", text: "Do'stlar ham, mentor ham parolingizni so'ramaydi" },
  { icon: Lightbulb, title: "Eslash oson, topish qiyin", text: "Bir nechta so'z va raqamni qo'shing — uzun parol kuchliroq" },
];

const STEPS = ["Kirish", "Yangi parol", "Platforma"];

export default async function ChangePasswordPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/login");
  }
  // Bu sahifa faqat vaqtinchalik parol bilan kirganlar uchun; qolganlar parolni profildan almashtiradi
  if (!session.mustChangePassword) {
    redirect("/profile");
  }

  return (
    <AuthShell
      panel={
        <>
          <AuthHeadline eyebrow="Oxirgi qadam" line1="Hisobingiz —" line2="faqat sizniki." />
          <AuthFeatures items={TIPS} />
        </>
      }
      below={
        <form action={logoutAction} className="mt-4 text-center">
          <button
            type="submit"
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline-offset-4 hover:underline cursor-pointer min-h-[44px] px-3"
          >
            Boshqa hisob bilan kirish
          </button>
        </form>
      }
    >
      {/* Qadamlar: kirish bajarildi, hozir yangi parol, keyin platforma */}
      <ol className="mb-6 flex items-center gap-2" aria-label="Qadamlar">
        {STEPS.map((step, i) => {
          const done = i === 0;
          const current = i === 1;
          return (
            <li key={step} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                  done && "bg-teal-600 text-white",
                  current && "bg-teal-500/15 text-teal-700 ring-2 ring-teal-500 dark:text-teal-300",
                  !done && !current && "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold whitespace-nowrap",
                  current ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
                )}
              >
                {step}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden className={cn("h-px flex-1", done ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-700")} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          Yangi parol o&apos;rnating
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{session.fullName}</span>, siz mentor bergan
          vaqtinchalik parol bilan kirdingiz. Davom etish uchun faqat o&apos;zingiz biladigan parol o&apos;ylab toping.
        </p>
      </div>

      <PasswordForm idPrefix="first" submitLabel="Saqlash va davom etish" large buttonClassName="w-full !mt-6 font-semibold" />
    </AuthShell>
  );
}
