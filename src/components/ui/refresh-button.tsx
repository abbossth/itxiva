"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sahifa ma'lumotini serverdan qayta oladi (sahifa qayta yuklanmaydi, tanlangan tab va yozilganlar saqlanadi).
 * `intervalMs` berilsa, o'zi ham vaqti-vaqti bilan yangilanadi — faqat tugma ko'rinib turganda (yashirin tabda emas)
 * va brauzer oynasi ochiq bo'lganda; oynaga qaytilganda ham darhol yangilanadi.
 */
export function RefreshButton({ intervalMs, className }: { intervalMs?: number; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const lastRef = useRef(0);

  const refresh = () => {
    lastRef.current = Date.now();
    startTransition(() => {
      router.refresh();
      setUpdatedAt(new Date());
    });
  };
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!intervalMs) return;
    lastRef.current = Date.now();
    // Ko'rinmayotgan tab yoki yopiq oyna uchun serverga so'rov ketmaydi
    const visible = () => document.visibilityState === "visible" && ref.current?.offsetParent != null;
    const tick = () => {
      if (visible() && Date.now() - lastRef.current >= intervalMs) refreshRef.current();
    };
    const timer = window.setInterval(tick, Math.min(intervalMs, 10_000));
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);

  const time = updatedAt?.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <button
      ref={ref}
      type="button"
      onClick={refresh}
      disabled={isPending}
      aria-label="Yangilash"
      title={
        (time ? `Oxirgi yangilanish: ${time}. ` : "") +
        (intervalMs ? `O'zi har ${Math.round(intervalMs / 1000)} soniyada yangilanadi` : "Yangilash")
      }
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:cursor-default",
        className
      )}
    >
      <RefreshCw className={cn("w-4 h-4", isPending && "animate-spin text-teal-600 dark:text-teal-400")} />
    </button>
  );
}
