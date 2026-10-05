import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
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
    default: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20 font-medium",
    secondary: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-medium",
    warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 font-medium",
    danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 font-medium",
    destructive: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 font-medium",
    gold: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 font-semibold",
    teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20 font-medium",
    amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 font-medium",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 font-medium",
    outline: "border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs transition-colors select-none",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
