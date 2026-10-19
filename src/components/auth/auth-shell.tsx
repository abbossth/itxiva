import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

// Xiva koshinlaridagi sakkiz qirrali yulduz naqshi (fon uchun, juda xira)
const PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='white' stroke-width='1'%3E%3Cpath d='M19 19h18v18H19z'/%3E%3Cpath d='M28 15.3 40.7 28 28 40.7 15.3 28z'/%3E%3Cpath d='M0 0l15.3 15.3M56 0 40.7 15.3M0 56l15.3-15.3M56 56 40.7 40.7'/%3E%3C/g%3E%3C/svg%3E\")";

/**
 * Kirish sahifalari qolipi: katta ekranda chapda to'q brend paneli (`panel`), o'ngda forma;
 * telefonda panel yashirinadi, tepada logo va forma kartasi qoladi.
 */
export function AuthShell({ panel, children, below }: { panel: ReactNode; children: ReactNode; below?: ReactNode }) {
  const footer = <>&copy; {new Date().getFullYear()} ITXiva (itxiva.uz). Xiva, O&apos;zbekiston.</>;

  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-slate-50 dark:bg-bg selection:bg-teal-500/20">
      <aside className="relative hidden lg:flex flex-col justify-between gap-10 overflow-hidden bg-slate-950 text-white p-10 xl:p-14">
        <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: PATTERN }} />
        <div aria-hidden className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-teal-500/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-48 -right-24 h-[30rem] w-[30rem] rounded-full bg-teal-400/15 blur-3xl" />
        <div aria-hidden className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-teal-400/30 to-transparent" />

        <div className="relative [--logo-band:var(--color-slate-950)]">
          <Logo size="md" href="" className="text-white dark:text-white" />
        </div>
        <div className="relative max-w-lg">{panel}</div>
        <p className="relative text-xs text-slate-500">{footer}</p>
      </aside>

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
            {children}
          </div>

          {below}
        </div>

        <footer className="relative lg:hidden text-center py-2 text-xs text-slate-500 dark:text-slate-400">{footer}</footer>
      </main>
    </div>
  );
}

/** Brend panelidagi sarlavha: kichik ustki yozuv va ikki qatorli shior (ikkinchisi gradientda) */
export function AuthHeadline({ eyebrow, line1, line2 }: { eyebrow: string; line1: string; line2: string }) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">{eyebrow}</p>
      <h2 className="mt-3 font-display text-4xl xl:text-5xl font-extrabold leading-[1.1]">
        {line1}
        <br />
        <span className="bg-gradient-to-r from-teal-300 to-emerald-200 bg-clip-text text-transparent">{line2}</span>
      </h2>
    </>
  );
}

export function AuthFeatures({ items }: { items: { icon: LucideIcon; title: string; text: string }[] }) {
  return (
    <ul className="mt-8 space-y-4">
      {items.map(({ icon: Icon, title, text }) => (
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
  );
}
