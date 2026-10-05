"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  const sheetRef = React.useRef<HTMLDivElement>(null);

  // Esc klavishini eshitish
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
      />

      {/* Sheet Container */}
      <div
        ref={sheetRef}
        className={cn(
          "relative z-10 w-full max-h-[85vh] rounded-t-3xl bg-white dark:bg-[#111A2E] border-t border-slate-200/80 dark:border-slate-800",
          "p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl flex flex-col overflow-hidden",
          "animate-in slide-in-from-bottom duration-300 ease-out",
          className
        )}
      >
        {/* Drag handle */}
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mb-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
          <div className="text-base font-bold text-slate-900 dark:text-slate-100">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pt-3">
          {children}
        </div>
      </div>
    </div>
  );
}
