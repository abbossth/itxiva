import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PasswordForm } from "@/components/auth/password-form";
import { logoutAction } from "@/actions/auth.actions";

export const metadata = {
  title: "Parolni almashtirish — ITXiva",
  robots: { index: false },
};

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
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-bg p-4 sm:p-6">
      <div className="flex justify-end max-w-5xl mx-auto w-full pt-2">
        <ThemeToggle />
      </div>

      <main className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size="md" />
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mt-4 mb-2">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Parolni almashtirish</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              {session.fullName}, siz mentor bergan vaqtinchalik parol bilan kirdingiz. Davom etish uchun faqat
              o&apos;zingiz biladigan yangi parol o&apos;rnating.
            </p>
          </div>

          <PasswordForm
            idPrefix="first"
            submitLabel="Parolni saqlash va davom etish"
            buttonClassName="w-full mt-2 font-semibold"
          />

          <form action={logoutAction} className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              type="submit"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline-offset-4 hover:underline cursor-pointer min-h-[44px] px-3"
            >
              Boshqa hisob bilan kirish
            </button>
          </form>
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-slate-500 dark:text-slate-400">
        &copy; {new Date().getFullYear()} ITXiva
      </footer>
    </div>
  );
}
