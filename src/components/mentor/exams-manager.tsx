"use client";

import { useState } from "react";
import Link from "next/link";
import { IExamData } from "@/lib/db/models/exam.model";
import {
  togglePublishExamAction,
  togglePublishResultsAction,
  deleteExamAction,
} from "@/actions/exam.actions";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Calendar,
  Clock,
  Award,
  Users,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  FileCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatDateTimeUz } from "@/lib/utils";

interface ExamsManagerProps {
  initialExams: Array<{
    exam: IExamData;
    groupNames: string[];
    submissionsCount: number;
  }>;
}

export function ExamsManager({ initialExams }: ExamsManagerProps) {
  const [exams, setExams] = useState(initialExams);
  const [quarterFilter, setQuarterFilter] = useState<number | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const filteredExams = exams.filter((item) => {
    if (quarterFilter !== "all" && item.exam.quarter !== quarterFilter) {
      return false;
    }
    return true;
  });

  const handleTogglePublish = async (examId: string) => {
    setActionLoading((prev) => ({ ...prev, [examId]: true }));
    try {
      const res = await togglePublishExamAction(examId);
      if (res.success) {
        setExams((prev) =>
          prev.map((item) =>
            item.exam._id === examId
              ? { ...item, exam: { ...item.exam, isPublished: !item.exam.isPublished } }
              : item
          )
        );
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [examId]: false }));
    }
  };

  const handleToggleResults = async (examId: string) => {
    setActionLoading((prev) => ({ ...prev, [`results-${examId}`]: true }));
    try {
      const res = await togglePublishResultsAction(examId);
      if (res.success) {
        setExams((prev) =>
          prev.map((item) =>
            item.exam._id === examId
              ? {
                  ...item,
                  exam: {
                    ...item.exam,
                    isResultsPublished: !item.exam.isResultsPublished,
                  },
                }
              : item
          )
        );
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [`results-${examId}`]: false }));
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setActionLoading((prev) => ({ ...prev, [`delete-${deletingId}`]: true }));

    try {
      const res = await deleteExamAction(deletingId);
      if (res.success) {
        setExams((prev) => prev.filter((item) => item.exam._id !== deletingId));
        setDeletingId(null);
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [`delete-${deletingId}`]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Quarter filter buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80">
          {(["all", 1, 2, 3, 4] as const).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuarterFilter(q)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                quarterFilter === q
                  ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {q === "all" ? "Barcha choraklar" : `${q}-chorak`}
            </button>
          ))}
        </div>

        <Link
          href="/mentor/exams/new"
          className={buttonVariants({ variant: "primary", className: "gap-2 font-semibold" })}
        >
          <Plus className="w-4 h-4" />
          <span>Yangi imtihon</span>
        </Link>
      </div>

      {/* Exams List */}
      {filteredExams.length === 0 ? (
        <Card className="p-12 text-center rounded-3xl border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <div className="inline-flex p-4 rounded-3xl bg-teal-500/10 text-teal-600">
            <FileCheck className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
            Imtihonlar mavjud emas
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Yangi imtihon yaratish orqali o&apos;quvchilar bilimini choraklar bo&apos;yicha baholang.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredExams.map(({ exam, groupNames, submissionsCount }) => {
            const eId = exam._id.toString();
            const isPubLoading = actionLoading[eId];
            const isResLoading = actionLoading[`results-${eId}`];

            return (
              <Card
                key={eId}
                className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] shadow-xs space-y-4 hover:border-teal-500/30 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                        {exam.quarter}-chorak
                      </span>

                      {exam.isPublished ? (
                        <Badge variant="teal" className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span>E&apos;lon qilingan</span>
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <EyeOff className="w-3 h-3" />
                          <span>Qoralama</span>
                        </Badge>
                      )}

                      {exam.isResultsPublished ? (
                        <Badge variant="teal" className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Natijalar ochiq</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-slate-400">
                          Natijalar yopiq
                        </Badge>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {exam.title}
                    </h3>

                    {exam.description && (
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        {exam.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        Guruhlar:
                      </span>
                      {groupNames.map((gn, idx) => (
                        <span
                          key={idx}
                          className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          {gn}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/mentor/exams/${eId}/edit`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "h-9" })}
                    >
                      <Edit className="w-3.5 h-3.5 mr-1" /> Tahrirlash
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingId(eId)}
                      className="h-9 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>{exam.durationMinutes} daqiqa</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>{exam.questions.length} ta savol</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>O&apos;tish: {exam.passingScore}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {formatDateTimeUz(exam.startTime)} —{" "}
                      {formatDateTimeUz(exam.endTime)}
                    </span>
                  </div>
                </div>

                {/* Submissions & Toggles Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/mentor/exams/${eId}`}
                      className={buttonVariants({ variant: "secondary", size: "sm", className: "gap-1.5 font-semibold" })}
                    >
                      <Users className="w-3.5 h-3.5 text-teal-600" />
                      <span>Topshiriqlar ({submissionsCount})</span>
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={isPubLoading}
                      onClick={() => handleTogglePublish(eId)}
                      className="text-xs h-8"
                    >
                      {exam.isPublished ? (
                        <>
                          <EyeOff className="w-3 h-3 mr-1" /> Qoralamaga olish
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3 mr-1" /> E&apos;lon qilish
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={isResLoading}
                      onClick={() => handleToggleResults(eId)}
                      className={`text-xs h-8 ${
                        exam.isResultsPublished
                          ? "border-amber-500/30 text-amber-600"
                          : "border-emerald-500/30 text-emerald-600"
                      }`}
                    >
                      {exam.isResultsPublished
                        ? "Natijalarni yashirish"
                        : "Natijalarni ko'rsatish"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="max-w-md p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 text-lg">
              <AlertCircle className="w-5 h-5" />
              <span>Imtihonni o&apos;chirish</span>
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            Ushbu imtihon va unga tegishli barcha o&apos;quvchilar topshiriqlari bazadan o&apos;chiriladi.
            Haqiqatan ham o&apos;chirmoqchimisiz?
          </p>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeletingId(null)}
              disabled={!!actionLoading[`delete-${deletingId}`]}
            >
              Bekor qilish
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              isLoading={!!actionLoading[`delete-${deletingId}`]}
            >
              O&apos;chirish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
