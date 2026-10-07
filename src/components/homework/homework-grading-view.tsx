"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ClipboardCheck, Clock, ChevronRight, RotateCcw, Check } from "lucide-react";
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
  remindMissingHomeworkAction,
  HomeworkRoster,
  HomeworkRosterRow,
} from "@/actions/homework.actions";
import {
  HOMEWORK_STATE_BADGE,
  HOMEWORK_STATE_LABELS,
  HomeworkState,
  suggestHomeworkCoins,
  describeDue,
} from "@/lib/homework-status";
import { cn, formatDateTimeUz } from "@/lib/utils";

type TabId = "submitted" | "graded" | "returned" | "missing" | "all";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "Hammasi" },
  { id: "submitted", label: "Tekshirilmagan" },
  { id: "graded", label: "Baholangan" },
  { id: "returned", label: "Qaytarilgan" },
  { id: "missing", label: "Topshirmagan" },
];

// Ro'yxat tartibi: avval mentor ishi kerak bo'lganlar
const STATE_ORDER: Record<HomeworkState, number> = { submitted: 0, returned: 1, graded: 2, missing: 3 };
const QUICK_SCORES = [100, 90, 80, 70, 60];

const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function HomeworkGradingView({ roster, initialStudentId }: { roster: HomeworkRoster; initialStudentId?: string }) {
  const { toast } = useToast();
  // Keng ekranda javob ro'yxat yonida ochiladi, tor ekranda — modal oynada
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );

  const rows = useMemo(
    () => [...roster.rows].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.fullName.localeCompare(b.fullName)),
    [roster.rows]
  );
  const counts = useMemo(() => {
    const c: Record<HomeworkState, number> = { submitted: 0, graded: 0, returned: 0, missing: 0 };
    for (const r of rows) c[r.state] += 1;
    return c;
  }, [rows]);
  const avgScore = useMemo(() => {
    const scores = rows.filter((r) => r.state === "graded" && r.submission?.score != null).map((r) => r.submission!.score as number);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }, [rows]);

  const [tab, setTab] = useState<TabId>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId ?? null);
  const [isReminding, setIsReminding] = useState(false);

  const visible = tab === "all" ? rows : rows.filter((r) => r.state === tab);
  // Keng ekranda hech kim tanlanmagan bo'lsa, birinchi tekshirilmagan javob o'zi ochiladi
  const effectiveId = selectedId ?? (isDesktop ? rows.find((r) => r.submission)?.studentId ?? null : null);
  const selected = rows.find((r) => r.studentId === effectiveId && r.submission) ?? null;
  const total = rows.length;
  const submittedTotal = total - counts.missing;
  const due = describeDue(roster.task.dueAt);
  const pendingCount = counts.missing + counts.returned;

  /** Saqlangandan keyin navbatdagi tekshirilmagan javobga o'tadi */
  const goToNext = (currentStudentId: string) => {
    const next = rows.find((r) => r.state === "submitted" && r.studentId !== currentStudentId);
    setSelectedId(next ? next.studentId : isDesktop ? currentStudentId : null);
  };

  const handleRemind = async () => {
    try {
      setIsReminding(true);
      const res = await remindMissingHomeworkAction(roster.lesson._id);
      if (res.success) toast.success(res.message || "Eslatma yuborildi");
      else toast.error(res.message || "Eslatma yuborilmadi");
    } catch {
      toast.error("Eslatma yuborilmadi");
    } finally {
      setIsReminding(false);
    }
  };

  const gradeForm = selected?.submission ? (
    <GradeForm
      key={`${selected.submission._id}-${selected.submission.attempt}-${selected.state}`}
      row={selected}
      coinsReward={roster.task.coinsReward}
      onDone={() => goToNext(selected.studentId)}
    />
  ) : null;

  const stat = (label: string, value: React.ReactNode, tone = "text-slate-900 dark:text-slate-100") => (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface px-3 py-2">
      <div className={cn("font-mono text-lg font-black tabular-nums leading-tight", tone)}>{value}</div>
      <div className="text-[11px] text-slate-600 dark:text-slate-400">{label}</div>
    </div>
  );

  return (
    <div className="space-y-3 pb-12">
      <PageHeader
        icon={ClipboardCheck}
        title={roster.lesson.title}
        subtitle={`${roster.group?.name ?? "Guruh"} · ${roster.lesson.quarter}-chorak, ${roster.lesson.order}-dars${
          roster.task.dueAt ? ` · muddat: ${formatDateTimeUz(roster.task.dueAt)}` : ""
        }`}
        backHref={
          roster.group ? `/mentor/lessons?groupId=${roster.group._id}&quarter=${roster.lesson.quarter}` : "/mentor/lessons"
        }
        backLabel="Darslarga qaytish"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!roster.lesson.isPublished && <Badge variant="warning">Dars qoralamada</Badge>}
            <CoinBadge amount={roster.task.coinsReward} size="sm" animate={false} />
            {pendingCount > 0 && (
              <Button variant="secondary" size="sm" onClick={handleRemind} isLoading={isReminding} className="gap-1.5">
                <BellRing className="w-4 h-4" />
                Eslatma yuborish ({pendingCount})
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stat("topshirdi", `${submittedTotal}/${total}`)}
        {stat("tekshirilmagan", counts.submitted, counts.submitted > 0 ? "text-amber-700 dark:text-amber-400" : undefined)}
        {stat(
          due?.overdue ? "topshirmagan · muddat o'tgan" : "hali topshirmagan",
          counts.missing,
          counts.missing > 0 && due?.overdue ? "text-rose-700 dark:text-rose-400" : undefined
        )}
        {stat("o'rtacha ball", avgScore ?? "—")}
      </div>

      <details className="group rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface px-4 py-2.5">
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold text-slate-900 dark:text-slate-100 min-h-[28px]">
          <span>Topshiriq matni</span>
          {due && (
            <span className={cn("flex items-center gap-1.5 text-xs font-semibold", due.overdue ? "text-rose-700 dark:text-rose-400" : "text-slate-600 dark:text-slate-400")}>
              <Clock className="w-4 h-4" />
              {due.remaining}
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-2">
          <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
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
                    "shrink-0 px-2.5 rounded-lg text-xs font-semibold min-h-[36px] transition-colors cursor-pointer",
                    tab === t.id
                      ? "bg-teal-600 text-white"
                      : "bg-white dark:bg-surface text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
                  )}
                >
                  {t.label} <span className="opacity-80">{count}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-6 text-center text-sm text-slate-600 dark:text-slate-400">
              {tab === "submitted" ? "Tekshirilmagan javob yo'q" : "Bu bo'limda o'quvchi yo'q"}
            </div>
          ) : (
            <ul className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800/70 overflow-hidden lg:max-h-[70vh] lg:overflow-y-auto">
              {visible.map((row) => {
                const isSelected = row.studentId === effectiveId && Boolean(row.submission);
                return (
                  <li key={row.studentId}>
                    <button
                      type="button"
                      disabled={!row.submission}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelectedId(row.studentId)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left min-h-[48px] transition-colors",
                        isSelected && "bg-teal-500/10",
                        row.submission ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" : "cursor-default"
                      )}
                    >
                      <Avatar name={row.fullName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">{row.fullName}</span>
                        <span className="block truncate text-[11px] text-slate-600 dark:text-slate-400">
                          {row.submission ? formatDateTimeUz(row.submission.submittedAt) : `@${row.login}`}
                          {row.submission?.isLate && <span className="ml-1 font-semibold text-rose-700 dark:text-rose-400">· kechikkan</span>}
                        </span>
                      </span>
                      <span className="shrink-0">
                        {row.state === "graded" && row.submission ? (
                          <Badge variant="success">{row.submission.score}</Badge>
                        ) : row.state === "missing" ? (
                          <Badge variant={due?.overdue ? "danger" : "secondary"}>Topshirmagan</Badge>
                        ) : (
                          <Badge variant={HOMEWORK_STATE_BADGE[row.state]}>
                            {row.state === "submitted" ? "Tekshirish" : "Qaytarilgan"}
                          </Badge>
                        )}
                      </span>
                      {row.submission && <ChevronRight className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 lg:hidden" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Keng ekran: tanlangan javob yonma-yon */}
        <div className="hidden lg:block rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 lg:sticky lg:top-20">
          {isDesktop && selected ? (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{selected.fullName}</h2>
              {gradeForm}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title={submittedTotal === 0 ? "Hali hech kim topshirmagan" : "Javobni tanlang"}
              description={submittedTotal === 0 ? "Javob kelganda shu yerda ochiladi." : "Chapdagi ro'yxatdan o'quvchini bosing."}
            />
          )}
        </div>
      </div>

      <Modal isOpen={!isDesktop && Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.fullName} maxWidth="2xl">
        {!isDesktop && gradeForm}
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
    <div
      className="space-y-4"
      onKeyDown={(e) => {
        // Ctrl/Cmd + Enter — bahoni saqlash
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && busy === null) {
          e.preventDefault();
          void handleGrade();
        }
      }}
    >
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

      <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
        <div role="group" aria-label="Tez baholash" className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mr-1">Tez ball:</span>
          {QUICK_SCORES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleScore(String(q))}
              aria-pressed={score === String(q)}
              className={cn(
                "min-w-[48px] min-h-[36px] rounded-lg border font-mono text-sm font-bold transition-colors cursor-pointer",
                score === String(q)
                  ? "bg-teal-600 border-teal-600 text-white"
                  : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-teal-500"
              )}
            >
              {q}
            </button>
          ))}
        </div>
        <div className="grid gap-3 grid-cols-2">
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
          <span className="mr-auto hidden lg:block text-[11px] text-slate-500 dark:text-slate-400">Ctrl + Enter — saqlash</span>
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
            {isGraded ? "Bahoni o'zgartirish" : "Baholash va keyingisi"}
          </Button>
        </div>
      </div>
    </div>
  );
}
