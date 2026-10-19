import { redirect } from "next/navigation";
import { BookOpenCheck, Coins, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { LoginForm } from "@/components/auth/login-form";
import { AuthFeatures, AuthHeadline, AuthShell } from "@/components/auth/auth-shell";
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

const FEATURES = [
  { icon: BookOpenCheck, title: "Darslar va vazifalar", text: "Materiallar, testlar va uyga vazifalar har bir dars ichida tartibli" },
  { icon: Coins, title: "Coin va reyting", text: "Faollik uchun coin yig'ing, do'kondan sovg'a oling" },
  { icon: Sparkles, title: "10 ta daraja", text: "Shogirddan Xorazmiygacha — har biri o'z nishoni bilan" },
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Bazada tekshiriladi: o'chirilgan foydalanuvchining eski cookie'si bilan cheksiz yo'naltirish bo'lmasligi uchun
  const session = await getCurrentUser();
  if (session) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const nextUrl = resolvedSearchParams?.next;

  return (
    <AuthShell
      panel={
        <>
          <AuthHeadline eyebrow="Muhammad al-Xorazmiy vorislari" line1="O'rgan. Yarat." line2="Darajangni oshir." />
          <AuthFeatures items={FEATURES} />

          {/* Darajalar yo'li: temirdan koinotgacha */}
          <div className="mt-10">
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
        </>
      }
      below={
        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Akkauntingiz yo&apos;qmi yoki parolni unutdingizmi?
          <br />
          Mentoringizga ayting — u yangi vaqtinchalik parol beradi.
        </p>
      }
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">Xush kelibsiz!</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Mentoringiz bergan login va parol bilan kiring.</p>
      </div>

      <LoginForm nextUrl={nextUrl} />
    </AuthShell>
  );
}
