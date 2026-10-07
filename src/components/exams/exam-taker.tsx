"use client";

import { STUDENT_MAX_UPLOAD_MB } from "@/lib/homework-status";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { IExamData } from "@/lib/db/models/exam.model";
import { IExamSubmissionData, IExamAnswer } from "@/lib/db/models/exam-submission.model";
import { saveExamDraftAction, submitExamAction } from "@/actions/exam.actions";
import { ExamTimer } from "./exam-timer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  UploadCloud,
  CheckCircle2,
  Clock,
  GitBranch,
  FileCheck,
  Send,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

interface ExamTakerProps {
  exam: IExamData;
  initialSubmission: IExamSubmissionData;
  deadline: string;
  serverTime: string;
  durationMinutes: number;
}

export function ExamTaker({
  exam,
  initialSubmission,
  deadline,
  serverTime,
  durationMinutes,
}: ExamTakerProps) {
  const router = useRouter();

  // Answers state
  const [answers, setAnswers] = useState<Record<string, IExamAnswer>>(() => {
    const map: Record<string, IExamAnswer> = {};
    if (initialSubmission.answers) {
      initialSubmission.answers.forEach((ans) => {
        map[ans.questionId] = ans;
      });
    }
    return map;
  });

  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>("Barcha javoblar saqlangan");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Auto-save logic
  const performSaveDraft = useCallback(async () => {
    try {
      setSavingDraft(true);
      const answersList = Object.values(answersRef.current);
      await saveExamDraftAction({
        examId: exam._id,
        answers: answersList,
      });
      setLastSavedTime(
        `Saqlandi: ${new Date().toLocaleTimeString("uz-UZ", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}`
      );
    } catch {
      // ignore draft save error
    } finally {
      setSavingDraft(false);
    }
  }, [exam._id]);

  // Periodic auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      performSaveDraft();
    }, 30000);
    return () => clearInterval(interval);
  }, [performSaveDraft]);

  // Update a single answer
  const updateAnswer = (questionId: string, patch: Partial<IExamAnswer>) => {
    setAnswers((prev) => {
      const current = prev[questionId] || {
        questionId,
        type: exam.questions.find((q) => q._id?.toString() === questionId)?.type || "single_choice",
        pointsAwarded: 0,
      };
      return {
        ...prev,
        [questionId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  // Upload project file to R2
  const handleFileUpload = async (questionId: string, file: File) => {
    setError(null);
    // Katta fayl serverga yuborilmasdan oldin rad etiladi
    if (file.size > STUDENT_MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`${file.name}: fayl hajmi ${STUDENT_MAX_UPLOAD_MB} MB dan oshmasligi kerak`);
      return;
    }
    setUploadProgress((prev) => ({ ...prev, [questionId]: "Yuklanmoqda..." }));

    try {
      // 1. Get presigned PUT URL (the server validates the file and generates the storage key)
      const contentType = file.type || "application/octet-stream";
      const presignedRes = await fetch("/api/upload/presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType,
          fileSize: file.size,
          examId: exam._id,
          questionId,
        }),
      });

      if (!presignedRes.ok) {
        const data = await presignedRes.json().catch(() => null);
        throw new Error(data?.error || "Fayl yuklashga ruxsat olinmadi");
      }

      const { uploadUrl, key } = await presignedRes.json();

      // 2. Upload directly to Cloudflare R2
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Faylni R2 ga yuklashda xatolik yuz berdi");
      }

      updateAnswer(questionId, {
        type: "project_upload",
        fileKey: key,
        fileName: file.name,
        fileSize: file.size,
      });

      setUploadProgress((prev) => ({ ...prev, [questionId]: "Fayl yuklandi!" }));
      setTimeout(() => {
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[questionId];
          return next;
        });
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Yuklashda xatolik";
      setError(msg);
      setUploadProgress((prev) => ({ ...prev, [questionId]: "Xato!" }));
    }
  };

  // Handle final submission (manual or automatic when time expires)
  const isSubmittingRef = useRef(false);
  const handleSubmitExam = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setIsSubmitting(true);

    try {
      const answersList = Object.values(answersRef.current);
      const res = await submitExamAction({
        examId: exam._id,
        answers: answersList,
      });

      if (!res.success) {
        setError(res.error || "Imtihonni topshirishda xatolik yuz berdi");
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      } else {
        router.push("/exams");
        router.refresh();
      }
    } catch {
      setError("Server bilan aloqada xatolik yuz berdi");
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // Check how many questions are answered
  const answeredCount = exam.questions.filter((q) => {
    const qId = q._id?.toString() || "";
    const a = answers[qId];
    if (!a) return false;
    if (a.value && (typeof a.value === "string" ? a.value.trim() : a.value.length > 0)) return true;
    if (a.fileKey || a.repoUrl) return true;
    return false;
  }).length;

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24 animate-in fade-in">
      {/* Sticky Top Header with Timer and Status */}
      <div className="sticky top-16 z-40 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-bg/95 backdrop-blur-lg shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate max-w-xs sm:max-w-md">
            {exam.title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />
              {answeredCount} / {exam.questions.length} ta yechildi
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              {savingDraft ? (
                <>
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  Saqlanmoqda...
                </>
              ) : (
                lastSavedTime
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ExamTimer
            deadline={deadline}
            serverTime={serverTime}
            durationMinutes={durationMinutes}
            onTimeExpired={handleSubmitExam}
          />
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowConfirmModal(true)}
            className="flex items-center gap-2 font-semibold"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Topshirish</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Question quick jump pills */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80">
        <span className="text-xs font-semibold text-slate-500 mr-1">Savollar:</span>
        {exam.questions.map((q, idx) => {
          const qId = q._id?.toString() || "";
          const isAnswered = !!(
            answers[qId]?.value ||
            answers[qId]?.fileKey ||
            answers[qId]?.repoUrl
          );

          return (
            <button
              key={qId}
              type="button"
              onClick={() => {
                const el = document.getElementById(`question-${idx}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className={`w-8 h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center select-none ${
                isAnswered
                  ? "bg-teal-500 text-white shadow-xs"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400"
              }`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Question Items List */}
      <div className="space-y-6">
        {exam.questions.map((q, idx) => {
          const qId = q._id?.toString() || "";
          const currentAnswer = answers[qId];

          return (
            <Card
              key={qId}
              id={`question-${idx}`}
              className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs space-y-4"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    {idx + 1}-savol &bull; {q.points} ball
                  </span>
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 pt-1 whitespace-pre-wrap leading-relaxed">
                    {q.prompt}
                  </h2>
                </div>
              </div>

              {/* Single choice */}
              {q.type === "single_choice" && (
                <div className="space-y-2 pt-1">
                  {q.options?.map((opt, oIdx) => {
                    const isSelected = currentAnswer?.value === opt;
                    return (
                      <button
                        type="button"
                        key={oIdx}
                        onClick={() => updateAnswer(qId, { type: q.type, value: opt })}
                        className={`w-full text-left p-4 rounded-xl border transition-all text-sm flex items-center gap-3 min-h-[48px] select-none ${
                          isSelected
                            ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 font-semibold"
                            : "border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "border-teal-500 bg-teal-500 text-white"
                              : "border-slate-400"
                          }`}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Multiple choice */}
              {q.type === "multiple_choice" && (
                <div className="space-y-2 pt-1">
                  {q.options?.map((opt, oIdx) => {
                    const selectedList = Array.isArray(currentAnswer?.value)
                      ? (currentAnswer.value as string[])
                      : [];
                    const isSelected = selectedList.includes(opt);

                    return (
                      <button
                        type="button"
                        key={oIdx}
                        onClick={() => {
                          const next = isSelected
                            ? selectedList.filter((item) => item !== opt)
                            : [...selectedList, opt];
                          updateAnswer(qId, { type: q.type, value: next });
                        }}
                        className={`w-full text-left p-4 rounded-xl border transition-all text-sm flex items-center gap-3 min-h-[48px] select-none ${
                          isSelected
                            ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 font-semibold"
                            : "border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "border-teal-500 bg-teal-500 text-white"
                              : "border-slate-400"
                          }`}
                        >
                          {isSelected && <span className="w-2 h-1 border-l-2 border-b-2 border-white -rotate-45" />}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Open ended */}
              {q.type === "open_ended" && (
                <div className="pt-1">
                  <textarea
                    rows={4}
                    value={typeof currentAnswer?.value === "string" ? currentAnswer.value : ""}
                    onChange={(e) => updateAnswer(qId, { type: q.type, value: e.target.value })}
                    placeholder="Batafsil javobingizni yoki yechimingizni yozing..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500 resize-y"
                  />
                </div>
              )}

              {/* Project upload (Cloudflare R2 direct upload) */}
              {q.type === "project_upload" && (
                <div className="pt-1 space-y-3">
                  <div className="p-5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Loyiha faylini yuklang
                        {q.allowedFileTypes?.length ? ` (${q.allowedFileTypes.join(", ")})` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        Maksimal hajm: {Math.min(q.maxFileSizeMb || STUDENT_MAX_UPLOAD_MB, STUDENT_MAX_UPLOAD_MB)} MB.
                      </p>
                    </div>

                    <input
                      type="file"
                      id={`file-${qId}`}
                      className="hidden"
                      accept={q.allowedFileTypes?.join(",")}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(qId, file);
                        e.target.value = "";
                      }}
                    />
                    <label
                      htmlFor={`file-${qId}`}
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400"
                    >
                      <span>Fayl tanlash</span>
                    </label>

                    {uploadProgress[qId] && (
                      <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                        {uploadProgress[qId]}
                      </span>
                    )}
                  </div>

                  {currentAnswer?.fileName && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200">
                      <div className="flex items-center gap-2 truncate">
                        <FileCheck className="w-4 h-4 text-teal-600 shrink-0" />
                        <span className="truncate font-medium">{currentAnswer.fileName}</span>
                      </div>
                      <span className="text-slate-500 shrink-0 ml-2">
                        {currentAnswer.fileSize ? `${Math.round(currentAnswer.fileSize / 1024)} KB` : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* GitHub Repository */}
              {q.type === "github_repo" && (
                <div className="pt-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <GitBranch className="w-5 h-5" />
                    </span>
                    <input
                      type="url"
                      value={currentAnswer?.repoUrl || ""}
                      onChange={(e) => updateAnswer(qId, { type: q.type, repoUrl: e.target.value })}
                      placeholder="https://github.com/username/project-repository"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    GitHub loyihangiz public yoki mentor uchun ochiq ekanligiga ishonch hosil qiling.
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Confirmation modal before final submit */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-md p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>Imtihonni topshirasizmi?</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Jami savollar: <strong className="text-slate-900 dark:text-slate-100">{exam.questions.length} ta</strong>
            </p>
            <p>
              Yechilgan: <strong className="text-teal-600 dark:text-teal-400">{answeredCount} ta</strong>
            </p>
            {answeredCount < exam.questions.length && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                Diqqat: Siz {exam.questions.length - answeredCount} ta savolga javob bermagansiz.
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Topshirgandan so&apos;ng javoblarni qayta o&apos;zgartirib bo&apos;lmaydi.
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={isSubmitting}
            >
              Qaytish
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitExam}
              isLoading={isSubmitting}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Ha, topshirish</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
