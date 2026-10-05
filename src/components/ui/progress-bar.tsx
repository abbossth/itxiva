import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0..100
  max?: number;
  variant?: "primary" | "gold" | "success" | "danger";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
}

export function ProgressBar({
  value,
  max = 100,
  variant = "primary",
  size = "md",
  showLabel = false,
  label,
  className,
  ...props
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const variants = {
    primary: "bg-itxiva-gradient",
    gold: "bg-gradient-to-r from-amber-500 to-amber-600",
    success: "bg-gradient-to-r from-emerald-500 to-teal-600",
    danger: "bg-gradient-to-r from-rose-500 to-rose-600",
  };

  const sizes = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  return (
    <div className={cn("w-full space-y-1.5", className)} {...props}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span>{label}</span>
          <span className="tabular-nums font-mono">{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(
          "w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800",
          sizes[size]
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            variants[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
