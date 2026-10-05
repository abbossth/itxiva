"use client";

import { useState } from "react";
import { IExamData } from "@/lib/db/models/exam.model";
import { IExamSubmissionData } from "@/lib/db/models/exam-submission.model";
import { ExamCard } from "./exam-card";
import { EmptyState } from "@/components/shared/empty-state";
import { GraduationCap, Clock, CheckCircle2 } from "lucide-react";

interface ExamsListClientProps {
  active: Array<{ exam: IExamData; submission: IExamSubmissionData | null }>;
  upcoming: Array<{ exam: IExamData }>;
  past: Array<{ exam: IExamData; submission: IExamSubmissionData | null }>;
}

export function ExamsListClient({ active, upcoming, past }: ExamsListClientProps) {
  const [currentTab, setCurrentTab] = useState<"active" | "upcoming" | "past">("active");

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 sm:gap-4 overflow-x-auto">
        <button
          type="button"
          onClick={() => setCurrentTab("active")}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] ${
            currentTab === "active"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Faol imtihonlar</span>
          {active.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-teal-500/10 text-teal-600 dark:text-teal-400 font-extrabold">
              {active.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab("upcoming")}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] ${
            currentTab === "upcoming"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Kutilayotgan</span>
          {upcoming.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-extrabold">
              {upcoming.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab("past")}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap min-h-[44px] ${
            currentTab === "past"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Yakunlangan</span>
          {past.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-extrabold">
              {past.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {currentTab === "active" && (
        <div>
          {active.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Ayni paytda faol imtihonlar yo'q"
              description="Guruhingiz uchun yangi imtihon e'lon qilinganda bu yerda ko'rinadi."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {active.map(({ exam, submission }) => (
                <ExamCard
                  key={exam._id.toString()}
                  exam={exam}
                  submission={submission}
                  category="active"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {currentTab === "upcoming" && (
        <div>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Kutilayotgan imtihonlar yo'q"
              description="Kelgusida rejalashtirilgan imtihonlar bu yerda aks etadi."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {upcoming.map(({ exam }) => (
                <ExamCard
                  key={exam._id.toString()}
                  exam={exam}
                  submission={null}
                  category="upcoming"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {currentTab === "past" && (
        <div>
          {past.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Tugagan imtihonlar tarixi bo'sh"
              description="Siz topshirgan o'tgan imtihonlar shu yerda saqlanadi."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {past.map(({ exam, submission }) => (
                <ExamCard
                  key={exam._id.toString()}
                  exam={exam}
                  submission={submission}
                  category="past"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
