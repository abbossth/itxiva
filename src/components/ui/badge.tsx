import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "destructive"
    | "gold"
    | "teal"
    | "amber"
    | "rose"
    | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variants = {
    default: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    secondary: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    destructive: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    gold: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    outline: "border-slate-300 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-400",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors select-none",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
