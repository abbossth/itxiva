import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, hasError = false, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        aria-invalid={hasError || undefined}
        className={cn(
          "flex min-h-[44px] w-full rounded-xl border bg-white dark:bg-slate-900/60 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500",
          "transition-colors focus:outline-hidden focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
          hasError
            ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100"
            : "border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:ring-teal-500/20",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
