import * as React from "react";
import Link from "next/link";
import { ArrowLeft, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  backHref,
  backLabel = "Orqaga",
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-1 pb-3 border-b border-slate-200/80 dark:border-slate-800/80", className)}>
      {backHref && (
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[36px] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{backLabel}</span>
          </Link>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            {Icon && (
              <div className="p-1.5 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 shrink-0">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <span>{title}</span>
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
