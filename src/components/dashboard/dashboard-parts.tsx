import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bosh sahifadagi blok: sarlavha, ixtiyoriy "hammasi" havolasi va kontent */
export function DashCard({
  title,
  icon: Icon,
  href,
  hrefLabel = "Hammasi",
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href?: string;
  hrefLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "stagger-item flex flex-col rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline min-h-[32px]"
          >
            {hrefLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Katta raqamli ko'rsatkich (bosiladigan) */
export function StatLink({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "accent" | "warn";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "stagger-item group flex flex-col gap-2 rounded-2xl border p-4 sm:p-5 transition-all hover:-translate-y-0.5 hover:shadow-card",
        tone === "warn"
          ? "border-amber-400/50 bg-amber-50 dark:bg-amber-500/10"
          : tone === "accent"
            ? "border-teal-500/40 bg-teal-50 dark:bg-teal-500/10"
            : "border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface"
      )}
    >
      <span className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {label}
        <Icon className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
      </span>
      <span className="font-display text-2xl sm:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100 leading-none">
        {value}
      </span>
      {hint && <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{hint}</span>}
    </Link>
  );
}

export function DashEmpty({ children }: { children: React.ReactNode }) {
  return <p className="flex-1 flex items-center justify-center py-6 text-center text-xs text-slate-500 dark:text-slate-400">{children}</p>;
}

export function Greeting({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">Salom, {name}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}
