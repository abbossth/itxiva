import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = {
  title: "Tizimga kirish — ITXiva",
  description: "ITXiva o'quv platformasiga login va parol bilan kiring: darslar, uyga vazifalar, davomat va coin do'koni.",
};

interface LoginPageProps {
  searchParams: Promise<{
    next?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) {
    if (session.role === "mentor") {
      redirect("/mentor/groups");
    } else {
      redirect("/lessons");
    }
  }

  const resolvedSearchParams = await searchParams;
  const nextUrl = resolvedSearchParams?.next;

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-bg p-4 sm:p-6 selection:bg-teal-500/20">
      {/* Top right theme toggle */}
      <div className="flex justify-end max-w-5xl mx-auto w-full pt-2">
        <ThemeToggle />
      </div>

      {/* Main card */}
      <div className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
          <div className="flex flex-col items-center text-center mb-6">
            <Logo size="lg" animated />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-4">
              Tizimga kirish
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Muhammad al-Xorazmiy vorislari o&apos;quv platformasi
            </p>
          </div>

          <LoginForm nextUrl={nextUrl} />

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Akkauntingiz yo&apos;qmi? Login va parolni mentordan oling.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-slate-500 dark:text-slate-400">
        &copy; {new Date().getFullYear()} ITXiva (itxiva.uz). Xiva, O&apos;zbekiston.
      </footer>
    </div>
  );
}
