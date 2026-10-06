"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { fireConfetti } from "@/lib/confetti";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoinBadge } from "@/components/ui/coin-badge";
import { markAttendanceAction } from "@/actions/attendance.actions";

interface QrCheckinProps {
  token: string;
}

export function QrCheckin({ token }: QrCheckinProps) {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const [coinsEarned, setCoinsEarned] = useState<number>(10);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    async function checkIn() {
      try {
        const res = await markAttendanceAction({ token });
        if (res.success) {
          setStatus("success");
          setMessage(res.message || "Davomat muvaffaqiyatli belgilandi!");
          setCoinsEarned(res.data?.coinsEarned || 10);

          fireConfetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
        } else {
          setStatus("error");
          setMessage(res.message || "Davomatdan o'tib bo'lmadi");
        }
      } catch {
        setStatus("error");
        setMessage("Kutilmagan xatolik yuz berdi");
      }
    }

    checkIn();
  }, [token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xl text-center space-y-6 animate-in fade-in">
        {status === "loading" && (
          <div className="py-12 space-y-4">
            <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Davomat tekshirilmoqda...
            </h2>
            <p className="text-xs text-slate-500">QR kod ma&apos;lumotlari serverga yuborilmoqda</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-5 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-500/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                Davomatingiz belgilandi!
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {message}
              </p>
            </div>

            {/* Coin reward celebration */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center gap-3">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                Hisobingizga qo&apos;shildi:
              </span>
              <CoinBadge amount={coinsEarned} size="md" animate={true} />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link href="/lessons">
                <Button variant="primary" size="lg" className="w-full justify-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>Darslarga o&apos;tish</span>
                </Button>
              </Link>
              <Link href="/attendance">
                <Button variant="secondary" className="w-full justify-center text-xs">
                  Davomat tarixini ko&apos;rish
                </Button>
              </Link>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border-2 border-rose-500/20">
              <AlertCircle className="w-9 h-9" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Davomatdan o&apos;tib bo&apos;lmadi
              </h2>
              <p className="text-xs sm:text-sm text-rose-600 dark:text-rose-400">
                {message}
              </p>
            </div>

            <div className="pt-2 space-y-2">
              <Link href="/attendance">
                <Button variant="primary" className="w-full justify-center gap-2">
                  <span>6 belgili kod orqali urinib ko&apos;rish</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/lessons">
                <Button variant="secondary" className="w-full justify-center text-xs">
                  Darslar sahifasiga qaytish
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
