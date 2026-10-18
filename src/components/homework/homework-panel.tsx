"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ClipboardCheck,
  Clock,
  Link as LinkIcon,
  Loader2,
  MessageSquareText,
  Paperclip,
  Pencil,
  Plus,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CoinBadge } from "@/components/ui/coin-badge";
import { useToast } from "@/components/ui/toast";
import { SubmissionContent } from "@/components/homework/submission-content";
import { TaskAttachments } from "@/components/homework/task-attachments";
import { IntegrityReport } from "@/components/homework/integrity-report";
import {
  submitHomeworkAction,
  HomeworkSubmissionView,
  HomeworkTask,
} from "@/actions/homework.actions";
import type { IHomeworkFile } from "@/lib/db/models/homework-submission.model";
import {
  describeDue,
  formatFileSize,
  HOMEWORK_BLOCKED_EXTENSIONS,
  HOMEWORK_MAX_FILE_MB,
  HOMEWORK_MAX_FILES,
  HOMEWORK_MAX_LINKS,
  HOMEWORK_MAX_TEXT,
  HOMEWORK_STATE_BADGE,
  HOMEWORK_STATE_LABELS,
} from "@/lib/homework-status";
import { uploadFileToStorage } from "@/lib/upload-client";
import { fireConfetti } from "@/lib/confetti";
import { formatDateTimeUz } from "@/lib/utils";

