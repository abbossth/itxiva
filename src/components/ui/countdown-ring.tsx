"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CountdownRingProps extends React.HTMLAttributes<HTMLDivElement> {
  progressPercent: number; // 0..100 (0 = vaqt tugagan, 100 = to'liq)
  size?: number; // diametr px
  strokeWidth?: number;
  urgencyThresholds?: {
    warning: number; // masalan 20%
    danger: number; // masalan 10%
  };
  children?: React.ReactNode;
}

export function CountdownRing({
  progressPercent,
  size = 64,
  strokeWidth = 5,
  urgencyThresholds = { warning: 25, danger: 10 },
  children,
  className,
  ...props
}: CountdownRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(100, progressPercent));
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  const isDanger = clampedProgress <= urgencyThresholds.danger;
  const isWarning = clampedProgress <= urgencyThresholds.warning && !isDanger;

  const ringColor = isDanger
    ? "text-rose-500 stroke-rose-500"
    : isWarning
    ? "text-amber-500 stroke-amber-500"
    : "text-teal-600 dark:text-teal-400 stroke-teal-600 dark:stroke-teal-400";

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center select-none",
        isDanger && "animate-pulse",
        className
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg
        className="-rotate-90"
        width={size}
        height={size}
        aria-hidden="true"
      >
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-200/80 dark:stroke-slate-800"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn("transition-all duration-300 ease-linear", ringColor)}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-center">
          {children}
        </div>
      )}
    </div>
  );
}
