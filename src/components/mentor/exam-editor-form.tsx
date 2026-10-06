"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IGroupData } from "@/lib/db/models/group.model";
import { IExamData, IExamQuestion, ExamQuestionType } from "@/lib/db/models/exam.model";
import { createExamAction, updateExamAction } from "@/actions/exam.actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Check,
  Sparkles,
  Calendar,
  Users,
} from "lucide-react";
import { toDateTimeLocalValue } from "@/lib/utils";

interface ExamEditorFormProps {
  groups: IGroupData[];
  initialExam?: IExamData | null;
}

export function ExamEditorForm({ groups, initialExam }: ExamEditorFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialExam?.title || "");
  const [description, setDescription] = useState(initialExam?.description || "");
  const [quarter, setQuarter] = useState<number>(initialExam?.quarter || 1);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialExam?.groupIds?.map((g) => g.toString()) || []
  );

  const [startTime, setStartTime] = useState(() =>
    toDateTimeLocalValue(initialExam?.startTime || new Date())
  );

  const [endTime, setEndTime] = useState(() =>
    toDateTimeLocalValue(initialExam?.endTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  );
  const [durationMinutes, setDurationMinutes] = useState(initialExam?.durationMinutes || 60);
  const [maxAttempts, setMaxAttempts] = useState(initialExam?.maxAttempts || 1);
  const [passingScore, setPassingScore] = useState(initialExam?.passingScore || 60);
  const [isPublished, setIsPublished] = useState(initialExam?.isPublished || false);

  const [questions, setQuestions] = useState<IExamQuestion[]>(() => {
    if (initialExam?.questions?.length) {
      return initialExam.questions;
    }
    return [
      {
        type: "single_choice",
        prompt: "",
        options: ["A varianti", "B varianti", "C varianti"],
        correctAnswers: ["A varianti"],
        points: 5,
      },
    ];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const addQuestion = (type: ExamQuestionType = "single_choice") => {
    setQuestions((prev) => [
      ...prev,
      {
        type,
        prompt: "",
        options:
          type === "single_choice" || type === "multiple_choice" ? ["Variant 1", "Variant 2"] : [],
        correctAnswers: type === "single_choice" ? ["Variant 1"] : [],
        points: type === "project_upload" ? 20 : 5,
        allowedFileTypes: [".zip", ".pdf", ".png", ".jpg"],
        maxFileSizeMb: 50,
      },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, patch: Partial<IExamQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
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
    const newCorrect = q.correctAnswers?.filter((ans) => ans !== removedOpt) || [];
    updateQuestion(qIdx, { options: newOptions, correctAnswers: newCorrect });
  };

  const toggleCorrectAnswer = (qIdx: number, opt: string, isSingle: boolean) => {
    const q = questions[qIdx];
    const currentCorrect = q.correctAnswers || [];
    if (isSingle) {
      updateQuestion(qIdx, { correctAnswers: [opt] });
    } else {
      const next = currentCorrect.includes(opt)
        ? currentCorrect.filter((a) => a !== opt)
        : [...currentCorrect, opt];
      updateQuestion(qIdx, { correctAnswers: next });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Imtihon nomini kiriting");
      return;
    }
    if (selectedGroupIds.length === 0) {
      setError("Kamida bitta guruhni tanlang");
      return;
    }
    if (questions.length === 0) {
      setError("Kamida bitta savol qo'shing");
      return;
    }
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setError("Boshlanish va tugash vaqtini to'g'ri kiriting");
      return;
    }
    if (endDate <= startDate) {
      setError("Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak");
      return;
    }
    const totalMinutes = Math.floor((endDate.getTime() - startDate.getTime()) / (60 * 1000));
    if (durationMinutes > totalMinutes) {
      setError(
        `Imtihon davomiyligi (${durationMinutes} daqiqa) imtihon ochiq bo'lgan vaqt oralig'idan (${totalMinutes} daqiqa) oshmasligi kerak`
      );
      return;
    }
    if (passingScore < 0 || passingScore > 100) {
      setError("O'tish bali 0 dan 100 gacha bo'lishi kerak");
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
      const payload = {
        title,
        description,
        quarter,
        groupIds: selectedGroupIds,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationMinutes,
        maxAttempts,
        passingScore,
        isPublished,
        isResultsPublished: initialExam?.isResultsPublished || false,
        questions,
      };

      let res;
      if (initialExam) {
        res = await updateExamAction(initialExam._id.toString(), payload);
      } else {
        res = await createExamAction(payload);
      }

      if (!res.success) {
        setError(res.error || "Xatolik yuz berdi");
        setSaving(false);
      } else {
        router.push("/mentor/exams");
        router.refresh();
      }
    } catch {
      setError("Server bilan aloqada xatolik yuz berdi");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto pb-16 animate-in fade-in">
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Basic Settings Card */}
      <Card className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs space-y-5">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>Asosiy ma&apos;lumotlar</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Imtihon nomi
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masalan: 1-chorak oraliq imtihoni (Python asoslari)"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Tavsif (ixtiyoriy)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Imtihon qoidalari yoki ko'rsatmalar"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Chorak
            </label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
            >
              <option value={1}>1-chorak</option>
              <option value={2}>2-chorak</option>
              <option value={3}>3-chorak</option>
              <option value={4}>4-chorak</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Davomiyligi (daqiqa)
            </label>
            <Input
              type="number"
              min={5}
              max={300}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Boshlanish vaqti
            </label>
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Tugash vaqti
            </label>
            <Input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              O&apos;tish bali (%)
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Urinishlar soni
            </label>
            <Input
              type="number"
              min={1}
              max={5}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Guruhlar tanlovi */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Biriktirilgan guruhlar (kamida bittasini belgilang):
          </label>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const gId = g._id.toString();
              const isSelected = selectedGroupIds.includes(gId);
              return (
                <button
                  key={gId}
                  type="button"
                  onClick={() => toggleGroup(gId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    isSelected
                      ? "border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-400"
                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
                >
                  {g.name} ({g.grade}-sinf)
                </button>
              );
            })}
          </div>
        </div>

        {/* Publish checkbox */}
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="isPublished"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
          />
          <label htmlFor="isPublished" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            E&apos;lon qilingan (o&apos;quvchilar ro&apos;yxatida ko&apos;rinadi)
          </label>
        </div>
      </Card>

      {/* Questions Builder Card */}
      <Card className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Savollar va topshiriqlar ({questions.length})
            </h2>
            <p className="text-xs text-slate-500">
              Jami ball: {questions.reduce((sum, q) => sum + q.points, 0)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addQuestion("single_choice")}
              className="text-xs h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Test
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addQuestion("open_ended")}
              className="text-xs h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Ochiq savol
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addQuestion("project_upload")}
              className="text-xs h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Loyiha fayli
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addQuestion("github_repo")}
              className="text-xs h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> GitHub havola
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div
              key={qIdx}
              className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    {qIdx + 1}-savol
                  </span>
                  <select
                    value={q.type}
                    onChange={(e) =>
                      updateQuestion(qIdx, {
                        type: e.target.value as ExamQuestionType,
                        options:
                          e.target.value === "single_choice" || e.target.value === "multiple_choice"
                            ? q.options?.length ? q.options : ["A", "B"]
                            : [],
                      })
                    }
                    className="text-xs px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    <option value="single_choice">Bitta to&apos;g&apos;ri javobli test</option>
                    <option value="multiple_choice">Bir nechta javobli test</option>
                    <option value="open_ended">Ochiq savol (mentor tekshiradi)</option>
                    <option value="project_upload">Loyiha fayli (ZIP/PDF)</option>
                    <option value="github_repo">GitHub repository havolasi</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500">Ball:</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={q.points}
                      onChange={(e) => updateQuestion(qIdx, { points: Number(e.target.value) || 5 })}
                      className="w-12 px-1.5 py-0.5 text-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(qIdx)}
                    className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-500 transition-colors"
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
                  placeholder="Savol yoki topshiriq matnini kiriting..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-y focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* Variantlar */}
              {(q.type === "single_choice" || q.type === "multiple_choice") && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-semibold text-slate-500">
                    Variantlar (to&apos;g&apos;ri javobni belgilang):
                  </div>
                  {q.options?.map((opt, optIdx) => {
                    const isCorrect = q.correctAnswers?.includes(opt);
                    return (
                      <div key={optIdx} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCorrectAnswer(qIdx, opt, q.type === "single_choice")}
                          className={`p-1 rounded-md border transition-colors ${
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
                          className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(qIdx, optIdx)}
                          className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-500"
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
                    className="text-xs h-7 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Variant qo&apos;shish
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={saving}
        >
          Bekor qilish
        </Button>
        <Button type="submit" variant="primary" size="lg" isLoading={saving} className="gap-2">
          <Sparkles className="w-4 h-4" />
          <span>{initialExam ? "O'zgarishlarni saqlash" : "Imtihonni yaratish"}</span>
        </Button>
      </div>
    </form>
  );
}
