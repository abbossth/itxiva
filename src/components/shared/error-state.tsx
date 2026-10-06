"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

interface ErrorStateProps {
  error: Error & { digest?: string };
  retry: () => void;
  /** To'liq ekranli ko'rinish (dashboard tashqarisida) */
  fullScreen?: boolean;
}

/** Kutilmagan xato uchun umumiy ko'rinish: tushunarli xabar, qayta urinish va bosh sahifaga qaytish */
export function ErrorState({ error, retry, fullScreen = false }: ErrorStateProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className={
        fullScreen
          ? "min-h-screen flex flex-col items-center justify-center p-4 text-center bg-slate-50 dark:bg-bg"
          : "flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl border border-dashed border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/10"
      }
    >
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7" />
      </div>
      <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">Nimadir xato ketdi</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-sm">
        Sahifani yuklashda kutilmagan xatolik yuz berdi. Qayta urinib ko&apos;ring — muammo takrorlansa, mentorga
        xabar bering.
      </p>
      {error.digest && (
        <p className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">Xato kodi: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={() => retry()} className="gap-2 min-h-[44px]">
          <RotateCcw className="w-4 h-4" />
          Qayta urinish
        </Button>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          Bosh sahifa
        </Link>
      </div>
    </div>
  );
}
