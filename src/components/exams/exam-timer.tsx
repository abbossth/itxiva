"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface ExamTimerProps {
  startedAt: string;
  durationMinutes: number;
  onTimeExpired: () => void;
}

export function ExamTimer({ startedAt, durationMinutes, onTimeExpired }: ExamTimerProps) {
  const [timeLeftMs, setTimeLeftMs] = useState<number>(() => {
    const startTime = new Date(startedAt).getTime();
    const endTime = startTime + durationMinutes * 60 * 1000;
    return Math.max(0, endTime - Date.now());
  });

  useEffect(() => {
    const startTime = new Date(startedAt).getTime();
    const endTime = startTime + durationMinutes * 60 * 1000;

    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onTimeExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, durationMinutes, onTimeExpired]);

  const totalDurationMs = durationMinutes * 60 * 1000;
  const progressPercent = Math.max(0, Math.min(100, (timeLeftMs / totalDurationMs) * 100));

  const totalSeconds = Math.floor(timeLeftMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Rangi va holati
  const isUrgent = minutes < 5;
  const isWarning = minutes < 10 && !isUrgent;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all ${
        isUrgent
          ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse"
          : isWarning
          ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300"
      }`}
    >
      <div className="relative flex items-center justify-center shrink-0">
        {isUrgent ? (
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
        ) : (
          <Clock className="w-5 h-5" />
        )}
      </div>

      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          Qolgan vaqt
        </span>
        <span className="text-base sm:text-lg font-black tracking-mono font-mono leading-none">
          {formattedTime}
        </span>
      </div>

      {/* Mini progress bar */}
      <div className="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden ml-2 hidden sm:block">
        <div
          className={`h-full transition-all duration-1000 ${
            isUrgent ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-teal-500"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
