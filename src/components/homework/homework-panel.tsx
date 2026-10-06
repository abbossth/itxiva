"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
        </div>
      )}

      {/* Javob formasi */}
      {editing && !readOnly && !isGraded && (
        <div className="space-y-4 rounded-2xl border border-teal-500/30 p-4 sm:p-5 animate-in fade-in">
          <div className="space-y-1.5">
            <label htmlFor="hw-text" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Javob matni yoki kod
            </label>
            <Textarea
              id="hw-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={HOMEWORK_MAX_TEXT}
              rows={8}
              spellCheck={false}
              placeholder="Javobingizni yoki kodingizni shu yerga yozing..."
              className="font-mono text-xs sm:text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="hw-link" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Havolalar <span className="font-normal text-slate-500 dark:text-slate-400">(GitHub, Scratch, Google Drive...)</span>
            </label>
            {links.length > 0 && (
              <ul className="space-y-1.5">
                {links.map((link) => (
                  <li
                    key={link}
                    className="flex items-center gap-2 pl-3 pr-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-700 dark:text-slate-200"
                  >
                    <LinkIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                    <span className="truncate flex-1">{link}</span>
                    <button
                      type="button"
                      onClick={() => setLinks(links.filter((l) => l !== link))}
                      aria-label={`${link} havolasini olib tashlash`}
                      className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <Input
                id="hw-link"
                type="url"
                inputMode="url"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="https://..."
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addLink}
                disabled={!linkDraft.trim()}
                className="shrink-0 gap-1.5 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Qo&apos;shish
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Fayllar{" "}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                ({HOMEWORK_MAX_FILES} tagacha, har biri {HOMEWORK_MAX_FILE_MB} MB gacha)
              </span>
            </p>
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((file) => (
                  <li
                    key={file.key}
                    className="flex items-center gap-2 pl-3 pr-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-700 dark:text-slate-200"
                  >
                    <Paperclip className="w-3.5 h-3.5 shrink-0 text-teal-600" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((f) => f.key !== file.key))}
                      aria-label={`${file.name} faylini olib tashlash`}
                      className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(uploading) || files.length >= HOMEWORK_MAX_FILES}
              className="gap-2 min-h-[44px]"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              <span className="truncate max-w-[220px]">{uploading ? `Yuklanmoqda: ${uploading}` : "Fayl tanlash"}</span>
            </Button>
          </div>

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

          <div className="flex flex-wrap items-center justify-end gap-2">
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
      )}
    </section>
  );
}
