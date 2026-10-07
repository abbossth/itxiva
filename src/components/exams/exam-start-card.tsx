"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IExamData } from "@/lib/db/models/exam.model";
import { startExamAttemptAction } from "@/actions/exam.actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  Clock,
  Award,
  AlertTriangle,
  Play,
  ArrowLeft,
  FileCheck,
} from "lucide-react";
import Link from "next/link";

interface ExamStartCardProps {
  exam: IExamData;
}

export function ExamStartCard({ exam }: ExamStartCardProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setStarting(true);

    try {
      const res = await startExamAttemptAction(exam._id.toString());
      if (!res.success) {
        setError(res.error || "Imtihonni boshlashda xatolik yuz berdi");
        setStarting(false);
      } else {
        router.refresh();
      }
    } catch {
      setError("Server bilan aloqada xatolik yuz berdi");
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto py-6 animate-in fade-in">
      <div>
        <Link
          href="/exams"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Imtihonlar ro&apos;yxatiga qaytish
        </Link>
      </div>

      <Card className="p-6 sm:p-8 rounded-3xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 rounded-3xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <GraduationCap className="w-10 h-10" />
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 inline-block">
            {exam.quarter}-chorak imtihoni
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {exam.title}
          </h1>
          {exam.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {exam.description}
            </p>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 text-center">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider block">
              Vaqt
            </span>
            <div className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800 dark:text-slate-200">
              <Clock className="w-4 h-4 text-teal-500" />
              <span>{exam.durationMinutes} daq</span>
            </div>
          </div>
          <div className="space-y-1 border-x border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider block">
              Savollar
            </span>
            <div className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800 dark:text-slate-200">
              <FileCheck className="w-4 h-4 text-teal-500" />
              <span>{exam.questions.length} ta</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider block">
              O&apos;tish bali
            </span>
            <div className="flex items-center justify-center gap-1 text-sm font-bold text-amber-500">
              <Award className="w-4 h-4" />
              <span>{exam.passingScore}%</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Muhim qoidalar:</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 leading-relaxed">
            <li>Boshlash tugmasini bosishingiz bilan server taymeri ishga tushadi.</li>
            <li>Javoblaringiz har 30 soniyada avtomatik saqlanib boriladi.</li>
            <li>Vaqt tugaganda tizim avtomatik ravishda ishingizni topshiradi.</li>
            <li>Ushbu imtihon uchun maksimal {exam.maxAttempts} ta urinish berilgan.</li>
          </ul>
        </div>

        <Button
          onClick={handleStart}
          isLoading={starting}
          variant="primary"
          size="lg"
          className="w-full py-4 text-base font-bold gap-2 rounded-2xl shadow-md"
        >
          <Play className="w-5 h-5 fill-current" />
          <span>Imtihonni boshlash</span>
        </Button>
      </Card>
    </div>
  );
}
