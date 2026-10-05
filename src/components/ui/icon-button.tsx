import * as React from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string; // WCAG 2.1 AA talabiga ko'ra majburiy
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

const variants = {
  primary:
    "bg-itxiva-gradient text-white shadow-xs hover:brightness-105 active:scale-95",
  secondary:
    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95",
  outline:
    "border border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95",
  ghost:
    "bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95",
  danger:
    "bg-transparent text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95",
  gold:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 active:scale-95",
};

// Har bir o'lcham kamida 44px sensor bosish maydonini kafolatlaydi (WCAG 2.5.5)
const sizes = {
  sm: "min-h-[44px] min-w-[44px] p-2.5 text-xs rounded-xl",
  md: "min-h-[44px] min-w-[44px] p-2.5 text-sm rounded-xl",
  lg: "min-h-[48px] min-w-[48px] p-3 text-base rounded-2xl",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant = "ghost",
      size = "md",
      isLoading = false,
      disabled,
      children,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center transition-all duration-150 cursor-pointer select-none",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B1220]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          children
        )}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
