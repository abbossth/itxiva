import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

    const variants = {
      primary:
        "bg-itxiva-gradient text-white shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 hover:brightness-105",
      secondary:
        "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700",
      outline:
        "border border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
      ghost:
        "bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
      danger:
        "bg-rose-500 text-white hover:bg-rose-600 shadow-md shadow-rose-500/20",
      gold:
        "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-500/20 font-semibold",
    };

    const sizes = {
      sm: "h-9 px-3 text-xs gap-1.5",
      md: "min-h-[44px] px-4 text-sm gap-2", // 44px touch target friendly
      lg: "min-h-[48px] px-6 text-base gap-2.5",
      icon: "min-h-[44px] min-w-[44px] p-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
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
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
