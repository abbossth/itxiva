"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: React.ReactNode;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
  toast: {
    success: (msg: React.ReactNode) => void;
    error: (msg: React.ReactNode) => void;
    info: (msg: React.ReactNode) => void;
    warning: (msg: React.ReactNode) => void;
  };
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback(
    ({ type, message, duration = 4000 }: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const toastMethods = React.useMemo(
    () => ({
      success: (msg: React.ReactNode) => addToast({ type: "success", message: msg }),
      error: (msg: React.ReactNode) => addToast({ type: "error", message: msg }),
      info: (msg: React.ReactNode) => addToast({ type: "info", message: msg }),
      warning: (msg: React.ReactNode) => addToast({ type: "warning", message: msg }),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, toast: toastMethods }}
    >
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => {
          const icons = {
            success: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
            error: <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />,
            warning: <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
            info: <Info className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />,
          };

          const borders = {
            success: "border-emerald-500/30 bg-white dark:bg-[#111A2E]",
            error: "border-rose-500/30 bg-white dark:bg-[#111A2E]",
            warning: "border-amber-500/30 bg-white dark:bg-[#111A2E]",
            info: "border-teal-500/30 bg-white dark:bg-[#111A2E]",
          };

          return (
            <div
              key={t.id}
              role="alert"
              className={cn(
                "pointer-events-auto p-4 rounded-2xl border shadow-lg flex items-center justify-between gap-3",
                "animate-in slide-in-from-right-5 duration-200",
                borders[t.type]
              )}
            >
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                {icons[t.type]}
                <span>{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="Yopish"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
