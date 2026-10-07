"use client";

import { useState } from "react";
import { PartyPopper } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { setCelebrationsEnabledAction } from "@/actions/profile.actions";

/** Reytingdagi salyutni yoqish/o'chirish (har bir foydalanuvchi o'zi uchun) */
export function CelebrationSetting({ initialEnabled }: { initialEnabled: boolean }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await setCelebrationsEnabledAction(next);
      if (!res.success) {
        setEnabled(!next);
        toast.error(res.message || "Sozlamani saqlab bo'lmadi");
      }
    } catch {
      setEnabled(!next);
      toast.error("Sozlamani saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
        <PartyPopper className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span id="celebration-label" className="block text-sm font-bold text-slate-900 dark:text-slate-100">
          Reytingda salyut
        </span>
        <span className="block text-xs text-slate-600 dark:text-slate-400">
          Kuchli uchlik ko&apos;rsatilganda konfetti, ovoz va titrash. O&apos;chirilsa, reyting jim ochiladi.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="celebration-label"
        disabled={saving}
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface ${
          enabled ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span aria-hidden className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${enabled ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}
