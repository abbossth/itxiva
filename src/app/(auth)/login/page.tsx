import { redirect } from "next/navigation";
import { BookOpenCheck, Coins, Sparkles, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LoginForm } from "@/components/auth/login-form";
import { LevelBadge } from "@/components/gamification/level-badge";

export const metadata = {
  title: "Tizimga kirish — ITXiva",
  description: "ITXiva o'quv platformasiga login va parol bilan kiring: darslar, uyga vazifalar, davomat va coin do'koni.",
};

interface LoginPageProps {
  searchParams: Promise<{
    next?: string;
  }>;
}

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BookOpenCheck, title: "Darslar va vazifalar", text: "Materiallar, testlar va uyga vazifalar har bir dars ichida tartibli" },
  { icon: Coins, title: "Coin va reyting", text: "Faollik uchun coin yig'ing, do'kondan sovg'a oling" },
  { icon: Sparkles, title: "10 ta daraja", text: "Shogirddan Xorazmiygacha — har biri o'z nishoni bilan" },
];

// Xiva koshinlaridagi sakkiz qirrali yulduz naqshi (fon uchun, juda xira)
const PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='white' stroke-width='1'%3E%3Cpath d='M19 19h18v18H19z'/%3E%3Cpath d='M28 15.3 40.7 28 28 40.7 15.3 28z'/%3E%3Cpath d='M0 0l15.3 15.3M56 0 40.7 15.3M0 56l15.3-15.3M56 56 40.7 40.7'/%3E%3C/g%3E%3C/svg%3E\")";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Bazada tekshiriladi: o'chirilgan foydalanuvchining eski cookie'si bilan cheksiz yo'naltirish bo'lmasligi uchun
  const session = await getCurrentUser();
  if (session) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const nextUrl = resolvedSearchParams?.next;
  const year = new Date().getFullYear();

  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-slate-50 dark:bg-bg selection:bg-teal-500/20">
      {/* Brend paneli (faqat katta ekranda) */}
      <aside className="relative hidden lg:flex flex-col justify-between gap-10 overflow-hidden bg-slate-950 text-white p-10 xl:p-14">
        <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: PATTERN }} />
        <div aria-hidden className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-teal-500/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-48 -right-24 h-[30rem] w-[30rem] rounded-full bg-teal-400/15 blur-3xl" />
        <div aria-hidden className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-teal-400/30 to-transparent" />

        <div className="relative [--logo-band:var(--color-slate-950)]">
          <Logo size="md" href="" className="text-white dark:text-white" />
        </div>

        <div className="relative max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Muhammad al-Xorazmiy vorislari</p>
          <h2 className="mt-3 font-display text-4xl xl:text-5xl font-extrabold leading-[1.1]">
            O&apos;rgan. Yarat.
            <br />
            <span className="bg-gradient-to-r from-teal-300 to-emerald-200 bg-clip-text text-transparent">Darajangni oshir.</span>
          </h2>

          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10 text-teal-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Darajalar yo'li: temirdan koinotgacha */}
          <div className="mt-10 group">
            <div className="relative flex items-center justify-between">
              <span aria-hidden className="absolute inset-x-4 top-1/2 h-px bg-gradient-to-r from-slate-600 via-teal-400/50 to-fuchsia-400/60" />
              {Array.from({ length: 10 }, (_, i) => (
                <LevelBadge key={i} level={i + 1} size={i === 9 ? "md" : "sm"} className="relative" />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-500">
              <span>Shogird</span>
              <span>Xorazmiy</span>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          &copy; {year} ITXiva (itxiva.uz). Xiva, O&apos;zbekiston.
        </p>
      </aside>

      {/* Forma */}
      <main className="relative flex flex-col overflow-hidden p-4 sm:p-6">
        <div aria-hidden className="lg:hidden absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-[36rem] rounded-full bg-teal-500/15 blur-3xl" />

        <div className="relative flex justify-end">
          <ThemeToggle />
        </div>

        <div className="relative w-full max-w-sm mx-auto my-auto py-8">
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="lg" animated href="" />
          </div>

          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-surface/90 backdrop-blur p-6 sm:p-8 shadow-xl shadow-slate-200/60 dark:shadow-none lg:border-0 lg:bg-transparent lg:dark:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">Xush kelibsiz!</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Mentoringiz bergan login va parol bilan kiring.</p>
            </div>

            <LoginForm nextUrl={nextUrl} />
          </div>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Akkauntingiz yo&apos;qmi yoki parolni unutdingizmi?
            <br />
            Mentoringizga ayting — u yangi vaqtinchalik parol beradi.
          </p>
        </div>

        <footer className="relative lg:hidden text-center py-2 text-xs text-slate-500 dark:text-slate-400">
          &copy; {year} ITXiva (itxiva.uz). Xiva, O&apos;zbekiston.
        </footer>
      </main>
    </div>
  );
}