interface HomeworkPanelProps {
  lessonId: string;
  task: HomeworkTask;
  submission: HomeworkSubmissionView | null;
  /** Mentor darsni o'quvchi ko'zi bilan ko'rganda: forma ko'rsatilmaydi */
  readOnly?: boolean;
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function HomeworkPanel({ lessonId, task, submission, readOnly = false }: HomeworkPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const state = submission ? submission.status : "missing";
  const isGraded = state === "graded";
  const due = describeDue(task.dueAt);

  // Hali yuborilmagan yoki qaytarilgan bo'lsa forma darhol ochiq; yuborilgan bo'lsa "Tahrirlash" bilan ochiladi
  const [editing, setEditing] = useState(state === "missing" || state === "returned");
  const [text, setText] = useState(submission?.text ?? "");
  const [links, setLinks] = useState<string[]>(submission?.links ?? []);
  const [files, setFiles] = useState<IHomeworkFile[]>(submission?.files ?? []);
  const [linkDraft, setLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Baholangan natija birinchi marta ko'rilganda kichik bayram (har bir baho uchun bir marta)
  const gradedKey = submission && isGraded ? `hw-seen:${submission._id}:${submission.gradedAt ?? ""}` : null;
  useEffect(() => {
    if (!gradedKey || readOnly) return;
    try {
      if (localStorage.getItem(gradedKey)) return;
      localStorage.setItem(gradedKey, "1");
    } catch {
      return;
    }
    if ((submission?.score ?? 0) >= 60) fireConfetti({ particleCount: 70, spread: 60 });
  }, [gradedKey, readOnly, submission?.score]);

  const addLink = () => {
    const value = linkDraft.trim();
    if (!value) return;
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    if (!isValidUrl(normalized)) {
      setErrorMsg("Havola noto'g'ri. Masalan: https://github.com/ism/loyiha");
      return;
    }
    if (links.length >= HOMEWORK_MAX_LINKS) {
      setErrorMsg(`Ko'pi bilan ${HOMEWORK_MAX_LINKS} ta havola qo'shiladi`);
      return;
    }
    if (!links.includes(normalized)) setLinks([...links, normalized]);
    setLinkDraft("");
    setShowLinkInput(false);
    setErrorMsg(null);
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setErrorMsg(null);

    let current = files;
    for (const file of picked) {
      if (current.length >= HOMEWORK_MAX_FILES) {
        setErrorMsg(`Ko'pi bilan ${HOMEWORK_MAX_FILES} ta fayl yuklanadi`);
        break;
      }
      const ext = file.name.includes(".") ? `.${file.name.split(".").pop()!.toLowerCase()}` : "";
      if (HOMEWORK_BLOCKED_EXTENSIONS.includes(ext)) {
        setErrorMsg(`${file.name}: ${ext} turidagi fayl qabul qilinmaydi`);
        continue;
      }
      if (file.size > HOMEWORK_MAX_FILE_MB * 1024 * 1024) {
        setErrorMsg(`${file.name}: hajmi ${HOMEWORK_MAX_FILE_MB} MB dan oshmasligi kerak`);
        continue;
      }
      try {
        setUploading(file.name);
        const uploaded = await uploadFileToStorage(file, { homeworkLessonId: lessonId });
        current = [
          ...current,
          { key: uploaded.key, name: file.name, mimeType: uploaded.contentType, size: uploaded.size },
        ];
        setFiles(current);
      } catch (err) {
        setErrorMsg(`${file.name}: ${err instanceof Error ? err.message : "yuklab bo'lmadi"}`);
      } finally {
        setUploading(null);
      }
    }
  };

  const handleSubmit = async () => {
    if (!text.trim() && links.length === 0 && files.length === 0) {
      setErrorMsg("Javob bo'sh: matn yozing, havola qo'shing yoki fayl yuklang");
      return;
    }
    try {
      setIsSending(true);
      setErrorMsg(null);
      const res = await submitHomeworkAction({ lessonId, text, links, files });
      if (res.success) {
        toast.success(res.message || "Javob yuborildi");
        setEditing(false);
        router.refresh();
      } else {
        setErrorMsg(res.message || "Javobni yuborib bo'lmadi");
      }
    } catch {
      setErrorMsg("Javobni yuborib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section aria-labelledby="homework-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="homework-heading" className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Uyga vazifa
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <Badge variant={HOMEWORK_STATE_BADGE[state]}>{HOMEWORK_STATE_LABELS[state]}</Badge>
          )}
          {submission?.isLate && <Badge variant="danger">Kechikkan</Badge>}
          <CoinBadge amount={task.coinsReward} size="sm" animate={false} title="100 ball uchun beriladigan coin" />
        </div>
      </div>

      {/* Qayerda turibdi: topshiriq → javob yuborildi → baholandi */}
      {!readOnly && <HomeworkSteps state={state} />}

      {/* Topshiriq */}
      <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4 sm:p-5">
        {task.instructions && (
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
            {task.instructions}
          </p>
        )}
        <TaskAttachments lessonId={lessonId} attachments={task.attachments} />
        {task.dueAt && (
          <p
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold ${
              due?.overdue && !submission
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Muddat: {formatDateTimeUz(task.dueAt)}</span>
            {!isGraded && due && <span suppressHydrationWarning>· {due.remaining}</span>}
          </p>
        )}
      </div>

      {/* Mentor bahosi yoki qaytargan izohi */}
      {submission && isGraded && (
        <div className="success-pulse rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
              {submission.score} <span className="text-sm font-bold text-slate-500">/ 100 ball</span>
            </span>
            {submission.coinsAwarded > 0 && <CoinBadge amount={submission.coinsAwarded} size="sm" animate={false} />}
          </div>
          {submission.feedback && (
            <p className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
              <MessageSquareText className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>{submission.feedback}</span>
            </p>
          )}
        </div>
      )}
      {submission && state === "returned" && submission.feedback && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-800 dark:text-rose-200 space-y-1"
        >
          <p className="font-bold">Mentor qayta ishlashni so&apos;radi:</p>
          <p className="whitespace-pre-line">{submission.feedback}</p>
        </div>
      )}

      {/* Yuborilgan javob */}
      {submission && !editing && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Yuborilgan: {formatDateTimeUz(submission.submittedAt)}
              {submission.attempt > 1 ? ` · ${submission.attempt}-urinish` : ""}
            </p>
            {!isGraded && !readOnly && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)} className="gap-2 min-h-[40px]">
                <Pencil className="w-4 h-4" />
                Javobni o&apos;zgartirish
              </Button>
            )}
          </div>
          <SubmissionContent
            submissionId={submission._id}
            text={submission.text}
            links={submission.links}
            files={submission.files}
          />
          <IntegrityReport integrity={submission.integrity} submissionId={submission._id} />
        </div>
      )}

      {/* Javob formasi: matn, ostida biriktirilganlar va bitta amallar qatori */}
      {editing && !readOnly && !isGraded && (
        <div className="rounded-2xl border border-teal-500/30 bg-white dark:bg-surface animate-in fade-in focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/15 transition-shadow">
          <label htmlFor="hw-text" className="sr-only">
            Javob matni yoki kod
          </label>
          <Textarea
            id="hw-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={HOMEWORK_MAX_TEXT}
            rows={7}
            spellCheck={false}
            placeholder="Javobingizni yoki kodingizni shu yerga yozing..."
            className="font-mono text-xs sm:text-sm border-0 rounded-b-none focus:ring-0 focus:border-0 bg-transparent dark:bg-transparent"
          />

          {(links.length > 0 || files.length > 0) && (
            <ul className="flex flex-wrap gap-1.5 px-3 pb-2">
              {links.map((link) => (
                <li
                  key={link}
                  className="inline-flex max-w-full items-center gap-1.5 pl-2.5 pr-0.5 rounded-lg bg-sky-500/10 text-xs text-slate-700 dark:text-slate-200"
                >
                  <LinkIcon className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                  <span className="truncate max-w-[240px]">{link.replace(/^https?:\/\//, "")}</span>
                  <button
                    type="button"
                    onClick={() => setLinks(links.filter((l) => l !== link))}
                    aria-label={`${link} havolasini olib tashlash`}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
              {files.map((file) => (
                <li
                  key={file.key}
                  className="inline-flex max-w-full items-center gap-1.5 pl-2.5 pr-0.5 rounded-lg bg-teal-500/10 text-xs text-slate-700 dark:text-slate-200"
                >
                  <Paperclip className="w-3.5 h-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((f) => f.key !== file.key))}
                    aria-label={`${file.name} faylini olib tashlash`}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showLinkInput && (
            <div className="flex items-center gap-2 px-3 pb-2 animate-in fade-in">
              <Input
                id="hw-link"
                type="url"
                inputMode="url"
                autoFocus
                aria-label="Havola (GitHub, Scratch, Google Drive...)"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  } else if (e.key === "Escape") {
                    setShowLinkInput(false);
                  }
                }}
                placeholder="https://github.com/... yoki Scratch, Google Drive havolasi"
              />
              <Button type="button" variant="secondary" onClick={addLink} disabled={!linkDraft.trim()} className="shrink-0 gap-1.5 min-h-[44px]">
                <Plus className="w-4 h-4" />
                Qo&apos;shish
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFiles}
            className="sr-only"
            tabIndex={-1}
            aria-label="Javob fayllarini tanlash"
          />

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkInput((v) => !v)}
              disabled={links.length >= HOMEWORK_MAX_LINKS}
              className="gap-1.5 min-h-[44px]"
              title={`Ko'pi bilan ${HOMEWORK_MAX_LINKS} ta havola`}
            >
              <LinkIcon className="w-4 h-4" />
              Havola
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(uploading) || files.length >= HOMEWORK_MAX_FILES}
              className="gap-1.5 min-h-[44px]"
              title={`${HOMEWORK_MAX_FILES} tagacha fayl, har biri ${HOMEWORK_MAX_FILE_MB} MB gacha`}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              <span className="truncate max-w-[160px]">{uploading ? `Yuklanmoqda: ${uploading}` : "Fayl"}</span>
            </Button>

            <div className="ml-auto flex items-center gap-2">
              {submission && state === "submitted" && (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={isSending} className="min-h-[44px]">
                  Bekor qilish
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmit}
                isLoading={isSending}
                disabled={Boolean(uploading)}
                className="gap-2 min-h-[44px] font-semibold"
              >
                <Send className="w-4 h-4" />
                {submission ? "Qayta yuborish" : "Javobni yuborish"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editing && !readOnly && !isGraded && (errorMsg || due?.overdue) && (
        <div className="space-y-1">
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
              {errorMsg}
            </p>
          )}
          {due?.overdue && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400" suppressHydrationWarning>
              Muddat o&apos;tgan — javob &quot;kechikkan&quot; deb belgilanadi.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Vazifa bosqichlari: o'quvchi qayerda turganini bir qarashda ko'radi */
function HomeworkSteps({ state }: { state: "missing" | HomeworkSubmissionView["status"] }) {
  // Nechta bosqich bajarilgan: topshiriq doim berilgan; returned — mentor qaytargan, javob qayta yuboriladi
  const doneCount = state === "graded" ? 3 : state === "submitted" ? 2 : 1;
  const steps = [
    "Topshiriq berildi",
    state === "missing" ? "Javob yuborish" : state === "returned" ? "Qayta yuborish" : "Javob yuborildi",
    state === "graded" ? "Baholandi" : "Mentor tekshiradi",
  ];
  return (
    <ol className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold" aria-label="Vazifa bosqichlari">
      {steps.map((label, i) => {
        const done = i < doneCount;
        const active = i === doneCount;
        return (
          <li key={i} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                done
                  ? "bg-emerald-500 text-white"
                  : active
                  ? state === "returned"
                    ? "bg-rose-500 text-white"
                    : "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`truncate ${done || active ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className={`h-px flex-1 min-w-3 ${i < doneCount - 1 ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
