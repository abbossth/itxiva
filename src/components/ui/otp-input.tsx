"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface OTPInputProps {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  allowedChars?: RegExp;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function OTPInput({
  length = 6,
  value: controlledValue,
  onChange,
  onComplete,
  allowedChars = /^[a-zA-Z0-9]$/,
  disabled = false,
  autoFocus = false,
  className,
}: OTPInputProps) {
  const [internalValue, setInternalValue] = React.useState<string[]>(() =>
    Array(length).fill("")
  );

  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const chars = controlledValue !== undefined
    ? controlledValue.padEnd(length, "").slice(0, length).split("")
    : internalValue;

  const updateChars = (newChars: string[]) => {
    if (controlledValue === undefined) {
      setInternalValue(newChars);
    }
    const str = newChars.join("");
    onChange?.(str);
    if (str.length === length && !newChars.includes("")) {
      onComplete?.(str);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!chars[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else {
        const next = [...chars];
        next[index] = "";
        updateChars(next);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.toUpperCase();
    if (!rawVal) return;

    const char = rawVal.slice(-1);
    if (!allowedChars.test(char)) return;

    const next = [...chars];
    next[index] = char;
    updateChars(next);

    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").trim().toUpperCase();
    const validChars = paste.split("").filter((c) => allowedChars.test(c)).slice(0, length);
    if (validChars.length === 0) return;

    const next = [...chars];
    for (let i = 0; i < validChars.length; i++) {
      next[i] = validChars[i];
    }
    updateChars(next);

    const nextFocusIndex = Math.min(validChars.length, length - 1);
    inputRefs.current[nextFocusIndex]?.focus();
  };

  React.useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  return (
    <div
      className={cn("flex items-center justify-center gap-2 sm:gap-3", className)}
      role="group"
      aria-label={`${length} xonali tasdiqlash kodi`}
    >
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          maxLength={1}
          value={chars[i] || ""}
          disabled={disabled}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`${i + 1}-belgi`}
          className={cn(
            "w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-mono font-black uppercase rounded-2xl border",
            "bg-white dark:bg-slate-900/80 text-slate-900 dark:text-slate-100",
            "transition-all duration-150 select-none shadow-xs",
            "focus:outline-hidden focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 focus:scale-105",
            chars[i]
              ? "border-teal-500/60 dark:border-teal-400/60 bg-teal-500/5 dark:bg-teal-500/10"
              : "border-slate-300 dark:border-slate-700",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
}
