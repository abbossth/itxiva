"use client";

import { useState } from "react";
import { Sparkles, Wand2, Presentation, FileText, Download, Check, X, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  generateLessonDraftAction,
  improveTextAction,
  generatePresentationAction,
  generateHandoutAction,
  GeneratedFile,
} from "@/actions/ai.actions";
import { triggerDownload } from "@/lib/xlsx-client";
import type { IMaterial } from "@/lib/db/models/lesson.model";

interface LessonDraft {
  title: string;
  topic: string;
  description: string;
}

interface AiAssistantPanelProps {
  enabled: boolean;
  grade?: number;
  lesson: LessonDraft;
  onApplyDraft: (draft: LessonDraft) => void;
  onApplyDescription: (text: string) => void;
  onAttachMaterial: (material: IMaterial) => void;
}

type Task = "draft" | "improve" | "pptx" | "docx";

const TASK_LABEL: Record<Task, string> = {
  draft: "Dars matni yozilmoqda…",
  improve: "Matn tahrir qilinmoqda…",
  pptx: "Taqdimot tayyorlanmoqda… (1–2 daqiqa)",
  docx: "Konspekt tayyorlanmoqda… (1–2 daqiqa)",
};

function downloadGenerated(file: GeneratedFile) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  triggerDownload(new Blob([bytes], { type: file.mimeType }), file.filename);
}

