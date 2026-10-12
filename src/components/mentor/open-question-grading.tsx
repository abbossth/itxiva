"use client";

import { Bot, UserRoundCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** "manual" — mentor o'zi tekshiradi; boshqa har qanday qiymat — avtomatik */
  grading?: "auto" | "manual";
  /** Namunaviy javob yoki baholash mezoni */
  sample: string;
  onChange: (patch: { grading?: "auto" | "manual"; correctAnswers?: string[] }) => void;
}

const MODES = [
  { value: "auto", label: "Avtomatik", icon: Bot },
  { value: "manual", label: "Mentor tekshiradi", icon: UserRoundCheck },
] as const;

/** Ochiq savolni kim tekshirishi va namunaviy javob — test va imtihon muharrirlarida bir xil */
export function OpenQuestionGrading({ grading, sample, onChange }: Props) {
  const mode = grading === "manual" ? "manual" : "auto";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tekshirish:</span>
        <div role="radiogroup" aria-label="Tekshirish usuli" className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => onChange({ grading: value })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 min-h-[36px] text-xs font-semibold cursor-pointer transition-colors",
                mode === value ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        rows={2}
        value={sample}
        onChange={(e) => onChange({ correctAnswers: e.target.value.trim() ? [e.target.value] : [] })}
        placeholder={mode === "auto" ? "Namunaviy javob yoki baholash mezoni (ixtiyoriy, lekin aniqroq baholaydi)" : "Namunaviy javob (ixtiyoriy — o'zingiz uchun)"}
        aria-label="Namunaviy javob"
        className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 resize-y"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {mode === "auto"
          ? "Javob namunaga aynan mos kelsa — to'liq ball. Aks holda sun'iy intellekt savol va namunaga qarab ball va izoh qo'yadi. Istalgan bahoni keyin o'zingiz o'zgartira olasiz."
          : "Bu savolga ballni faqat siz qo'yasiz. O'quvchi natijasi siz tekshirguningizcha \"Tekshirilmoqda\" bo'lib turadi."}
      </p>
    </div>
  );
}
