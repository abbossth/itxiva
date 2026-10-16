"use client";

import { useState } from "react";
import { OpenQuestionGrading } from "@/components/mentor/open-question-grading";
import { IQuizData, IQuizQuestion, QuizQuestionType } from "@/lib/db/models/quiz.model";
import { upsertQuizAction } from "@/actions/quiz.actions";
import { generateQuizAction, LessonContextInput } from "@/actions/ai.actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, HelpCircle, Check, Sparkles } from "lucide-react";

interface QuizEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  initialQuiz?: IQuizData | null;
  aiEnabled?: boolean;
  lessonContext?: LessonContextInput;
}

export function QuizEditorModal({
  isOpen,
  onClose,
  lessonId,
  initialQuiz,
  aiEnabled = false,
  lessonContext,
}: QuizEditorModalProps) {
  const [title, setTitle] = useState(initialQuiz?.title || "Dars bo'yicha kichik test");
  const [description, setDescription] = useState(initialQuiz?.description || "");
  const [passingScore, setPassingScore] = useState(initialQuiz?.passingScore || 60);
  // Yangi test yopiq: mentor uni shu guruhda dars o'tgach ochadi (bog'langan guruhlarda alohida)
  const [published, setPublished] = useState(Boolean(initialQuiz?.isPublished));
  const [questions, setQuestions] = useState<IQuizQuestion[]>(() => {
    if (initialQuiz?.questions?.length) {
      return initialQuiz.questions;
    }
    return [
      {
        type: "single_choice",
        prompt: "",
        options: ["A varianti", "B varianti", "C varianti"],
        correctAnswers: ["A varianti"],
        points: 1,
      },
    ];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!lessonContext || generating) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await generateQuizAction(lessonContext, 5);
      if (res.success && res.data) {
        // Hali to'ldirilmagan (bo'sh) savollar o'rniga qo'yiladi, mentor yozganlari saqlanadi
        setQuestions((prev) => [...prev.filter((q) => q.prompt.trim()), ...res.data!.questions]);
      } else {
        setError(res.message || "AI savol tuza olmadi");
      }
    } catch {
      setError("AI yordamchiga ulanib bo'lmadi");
    } finally {
      setGenerating(false);
    }
  };

  const addQuestion = (type: QuizQuestionType = "single_choice") => {
    setQuestions((prev) => [
      ...prev,
      {
        type,
        prompt: "",
        options: type === "single_choice" || type === "multiple_choice" ? ["Variant 1", "Variant 2"] : [],
        correctAnswers: type === "single_choice" ? ["Variant 1"] : [],
        points: 1,
      },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, patch: Partial<IQuizQuestion>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    );
  };

  const addOption = (qIdx: number) => {
    const q = questions[qIdx];
    const newOptions = [...(q.options || []), `Variant ${(q.options?.length || 0) + 1}`];
    updateQuestion(qIdx, { options: newOptions });
  };

  const removeOption = (qIdx: number, optIdx: number) => {
    const q = questions[qIdx];
    const removedOpt = q.options?.[optIdx];
    const newOptions = q.options?.filter((_, i) => i !== optIdx);
    const newCorrect = q.correctAnswers.filter((ans) => ans !== removedOpt);
    updateQuestion(qIdx, { options: newOptions, correctAnswers: newCorrect });
  };

  const toggleCorrectAnswer = (qIdx: number, opt: string, isSingle: boolean) => {
    const q = questions[qIdx];
    if (isSingle) {
      updateQuestion(qIdx, { correctAnswers: [opt] });
    } else {
      const exists = q.correctAnswers.includes(opt);
      const next = exists
        ? q.correctAnswers.filter((a) => a !== opt)
        : [...q.correctAnswers, opt];
      updateQuestion(qIdx, { correctAnswers: next });
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Test sarlavhasini kiriting");
      return;
    }
    if (questions.length === 0) {
      setError("Kamida bitta savol qo'shing");
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].prompt.trim()) {
        setError(`${i + 1}-savol matnini kiriting`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await upsertQuizAction({
        lessonId,
        title,
        description,
        passingScore,
        isPublished: published,
        questions,
      });

      if (!res.success) {
        setError(res.error || "Xatolik yuz berdi");
      } else {
        onClose();
      }
    } catch {
      setError("Saqlashda xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88dvh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-2 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <HelpCircle className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span>Kichik testni sozlash</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 text-sm rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Test sarlavhasi
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Masalan, O'zgaruvchilar bo'yicha tezkor test"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tavsif (ixtiyoriy)
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Darsni mustahkamlash uchun"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                O&apos;tish bali (%)
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Savollar ({questions.length})
              </h3>
              <div className="flex flex-wrap items-center sm:justify-end gap-1.5">
                {aiEnabled && lessonContext && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={handleGenerate}
                    isLoading={generating}
                    className="text-xs h-9"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> AI bilan tuzish
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addQuestion("single_choice")}
                  className="text-xs h-9"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Test savol
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addQuestion("short_answer")}
                  className="text-xs h-9"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Qisqa javob
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addQuestion("open_ended")}
                  className="text-xs h-9"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ochiq savol
                </Button>
              </div>
            </div>

            {questions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1 basis-56">
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold px-2 py-1 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
                      {qIdx + 1}-savol
                    </span>
                    <select
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(qIdx, {
                          type: e.target.value as QuizQuestionType,
                          // Variantli savolning to'g'ri javobi ochiq savolga namunaviy javob bo'lib o'tib qolmasin
                          ...(e.target.value === "open_ended" || q.type === "open_ended" ? { correctAnswers: [] } : {}),
                          options:
                            e.target.value === "single_choice" || e.target.value === "multiple_choice"
                              ? q.options?.length ? q.options : ["A", "B"]
                              : [],
                        })
                      }
                      className="min-w-0 flex-1 h-9 text-xs px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      <option value="single_choice">Bitta to&apos;g&apos;ri javob</option>
                      <option value="multiple_choice">Bir nechta to&apos;g&apos;ri javob</option>
                      <option value="short_answer">Qisqa matn</option>
                      <option value="open_ended">Ochiq savol</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-slate-500">Ball:</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={q.points}
                        onChange={(e) => updateQuestion(qIdx, { points: Number(e.target.value) || 1 })}
                        className="w-14 h-9 px-1.5 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIdx)}
                      aria-label="Savolni o'chirish"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <textarea
                    rows={2}
                    value={q.prompt}
                    onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
                    placeholder="Savol matnini kiriting..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-none focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                {/* Variantlar */}
                {(q.type === "single_choice" || q.type === "multiple_choice") && (
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-semibold text-slate-500">
                      Variantlar (to&apos;g&apos;ri javobni belgilang):
                    </div>
                    {q.options?.map((opt, optIdx) => {
                      const isCorrect = q.correctAnswers.includes(opt);
                      return (
                        <div key={optIdx} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleCorrectAnswer(qIdx, opt, q.type === "single_choice")}
                            aria-label="To'g'ri javob sifatida belgilash"
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                              isCorrect
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-slate-300 dark:border-slate-600 text-transparent"
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...(q.options || [])];
                              newOpts[optIdx] = e.target.value;
                              // To'g'ri javob matn bo'yicha saqlanadi — variant nomi o'zgarsa, u ham yangilanadi
                              const newCorrect = (q.correctAnswers || []).map((ans) =>
                                ans === opt ? e.target.value : ans
                              );
                              updateQuestion(qIdx, { options: newOpts, correctAnswers: newCorrect });
                            }}
                            className="min-w-0 flex-1 h-9 px-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(qIdx, optIdx)}
                            aria-label="Variantni o'chirish"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addOption(qIdx)}
                      className="text-xs h-9 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Variant qo&apos;shish
                    </Button>
                  </div>
                )}

                {/* Qisqa matn to'g'ri javoblari */}
                {q.type === "short_answer" && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">
                      To&apos;g&apos;ri javob (bir nechta bo&apos;lsa vergul bilan ajrating):
                    </label>
                    <input
                      type="text"
                      value={q.correctAnswers.join(", ")}
                      onChange={(e) =>
                        updateQuestion(qIdx, {
                          correctAnswers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      placeholder="Masalan: console.log, print"
                      className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                )}

                {q.type === "open_ended" && (
                  <OpenQuestionGrading
                    grading={q.grading}
                    sample={(q.correctAnswers ?? [])[0] ?? ""}
                    onChange={(patch) => updateQuestion(qIdx, patch)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-slate-100 dark:border-slate-800 flex-wrap">
          <label className="mr-auto flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 accent-teal-600"
            />
            <span>
              <span className="block font-semibold text-slate-900 dark:text-slate-100">O&apos;quvchilarga ochiq</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">Faqat shu guruhda. Dars o&apos;tilgach yoqing</span>
            </span>
          </label>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button onClick={handleSave} isLoading={saving} className="gap-2">
            <Sparkles className="w-4 h-4" />
            <span>Testni saqlash</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
