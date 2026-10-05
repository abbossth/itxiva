import * as React from "react";
import { cn } from "@/lib/utils";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
  ...props
}: FieldProps) {
  const hintId = htmlFor && hint ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          {label}
          {required && (
            <span className="text-rose-600 dark:text-rose-400 ml-1 font-bold" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <div>{children}</div>
      {hint && !error && (
        <p id={hintId} className="text-[11px] text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-rose-600 dark:text-rose-400 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
