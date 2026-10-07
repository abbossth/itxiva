"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Clock, ChevronRight, RotateCcw, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { CoinBadge } from "@/components/ui/coin-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { SubmissionContent } from "@/components/homework/submission-content";
import { TaskAttachments } from "@/components/homework/task-attachments";
import {
  gradeHomeworkAction,
  returnHomeworkAction,
  HomeworkRoster,
  HomeworkRosterRow,
} from "@/actions/homework.actions";
import {
  HOMEWORK_STATE_BADGE,
  HOMEWORK_STATE_LABELS,
  HomeworkState,
  suggestHomeworkCoins,
} from "@/lib/homework-status";
import { cn, formatDateTimeUz } from "@/lib/utils";

type TabId = "submitted" | "graded" | "returned" | "missing" | "all";

const TABS: { id: TabId; label: string }[] = [
  { id: "submitted", label: "Tekshirilmagan" },
  { id: "graded", label: "Baholangan" },
  { id: "returned", label: "Qaytarilgan" },
  { id: "missing", label: "Topshirmagan" },
  { id: "all", label: "Hammasi" },
];

export function HomeworkGradingView({ roster }: { roster: HomeworkRoster }) {
  const counts = useMemo(() => {
    const c: Record<HomeworkState, number> = { submitted: 0, graded: 0, returned: 0, missing: 0 };
    for (const r of roster.rows) c[r.state] += 1;
    return c;
  }, [roster.rows]);

  const [tab, setTab] = useState<TabId>(counts.submitted > 0 ? "submitted" : "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = tab === "all" ? roster.rows : roster.rows.filter((r) => r.state === tab);
  const selected = roster.rows.find((r) => r.studentId === selectedId && r.submission) ?? null;
  const total = roster.rows.length;
  const submittedTotal = total - counts.missing;

  /** Saqlangandan keyin navbatdagi tekshirilmagan javobga o'tadi */
  const goToNext = (currentStudentId: string) => {
    const next = roster.rows.find((r) => r.state === "submitted" && r.studentId !== currentStudentId);
    setSelectedId(next ? next.studentId : null);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-12">
      <PageHeader
        icon={ClipboardCheck}
        title={roster.lesson.title}
        subtitle={`${roster.group?.name ?? "Guruh"} · ${roster.lesson.quarter}-chorak, ${roster.lesson.order}-dars · ${submittedTotal}/${total} topshirdi`}
        backHref="/mentor/homework"
        backLabel="Vazifalar ro'yxati"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!roster.lesson.isPublished && <Badge variant="warning">Dars qoralamada</Badge>}
            <CoinBadge amount={roster.task.coinsReward} size="sm" animate={false} />
          </div>
        }
      />

      <details className="group rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5">
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold text-slate-900 dark:text-slate-100 min-h-[32px]">
          <span>Topshiriq matni</span>
          {roster.task.dueAt && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Clock className="w-4 h-4" />
              Muddat: {formatDateTimeUz(roster.task.dueAt)}
            </span>
          )}
        </summary>
        <div className="mt-3 space-y-3">
          {roster.task.instructions && (
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {roster.task.instructions}
            </p>
          )}
          <TaskAttachments lessonId={roster.lesson._id} attachments={roster.task.attachments} />
        </div>
      </details>

      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => {
          const count = t.id === "all" ? total : counts[t.id];
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold min-h-[44px] transition-colors cursor-pointer",
                tab === t.id
                  ? "bg-teal-600 text-white shadow-xs"
                  : "bg-white dark:bg-surface text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
              )}
            >
              {t.label} <span className="opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={tab === "submitted" ? "Tekshirilmagan javob yo'q" : "Bu bo'limda o'quvchi yo'q"}
          description={tab === "submitted" ? "Hamma yuborilgan javoblar ko'rib chiqilgan." : undefined}
        />
      ) : (
        <ul className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800/70 overflow-hidden">
          {visible.map((row) => (
            <li key={row.studentId}>
              <button
                type="button"
                disabled={!row.submission}
                onClick={() => setSelectedId(row.studentId)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 sm:p-4 text-left min-h-[60px] transition-colors",
                  row.submission ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" : "cursor-default"
                )}
              >
                <Avatar name={row.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {row.fullName}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {row.submission
                      ? `Yuborilgan: ${formatDateTimeUz(row.submission.submittedAt)}`
                      : `@${row.login}`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                  {row.submission?.isLate && <Badge variant="danger">Kechikkan</Badge>}
                  {row.state === "graded" && row.submission ? (
                    <Badge variant="success">{row.submission.score} ball</Badge>
                  ) : (
                    <Badge variant={HOMEWORK_STATE_BADGE[row.state]}>
                      {row.state === "submitted" ? "Tekshirish kerak" : HOMEWORK_STATE_LABELS[row.state]}
                    </Badge>
                  )}
                </span>
                {row.submission && <ChevronRight className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.fullName}
        maxWidth="2xl"
      >
        {selected?.submission && (
          <GradeForm
            key={`${selected.submission._id}-${selected.submission.attempt}-${selected.state}`}
            row={selected}
            coinsReward={roster.task.coinsReward}
            onDone={() => goToNext(selected.studentId)}
          />
        )}
      </Modal>
    </div>
  );
}

function GradeForm({
  row,
  coinsReward,
  onDone,
}: {
  row: HomeworkRosterRow;
  coinsReward: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const submission = row.submission!;
  const isGraded = row.state === "graded";

  const [score, setScore] = useState(submission.score !== null ? String(submission.score) : "");
  const [coins, setCoins] = useState(isGraded ? String(submission.coinsAwarded) : "");
  // Mentor coin maydonini o'zi o'zgartirmaguncha, u ballga qarab avtomatik to'ldiriladi
  const [coinsTouched, setCoinsTouched] = useState(isGraded);
  const [feedback, setFeedback] = useState(submission.feedback);
  const [busy, setBusy] = useState<"grade" | "return" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleScore = (value: string) => {
    setScore(value);
    if (!coinsTouched) {
      const n = Number(value);
      setCoins(value === "" || Number.isNaN(n) ? "" : String(suggestHomeworkCoins(n, coinsReward, submission.isLate)));
    }
  };

  const finish = (message: string) => {
    toast.success(message);
    router.refresh();
    onDone();
  };

  const handleGrade = async () => {
    const n = Number(score);
    if (score === "" || !Number.isInteger(n) || n < 0 || n > 100) {
      setErrorMsg("Ball 0 dan 100 gacha butun son bo'lishi kerak");
      return;
    }
    const c = coins === "" ? 0 : Number(coins);
    if (!Number.isInteger(c) || c < 0 || c > coinsReward) {
      setErrorMsg(`Coin 0 dan ${coinsReward} gacha bo'lishi kerak`);
      return;
    }
    try {
      setBusy("grade");
      setErrorMsg(null);
      const res = await gradeHomeworkAction({ submissionId: submission._id, score: n, feedback, coins: c });
      if (res.success) finish(res.message || "Baho saqlandi");
      else setErrorMsg(res.message || "Bahoni saqlab bo'lmadi");
    } catch {
      setErrorMsg("Bahoni saqlab bo'lmadi");
    } finally {
      setBusy(null);
    }
  };

  const handleReturn = async () => {
    if (feedback.trim().length < 3) {
      setErrorMsg("Qaytarish uchun izohda nimani tuzatish kerakligini yozing");
      return;
    }
    try {
      setBusy("return");
      setErrorMsg(null);
      const res = await returnHomeworkAction({ submissionId: submission._id, feedback });
      if (res.success) finish(res.message || "Qaytarildi");
      else setErrorMsg(res.message || "Qaytarib bo'lmadi");
    } catch {
      setErrorMsg("Qaytarib bo'lmadi");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Yuborilgan: {formatDateTimeUz(submission.submittedAt)}</span>
        {submission.attempt > 1 && <Badge variant="secondary">{submission.attempt}-urinish</Badge>}
        {submission.isLate && <Badge variant="danger">Kechikkan</Badge>}
        <Badge variant={HOMEWORK_STATE_BADGE[row.state]}>{HOMEWORK_STATE_LABELS[row.state]}</Badge>
      </div>

      <SubmissionContent
        submissionId={submission._id}
        text={submission.text}
        links={submission.links}
        files={submission.files}
      />

      <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
        <div className="grid gap-4 grid-cols-2">
          <Field htmlFor="hw-score" label="Ball (0–100)" required>
            <Input
              id="hw-score"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={score}
              onChange={(e) => handleScore(e.target.value)}
              placeholder="masalan: 85"
            />
          </Field>
          <Field
            htmlFor="hw-coins"
            label={`Coin (0–${coinsReward})`}
            hint={submission.isLate && !coinsTouched ? "Kechikkan — sukut bo'yicha 0" : undefined}
          >
            <Input
              id="hw-coins"
              type="number"
              inputMode="numeric"
              min={0}
              max={coinsReward}
              value={coins}
              onChange={(e) => {
                setCoinsTouched(true);
                setCoins(e.target.value);
              }}
              placeholder="0"
            />
          </Field>
        </div>

        <Field htmlFor="hw-feedback" label="Izoh" hint="O'quvchi shu izohni ko'radi">
          <Textarea
            id="hw-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="Nima yaxshi chiqdi, nimani tuzatish kerak..."
          />
        </Field>

        {errorMsg && (
          <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isGraded && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleReturn}
              isLoading={busy === "return"}
              disabled={busy !== null}
              className="gap-2 min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" />
              Qayta ishlashga qaytarish
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={handleGrade}
            isLoading={busy === "grade"}
            disabled={busy !== null}
            className="gap-2 min-h-[44px] font-semibold"
          >
            <Check className="w-4 h-4" />
            {isGraded ? "Bahoni o'zgartirish" : "Baholash"}
          </Button>
        </div>
      </div>
    </div>
  );
}
