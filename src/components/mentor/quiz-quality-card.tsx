"use client";

import { useEffect, useState } from "react";
import { quizQualityReportAction, type QuizQualityItem } from "@/actions/ai.actions";
import { Button } from "@/components/ui/button";

// Mentor: barcha test va imtihonlarda to'g'ri javobi uzunligidan bilinib qoladigan savollar (ogohlantirish).
// Tuzatish — test muharririda ("Variantlarni tenglashtirish") yoki qo'lda. Hammasi tuzatilgan bo'lsa, karta ko'rinmaydi.

export function QuizQualityCard() {
  const [items, setItems] = useState<QuizQualityItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void quizQualityReportAction().then((r) => {
      if (!alive || !r.success || !r.data) return;
      setItems(r.data.items);
      setTotal(r.data.total);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!items || total === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-amber-900 dark:text-amber-100">⚖️ {total} ta savolda to&apos;g&apos;ri javob uzunligidan bilinib qoladi</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
            To&apos;g&apos;ri javob boshqa variantlardan ancha uzun bo&apos;lsa, o&apos;quvchilar o&apos;qimasdan ham eng uzun variantni tanlab topib olishadi.
            Testni ochib, variantlarni bir xil uzunlikda qiling.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Yashirish" : "Ro'yxat"}
        </Button>
      </div>
      {open && (
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto text-xs">
          {items.map((it) => (
            <li key={it.key} className="rounded-lg bg-white/70 px-3 py-2 dark:bg-slate-900/50">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {it.kind === "exam" ? "Imtihon" : "Test"}: {it.title}
              </span>{" "}
              <span className="text-slate-500">— {it.prompt}</span>{" "}
              <span className="font-mono text-amber-700 dark:text-amber-300">×{it.ratio}</span>
            </li>
          ))}
          {total > items.length && <li className="px-3 text-slate-500">…yana {total - items.length} ta</li>}
        </ul>
      )}
    </div>
  );
}
