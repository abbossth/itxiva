import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={hasError || undefined}
        className={cn(
          "flex min-h-[96px] w-full rounded-xl border bg-white dark:bg-slate-900/60 p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500",
          "transition-colors focus:outline-hidden focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y",
          hasError
            ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20"
            : "border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:ring-teal-500/20",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
