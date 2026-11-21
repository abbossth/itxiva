"use client";

import { useEffect, useState } from "react";
import { fixBiasedQuestionsAction, quizQualityReportAction, type QuizQualityItem } from "@/actions/ai.actions";
import { Button } from "@/components/ui/button";

// Mentor: barcha test va imtihonlarda to'g'ri javobi uzunligidan bilinib qoladigan savollar.
// "Hammasini tuzatish" — AI 15 tadan tenglashtirib boradi (variantlar bir xil uzunlik va uslubda).

export function QuizQualityCard() {
  const [items, setItems] = useState<QuizQualityItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [aiReady, setAiReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const r = await quizQualityReportAction();
    if (r.success && r.data) {
      setItems(r.data.items);
      setTotal(r.data.total);
      setAiReady(r.data.aiReady);
    }
  };
  useEffect(() => {
    let alive = true;
    void quizQualityReportAction().then((r) => {
      if (!alive || !r.success || !r.data) return;
      setItems(r.data.items);
      setTotal(r.data.total);
      setAiReady(r.data.aiReady);
    });
    return () => {
      alive = false;
    };
  }, []);

  const fixAll = async () => {
    setRunning(true);
    setMsg(null);
    setDone(0);
    const skip: string[] = [];
    let fixed = 0;
    let busy = 0;
    let error: string | null = null;
    let retries = 0;
    try {
      for (let round = 0; round < 60; round++) {
        let r: Awaited<ReturnType<typeof fixBiasedQuestionsAction>>;
        try {
          r = await fixBiasedQuestionsAction(skip);
        } catch {
          r = { success: false, message: "Server bilan aloqa uzildi" };
        }
        if (!r.success || !r.data) {
          error = r.message || "Tuzatib bo'lmadi";
          // AI vaqtincha band — biroz kutib qayta urinamiz; kunlik limit tugagan bo'lsa to'xtaymiz
          if (/limit/i.test(error) || retries >= 3) break;
          retries++;
          setMsg(`${error} — 20 soniyadan keyin qayta urinilmoqda (${retries}/3)…`);
          await new Promise((res) => setTimeout(res, 20_000));
          continue;
        }
        error = null;
        retries = 0;
        setMsg(null);
        fixed += r.data.fixed;
        busy = r.data.busy;
        skip.push(...r.data.failed);
        setDone(fixed);
        if (r.data.remaining === 0 || (r.data.fixed === 0 && r.data.failed.length === 0)) break;
      }
      setMsg(
        `${fixed} ta savol tuzatildi.` +
          (skip.length ? ` ${skip.length} tasini AI yaxshilay olmadi — ularni qo'lda tahrirlang.` : "") +
          (busy ? ` ${busy} tasi hozir yechilayotgan testda — keyinroq qayta bosing.` : "") +
          (error ? ` To'xtadi: ${error}. Qolganlarini keyinroq qayta bosib tuzating.` : "")
      );
    } finally {
      setRunning(false);
      void load();
    }
  };

  if (!items || total === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-amber-900 dark:text-amber-100">⚖️ {total} ta savolda to&apos;g&apos;ri javob uzunligidan bilinib qoladi</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
            To&apos;g&apos;ri javob boshqa variantlardan ancha uzun bo&apos;lsa, o&apos;quvchilar o&apos;qimasdan ham eng uzun variantni tanlab topib olishadi.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Yashirish" : "Ro'yxat"}
          </Button>
          {aiReady && (
            <Button type="button" size="sm" variant="primary" onClick={fixAll} isLoading={running}>
              {running ? `Tuzatilmoqda… ${done}` : "AI bilan hammasini tuzatish"}
            </Button>
          )}
        </div>
      </div>
      {msg && <p className="mt-2 text-xs font-bold text-amber-900 dark:text-amber-100">{msg}</p>}
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
