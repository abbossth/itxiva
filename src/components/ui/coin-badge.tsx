"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CoinBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  amount: number;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}

export function CoinBadge({
  amount,
  size = "md",
  animate = true,
  className,
  ...props
}: CoinBadgeProps) {
  const [displayAmount, setDisplayAmount] = React.useState(amount);
  const prevAmountRef = React.useRef(amount);

  React.useEffect(() => {
    if (!animate) return;
    const startVal = prevAmountRef.current;
    prevAmountRef.current = amount;
    const diff = amount - startVal;
    if (diff === 0) return;

    const duration = 600; // ms
    let startTimestamp: number | null = null;
    let animId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayAmount(Math.round(startVal + diff * easeProgress));

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [amount, animate]);

  const valueToRender = animate ? displayAmount : amount;

  const sizes = {
    sm: "px-2 py-0.5 text-xs gap-1 rounded-lg",
    md: "px-2.5 py-1 text-xs sm:text-sm gap-1.5 rounded-xl",
    lg: "px-3.5 py-1.5 text-base sm:text-lg gap-2 rounded-2xl",
  };

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center font-bold font-mono tracking-tight select-none",
        "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30",
        "shadow-xs transition-colors",
        sizes[size],
        className
      )}
      title={`${amount} coin`}
      {...props}
    >
      {/* Oltin tanga emblemasi */}
      <svg
        className={cn("text-amber-500 dark:text-amber-400 shrink-0 drop-shadow-xs", iconSizes[size])}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" className="opacity-90 fill-amber-500" />
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-200" />
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fontSize="10"
          fontWeight="900"
          fontFamily="monospace"
          fill="#FFFFFF"
        >
          C
        </text>
      </svg>
      <span className="tabular-nums">{String(Math.round(valueToRender)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")}</span>
    </div>
  );
}
