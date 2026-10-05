import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "secondary" | "gold";
}

export function Avatar({
  src,
  name,
  size = "md",
  variant = "primary",
  className,
  ...props
}: AvatarProps) {
  const getInitials = (n?: string) => {
    if (!n) return "?";
    const parts = n.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-xl",
  };

  const variants = {
    primary: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
    secondary: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
    gold: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  };

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-2xl border font-bold select-none shrink-0 overflow-hidden",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || "Avatar"}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}
