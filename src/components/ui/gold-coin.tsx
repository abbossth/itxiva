import { useId } from "react";
import { cn } from "@/lib/utils";

// Oltin coin belgisi: 🪙 emojisi Apple qurilmalarida kumush-kulrang chiziladi — bu esa hamma joyda bir xil oltin.
// O'lchami matnga qarab (1em), `className` bilan kattalashtiriladi.

export function GoldCoin({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("inline-block h-[1em] w-[1em] shrink-0 align-[-0.15em]", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={`${id}i`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${id}f)`} stroke="#92400e" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="10.5" fill={`url(#${id}i)`} stroke="#b45309" strokeWidth="1" />
      {/* Yulduzcha */}
      <path d="M16 9.6l1.9 4 4.3.5-3.2 2.9.9 4.3-3.9-2.2-3.9 2.2.9-4.3-3.2-2.9 4.3-.5z" fill="#fffbeb" stroke="#b45309" strokeWidth="0.6" strokeLinejoin="round" />
      {/* Yaltirash */}
      <path d="M7.5 11.5a10 10 0 0 1 6-5.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}
