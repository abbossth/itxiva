import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, hasError = false, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          aria-invalid={hasError || undefined}
          className={cn(
            "flex min-h-[44px] w-full appearance-none rounded-xl border bg-white dark:bg-slate-900/60 pl-3.5 pr-10 py-2 text-sm text-slate-900 dark:text-slate-100",
            "transition-colors focus:outline-hidden focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            hasError
              ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20"
              : "border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:ring-teal-500/20",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      </div>
    );
  }
);

Select.displayName = "Select";