export function AiAssistantPanel({
  enabled,
  grade,
  lesson,
  onApplyDraft,
  onApplyDescription,
  onAttachMaterial,
}: AiAssistantPanelProps) {
  const { toast } = useToast();
  const [topicInput, setTopicInput] = useState("");
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState<Task | null>(null);
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [improved, setImproved] = useState<string | null>(null);
  const [files, setFiles] = useState<(GeneratedFile & { attached: boolean })[]>([]);

  const run = async <T,>(task: Task, action: () => Promise<{ success: boolean; message?: string; data?: T }>) => {
    if (running) return null;
    setRunning(task);
    try {
      const res = await action();
      if (res.success && res.data) return res.data;
      toast.error(res.message || "AI yordamchi javob bermadi");
      return null;
    } catch {
      toast.error("AI yordamchiga ulanib bo'lmadi");
      return null;
    } finally {
      setRunning(null);
    }
  };

  const handleDraft = async () => {
    const data = await run("draft", () =>
      generateLessonDraftAction({ topic: topicInput || lesson.title, grade, notes })
    );
    if (data) setDraft(data);
  };

  const handleImprove = async () => {
    const data = await run("improve", () => improveTextAction(lesson.description));
    if (data) setImproved(data.text);
  };

  const handleFile = async (task: "pptx" | "docx") => {
    const action = task === "pptx" ? generatePresentationAction : generateHandoutAction;
    const data = await run(task, () => action({ ...lesson, grade }));
    if (!data) return;
    setFiles((prev) => [...prev, { ...data, attached: false }]);
    toast.success(task === "pptx" ? "Taqdimot tayyor" : "Konspekt tayyor");
  };

  if (!enabled) {
    return (
      <div className="p-5 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 flex items-start gap-3">
        <Sparkles className="w-5 h-5 shrink-0 text-slate-500 dark:text-slate-400 mt-0.5" />
        <span>
          AI yordamchi o&apos;chirilgan: serverda <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> yoki{" "}
          <code className="font-mono text-xs">GEMINI_API_KEY</code> sozlanmagan.
        </span>
      </div>
    );
  }

  const canUseLesson = lesson.title.trim().length >= 3;

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-teal-500/10 via-white to-blue-500/10 dark:from-teal-950/40 dark:via-surface dark:to-blue-950/30 border border-teal-500/30 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-itxiva-gradient text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">AI yordamchi</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Natija avval ko&apos;rsatiladi — siz tasdiqlamaguningizcha darsga hech narsa yozilmaydi
          </p>
        </div>
      </div>

      {/* 1. Dars matni */}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field htmlFor="ai-topic" label="Mavzu" hint="Bo'sh qoldirilsa dars sarlavhasi olinadi">
          <Input
            id="ai-topic"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="masalan: CSS Flexbox asoslari"
            maxLength={300}
          />
        </Field>
        <Field htmlFor="ai-notes" label="Izoh (ixtiyoriy)" hint="Nimaga urg'u berilsin">
          <Input
            id="ai-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="masalan: ko'proq amaliy mashq"
            maxLength={1000}
          />
        </Field>
        <Button
          type="button"
          variant="primary"
          onClick={handleDraft}
          isLoading={running === "draft"}
          disabled={Boolean(running) || (topicInput.trim().length < 3 && !canUseLesson)}
          className="gap-2 sm:mb-[22px]"
        >
          <Wand2 className="w-4 h-4" />
          Dars matnini yozish
        </Button>
      </div>

      {/* 2-4. Mavjud dars asosida */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleImprove}
          isLoading={running === "improve"}
          disabled={Boolean(running) || lesson.description.trim().length < 20}
          className="gap-1.5 min-h-[44px] bg-white/70 dark:bg-transparent"
        >
          <Wand2 className="w-4 h-4" />
          Konspektni yaxshilash
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleFile("pptx")}
          isLoading={running === "pptx"}
          disabled={Boolean(running) || !canUseLesson}
          className="gap-1.5 min-h-[44px] bg-white/70 dark:bg-transparent"
        >
          <Presentation className="w-4 h-4" />
          Taqdimot (.pptx)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleFile("docx")}
          isLoading={running === "docx"}
          disabled={Boolean(running) || !canUseLesson}
          className="gap-1.5 min-h-[44px] bg-white/70 dark:bg-transparent"
        >
          <FileText className="w-4 h-4" />
          Konspekt (.docx)
        </Button>
      </div>
      {!canUseLesson && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2">
          Taqdimot va konspekt uchun avval dars sarlavhasini (va imkon bo&apos;lsa konspektini) kiriting.
        </p>
      )}

      {running && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">{TASK_LABEL[running]}</p>
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {draft && (
        <div className="p-4 rounded-2xl bg-white dark:bg-bg border border-slate-200 dark:border-slate-800 space-y-3 page-enter">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{draft.title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{draft.topic}</div>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
            {draft.description}
          </p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} className="gap-1.5 min-h-[44px]">
              <X className="w-4 h-4" />
              Tashlab yuborish
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                onApplyDraft(draft);
                setDraft(null);
                toast.success("Dars matni formaga qo'yildi");
              }}
              className="gap-1.5 min-h-[44px]"
            >
              <Check className="w-4 h-4" />
              Formaga qo&apos;yish
            </Button>
          </div>
        </div>
      )}

      {improved !== null && (
        <div className="p-4 rounded-2xl bg-white dark:bg-bg border border-slate-200 dark:border-slate-800 space-y-3 page-enter">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Yaxshilangan konspekt
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
            {improved}
          </p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setImproved(null)} className="gap-1.5 min-h-[44px]">
              <X className="w-4 h-4" />
              Eskisini qoldirish
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                onApplyDescription(improved);
                setImproved(null);
                toast.success("Konspekt yangilandi");
              }}
              className="gap-1.5 min-h-[44px]"
            >
              <Check className="w-4 h-4" />
              Almashtirish
            </Button>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, i) => (
            <li
              key={`${file.filename}-${i}`}
              className="p-3 rounded-2xl bg-white dark:bg-bg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2 page-enter"
            >
              <span className="flex items-center gap-2 min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {file.filename.endsWith(".pptx") ? (
                  <Presentation className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                )}
                <span className="truncate">{file.filename}</span>
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => downloadGenerated(file)} className="gap-1.5 min-h-[44px]">
                  <Download className="w-4 h-4" />
                  Yuklab olish
                </Button>
                {file.material && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={file.attached}
                    onClick={() => {
                      onAttachMaterial(file.material!);
                      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, attached: true } : f)));
                      toast.success("Fayl dars materiallariga qo'shildi. Saqlashni unutmang");
                    }}
                    className="gap-1.5 min-h-[44px]"
                  >
                    <Paperclip className="w-4 h-4" />
                    {file.attached ? "Biriktirildi" : "Darsga biriktirish"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
