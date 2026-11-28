"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scale, Send } from "lucide-react";
import { appealHomeworkAction, type HomeworkSubmissionView } from "@/actions/homework.actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

/** O'quvchi: bahoga e'tiroz bildirish va uning holati (ustozda / qayta baholandi / rad etildi) */
export function AppealBox({ submission, readOnly = false }: { submission: HomeworkSubmissionView; readOnly?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = submission.appeal;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await appealHomeworkAction({ submissionId: submission._id, reason });
      if (!r.success) setError(r.message || "Yuborib bo'lmadi");
      else {
        toast.success(r.message || "Yuborildi");
        setOpen(false);
        setReason("");
        router.refresh();
      }
    } catch {
      setError("Yuborib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {a?.status === "open" && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Scale className="mt-0.5 h-4 w-4 shrink-0" /> E&apos;tirozingiz ustozda ko&apos;rib chiqilmoqda. Javob kelganda xabar olasiz.
        </p>
      )}
      {a?.status === "rejected" && (
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <p className="flex items-center gap-1.5 font-bold">
            <Scale className="h-4 w-4" /> E&apos;tirozingiz ko&apos;rib chiqildi — baho o&apos;zgarmadi
          </p>
          {a.answer && <p className="mt-1 whitespace-pre-line">💬 {a.answer}</p>}
        </div>
      )}
      {a?.status === "accepted" && (
        <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
          <Scale className="h-4 w-4" /> E&apos;tirozingiz ko&apos;rib chiqildi — ustoz qayta baholadi
        </p>
      )}
      {!readOnly && a?.status !== "open" && submission.appealsLeft > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <Scale className="h-3.5 w-3.5" /> Bahoga e&apos;tiroz bildirish
        </button>
      )}
      {open && (
        <div className="space-y-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Nima uchun baho noto&apos;g&apos;ri deb o&apos;ylaysiz?</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Qaysi topshiriq to&apos;g&apos;ri bajarilganini aniq yozing. Ustoz qayta ko&apos;rib chiqadi. Bu vazifa bo&apos;yicha yana {submission.appealsLeft} marta yozish mumkin.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Masalan: 3-misolda javobim 512 MB, bu to'g'ri — 0,5 × 1024 = 512" />
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Bekor qilish
            </Button>
            <Button type="button" size="sm" onClick={() => void send()} disabled={busy || reason.trim().length < 10}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Yuborish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
