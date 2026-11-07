"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock, Flame, Gamepad2, ListChecks, Medal, Play, RotateCcw, Trophy, X, Zap } from "lucide-react";
import type { IQuizData } from "@/lib/db/models/quiz.model";
import type { IQuizSubmissionData } from "@/lib/db/models/quiz-submission.model";
import {
  answerQuizQuestionAction,
  getQuizLeaderboardAction,
  nextQuizQuestionAction,
  startQuizGameAction,
  type GameFeedback,
  type GameQuestion,
  type QuizLeaderboard,
} from "@/actions/quiz-game.actions";
import { questionTimeLimit } from "@/lib/quiz-game";
import { requestRewardCheck } from "@/lib/rewards-client";
import { fireConfetti, prefersReducedMotion } from "@/lib/confetti";
import { haptic } from "@/lib/haptics";
import { playCorrectSound, playTickSound, playWrongSound, unlockSound } from "@/lib/sound";
import { QuizView } from "@/components/quiz/quiz-view";
import { Button } from "@/components/ui/button";
import { cn, formatDateUz, formatNumberUz } from "@/lib/utils";

// Dars testi — o'yin ko'rinishida: savollar birma-bir, vaqt bilan, darhol natija, ochko va guruh reytingi.
// Vaqt va ochko serverda hisoblanadi (src/actions/quiz-game.actions.ts) — bu yerda faqat ko'rsatiladi.

type Phase = "intro" | "countdown" | "question" | "feedback" | "results";

/** Variant tugmalari ranglari: har biri harf bilan, rang ko'rmaydiganlar uchun ham tushunarli */
const TILE_COLORS = [
  "bg-rose-600 hover:bg-rose-500 border-rose-700",
  "bg-sky-600 hover:bg-sky-500 border-sky-700",
  "bg-amber-500 hover:bg-amber-400 border-amber-600",
  "bg-emerald-600 hover:bg-emerald-500 border-emerald-700",
  "bg-violet-600 hover:bg-violet-500 border-violet-700",
  "bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-700",
];
const LETTERS = "ABCDEF";

interface QuizGameProps {
  quiz: IQuizData;
  submission: IQuizSubmissionData | null;
  lessonId: string;
}

export function QuizGame({ quiz, submission, lessonId }: QuizGameProps) {
  const router = useRouter();
  const answeredIds = new Set((submission?.answers ?? []).map((a) => a.questionId));
  const pending = quiz.questions.filter((q) => !answeredIds.has(String(q._id)));
  const [phase, setPhase] = useState<Phase>(submission && pending.length === 0 ? "results" : "intro");
  const [board, setBoard] = useState<QuizLeaderboard | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [feedback, setFeedback] = useState<GameFeedback | null>(null);
  const [lastValue, setLastValue] = useState<string | string[]>("");
  // Taymer tugab, javob o'zi yuborilgan
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(3);
  const effects = board?.effects ?? true;

  const loadBoard = useCallback(async () => {
    const res = await getQuizLeaderboardAction(String(quiz._id));
    if (res.success) setBoard(res.data);
  }, [quiz._id]);

  useEffect(() => {
    // Reyting va tugallanmagan o'yin haqida ma'lumot (sahifa server tomonidan chizilgandan keyin)
    const t = setTimeout(() => void loadBoard(), 0);
    return () => clearTimeout(t);
  }, [loadBoard]);

  const showQuestion = useCallback(async (id: string) => {
    const res = await nextQuizQuestionAction(id);
    if (!res.success) {
      setError(res.error);
      setPhase("intro");
      return;
    }
    setQuestion(res.data);
    setFeedback(null);
    setPhase("question");
  }, []);

  const start = async () => {
    unlockSound();
    setError(null);
    setBusy(true);
    try {
      const res = await startQuizGameAction(String(quiz._id));
      if (!res.success) {
        setError(res.error);
        return;
      }
      setRunId(res.data.runId);
      // Davom ettirilayotgan o'yinda sanoq yo'q — vaqt allaqachon ketyapti
      if (res.data.index > 0 || board?.activeRun) {
        await showQuestion(res.data.runId);
      } else {
        setCount(3);
        setPhase("countdown");
      }
    } finally {
      setBusy(false);
    }
  };

  // 3-2-1
  useEffect(() => {
    if (phase !== "countdown" || !runId) return;
    const timer = setTimeout(() => {
      if (count <= 1) void showQuestion(runId);
      else setCount((c) => c - 1);
    }, 750);
    return () => clearTimeout(timer);
  }, [phase, count, runId, showQuestion]);

  const submit = useCallback(
    async (value: string | string[], timedOut = false) => {
      if (!runId || !question || busy) return;
      setBusy(true);
      setLastValue(value);
      setExpired(timedOut);
      try {
        const res = await answerQuizQuestionAction(runId, question.id, value);
        if (!res.success) {
          setError(res.error);
          return;
        }
        const fb = res.data;
        setFeedback(fb);
        setPhase("feedback");
        if (effects) {
          if (fb.isCorrect === true) {
            playCorrectSound();
            haptic([30, 40, 30]);
          } else if (fb.isCorrect === false) {
            playWrongSound();
            haptic([90]);
          }
        }
        if (fb.finished) {
          requestRewardCheck();
          void loadBoard();
        }
      } finally {
        setBusy(false);
      }
    },
    [runId, question, busy, effects, loadBoard]
  );

  const next = () => {
    if (!runId || !feedback) return;
    if (feedback.finished) {
      setPhase("results");
      // To'g'ri javoblar va tushuntirishlar bilan batafsil sharh serverdan qayta yuklanadi
      router.refresh();
      return;
    }
    void showQuestion(runId);
  };

  if (phase === "intro") {
    return (
      <GameIntro
        quiz={quiz}
        pendingCount={pending.length}
        isRound={Boolean(submission)}
        board={board}
        busy={busy}
        error={error}
        onStart={start}
      />
    );
  }

  if (phase === "countdown") {
    return (
      <GameShell>
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-200">Tayyormisiz?</p>
          <span key={count} className="quiz-count font-mono text-8xl font-black text-white tabular-nums">
            {count}
          </span>
        </div>
      </GameShell>
    );
  }

  if (phase === "question" && question) {
    return <QuestionScreen key={question.id} question={question} busy={busy} effects={effects} onSubmit={submit} error={error} />;
  }

  if (phase === "feedback" && feedback && question) {
    return <FeedbackScreen question={question} feedback={feedback} value={lastValue} expired={expired} onNext={next} />;
  }

  return (
    <ResultsScreen
      quiz={quiz}
      submission={submission}
      lessonId={lessonId}
      board={board}
      final={feedback?.final ?? null}
      score={feedback?.score ?? null}
      effects={effects}
    />
  );
}

/** O'yin ekranlari uchun umumiy to'q fon */
function GameShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 p-4 text-white shadow-xl sm:p-6",
        className
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-500/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="relative">{children}</div>
    </div>
  );
}

function GameIntro({
  quiz,
  pendingCount,
  isRound,
  board,
  busy,
  error,
  onStart,
}: {
  quiz: IQuizData;
  pendingCount: number;
  isRound: boolean;
  board: QuizLeaderboard | null;
  busy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const seconds = quiz.questions.reduce((s, q) => s + questionTimeLimit(q), 0);
  const active = board?.activeRun;
  return (
    <GameShell>
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/20 ring-1 ring-teal-400/30">
          <Gamepad2 className="h-8 w-8 text-teal-300" />
        </span>
        <div>
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{quiz.title}</h2>
          {quiz.description && <p className="mt-1 text-sm text-slate-300">{quiz.description}</p>}
        </div>

        <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <ListChecks className="h-4 w-4 text-teal-300" />
            {isRound ? `${pendingCount} ta yangi savol` : `${quiz.questions.length} ta savol`}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Clock className="h-4 w-4 text-teal-300" />~{Math.max(1, Math.round(seconds / 60))} daqiqa
          </span>
          {board && board.players > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
              <Trophy className="h-4 w-4 text-amber-300" />
              {board.players} kishi o&apos;ynadi
            </span>
          )}
        </div>

        <ul className="grid w-full max-w-md gap-2 text-left text-sm text-slate-200 sm:grid-cols-3 sm:text-center">
          <li className="rounded-2xl bg-white/[0.06] px-3 py-2.5">
            <Zap className="mb-1 inline h-4 w-4 text-amber-300" /> Tez javob — ko&apos;proq ochko
          </li>
          <li className="rounded-2xl bg-white/[0.06] px-3 py-2.5">
            <Flame className="mb-1 inline h-4 w-4 text-orange-400" /> Ketma-ket to&apos;g&apos;ri — bonus
          </li>
          <li className="rounded-2xl bg-white/[0.06] px-3 py-2.5">
            <Medal className="mb-1 inline h-4 w-4 text-teal-300" /> 1–3 o&apos;ringa coin
          </li>
        </ul>

        {error && <p className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-200">{error}</p>}

        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="quiz-pulse inline-flex min-h-[56px] w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-2xl bg-teal-400 text-lg font-black text-slate-950 shadow-lg shadow-teal-500/30 transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60"
        >
          {active ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
          {active ? `Davom ettirish (${active.index + 1}/${active.total})` : isRound ? "Yangi savollarni o'ynash" : "O'ynash"}
        </button>
        <p className="text-[11px] text-slate-400">Har bir savolga bir marta javob beriladi. Vaqt savol ochilishi bilan boshlanadi.</p>
      </div>
    </GameShell>
  );
}

function TimerRing({ remaining, limit }: { remaining: number; limit: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, remaining / (limit * 1000)));
  const secs = Math.ceil(remaining / 1000);
  const color = secs <= 5 ? "stroke-rose-400" : secs <= 10 ? "stroke-amber-300" : "stroke-teal-300";
  return (
    <div className={cn("relative h-16 w-16 shrink-0", secs <= 5 && remaining > 0 && "quiz-shake")} role="timer" aria-label={`${secs} soniya qoldi`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} className="fill-none stroke-white/10" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className={cn("fill-none transition-[stroke-dashoffset] duration-200 ease-linear", color)}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xl font-black tabular-nums">{secs}</span>
    </div>
  );
}

function QuestionScreen({
  question,
  busy,
  effects,
  error,
  onSubmit,
}: {
  question: GameQuestion;
  busy: boolean;
  effects: boolean;
  error: string | null;
  onSubmit: (value: string | string[], timedOut?: boolean) => void;
}) {
  const [deadline] = useState(() => Date.now() + question.remainingMs);
  const [remaining, setRemaining] = useState(question.remainingMs);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [locked, setLocked] = useState(false);
  const valueRef = useRef<string | string[]>("");
  const lastTick = useRef(Math.ceil(question.remainingMs / 1000));
  const sentRef = useRef(false);

  const isChoice = question.type === "single_choice" || question.type === "multiple_choice";
  // Vaqt tugaganda yuboriladigan qiymat (taymer intervali eng so'nggisini o'qiydi)
  useEffect(() => {
    valueRef.current = question.type === "multiple_choice" ? picked : isChoice ? picked[0] ?? "" : text;
  }, [question.type, isChoice, picked, text]);

  const send = useCallback(
    (value: string | string[], timedOut = false) => {
      if (sentRef.current) return;
      sentRef.current = true;
      setLocked(true);
      onSubmit(value, timedOut);
    },
    [onSubmit]
  );

  // Taymer: vaqt tugasa — shu paytgacha tanlangani yuboriladi
  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      const secs = Math.ceil(left / 1000);
      if (effects && secs < lastTick.current && secs <= 5 && secs > 0) playTickSound();
      lastTick.current = secs;
      if (left <= 0) {
        clearInterval(id);
        send(valueRef.current, true);
      }
    }, 100);
    return () => clearInterval(id);
  }, [deadline, effects, send]);

  const disabled = locked || busy;

  return (
    <GameShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>
                {question.index + 1} / {question.total}-savol
              </span>
              <span className="text-slate-400">{question.points} ball</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 transition-[width] duration-500"
                style={{ width: `${((question.index + 1) / question.total) * 100}%` }}
              />
            </div>
          </div>
          <TimerRing remaining={remaining} limit={question.timeLimit} />
        </div>

        <div className="quiz-pop rounded-2xl bg-white px-4 py-5 text-center text-slate-900 shadow-lg sm:px-6 sm:py-7">
          <p className="whitespace-pre-wrap text-lg font-black leading-snug sm:text-2xl">{question.prompt}</p>
          {question.type === "multiple_choice" && <p className="mt-2 text-xs font-semibold text-slate-500">Bir nechta to&apos;g&apos;ri javob bo&apos;lishi mumkin</p>}
        </div>

        {isChoice && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {question.options.map((opt, i) => {
              const on = picked.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => {
                    if (question.type === "single_choice") send(opt);
                    else setPicked((p) => (p.includes(opt) ? p.filter((x) => x !== opt) : [...p, opt]));
                  }}
                  className={cn(
                    "quiz-tile group flex min-h-[64px] cursor-pointer items-center gap-3 rounded-2xl border-b-4 px-4 py-3 text-left text-base font-bold text-white shadow-md transition-all active:translate-y-0.5 active:border-b-2 disabled:cursor-default sm:min-h-[84px] sm:text-lg",
                    TILE_COLORS[i % TILE_COLORS.length],
                    on && "ring-4 ring-white",
                    disabled && !on && "opacity-50"
                  )}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20 font-mono text-base font-black">
                    {on ? <Check className="h-5 w-5" strokeWidth={3} /> : LETTERS[i] ?? i + 1}
                  </span>
                  <span className="min-w-0 break-words">{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {question.type === "multiple_choice" && (
          <Button onClick={() => send(picked)} disabled={disabled || picked.length === 0} className="w-full min-h-[52px] text-base font-black">
            Tasdiqlash ({picked.length})
          </Button>
        )}

        {!isChoice && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send(text);
            }}
            className="space-y-2.5"
          >
            {question.type === "short_answer" ? (
              <input
                autoFocus
                value={text}
                disabled={disabled}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                placeholder="Javobingizni yozing…"
                className="w-full min-h-[56px] rounded-2xl border-2 border-white/20 bg-white/10 px-4 text-lg font-bold text-white placeholder:text-slate-400 focus:border-teal-300 focus:outline-hidden"
              />
            ) : (
              <textarea
                autoFocus
                rows={4}
                value={text}
                disabled={disabled}
                onChange={(e) => setText(e.target.value.slice(0, 5000))}
                placeholder="Batafsil javobingizni yozing…"
                className="w-full resize-none rounded-2xl border-2 border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-teal-300 focus:outline-hidden"
              />
            )}
            <Button type="submit" disabled={disabled || !text.trim()} className="w-full min-h-[52px] text-base font-black">
              Yuborish
            </Button>
          </form>
        )}

        {error && <p className="rounded-xl bg-rose-500/20 px-3 py-2 text-center text-sm font-semibold text-rose-200">{error}</p>}
      </div>
    </GameShell>
  );
}

function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function FeedbackScreen({
  question,
  feedback,
  value,
  expired,
  onNext,
}: {
  question: GameQuestion;
  feedback: GameFeedback;
  value: string | string[];
  expired: boolean;
  onNext: () => void;
}) {
  const points = useCountUp(feedback.gamePoints);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => buttonRef.current?.focus({ preventScroll: true }), []);

  const pending = feedback.isCorrect === null;
  const ok = feedback.isCorrect === true;
  const tone = pending
    ? "from-sky-600 to-indigo-700"
    : ok
    ? "from-emerald-500 to-emerald-700"
    : "from-rose-600 to-rose-800";
  const timedOut = feedback.timedOut || expired;
  const title = pending ? "Javob qabul qilindi" : ok ? "To'g'ri!" : timedOut ? "Vaqt tugadi" : "Noto'g'ri";
  const yours = Array.isArray(value) ? value.join(", ") : value;
  const correct = feedback.correctAnswers.filter((a) => a.trim()).join(question.type === "open_ended" ? "\n" : ", ");

  return (
    <div className={cn("quiz-pop relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-xl sm:p-7", tone)}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
          {pending ? <Clock className="h-8 w-8" /> : ok ? <Check className="h-9 w-9" strokeWidth={3} /> : <X className="h-9 w-9" strokeWidth={3} />}
        </span>
        <p className="text-3xl font-black tracking-tight sm:text-4xl">{title}</p>

        {ok && (
          <p className="font-mono text-5xl font-black tabular-nums drop-shadow-md">+{formatNumberUz(points)}</p>
        )}
        {ok && feedback.bonus > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-sm font-black">
            <Flame className="h-4 w-4 text-orange-300" /> {feedback.streak} ketma-ket · +{feedback.bonus} bonus
          </span>
        )}
        {pending && <p className="text-sm text-white/85">Ochiq savol — natija tekshirilgandan keyin chiqadi.</p>}

        {!ok && !pending && (
          <div className="w-full max-w-md space-y-2 text-left">
            {yours && !timedOut && (
              <p className="rounded-xl bg-black/20 px-3 py-2 text-sm">
                <span className="font-bold">Sizning javobingiz:</span> {yours}
              </p>
            )}
            {correct && (
              <p className="whitespace-pre-wrap rounded-xl bg-white/90 px-3 py-2 text-sm text-slate-900">
                <span className="font-bold">To&apos;g&apos;ri javob:</span> {correct}
              </p>
            )}
          </div>
        )}
        {feedback.explanation && !pending && (
          <p className="w-full max-w-md rounded-xl bg-black/15 px-3 py-2 text-left text-sm text-white/90">
            <span className="font-bold">Tushuntirish:</span> {feedback.explanation}
          </p>
        )}

        <p className="text-sm font-semibold text-white/80">
          Jami: <span className="font-mono font-black text-white">{formatNumberUz(feedback.score)}</span> ochko
        </p>

        <button
          ref={buttonRef}
          type="button"
          onClick={onNext}
          className="mt-1 inline-flex min-h-[52px] w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white text-base font-black text-slate-900 shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {feedback.finished ? "Natijani ko'rish" : "Keyingi savol"}
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

const PLACE_STYLE = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-400 text-orange-950"];

function ResultsScreen({
  quiz,
  submission,
  lessonId,
  board,
  final,
  score,
  effects,
}: {
  quiz: IQuizData;
  submission: IQuizSubmissionData | null;
  lessonId: string;
  board: QuizLeaderboard | null;
  final: GameFeedback["final"] | null;
  score: number | null;
  effects: boolean;
}) {
  const [showReview, setShowReview] = useState(false);
  const myRow = board?.rows.find((r) => r.isMe);
  const totalPoints = myRow?.score ?? score;
  const shown = useCountUp(totalPoints ?? 0, 1100);
  const rank = board?.myRank ?? null;
  const celebrated = useRef(false);
  const ended = board?.ended ?? false;

  useEffect(() => {
    if (!effects || celebrated.current || !rank || rank > 3 || !final) return;
    celebrated.current = true;
    void fireConfetti({ particleCount: 110, spread: 90, origin: { y: 0.4 }, zIndex: 80 });
  }, [effects, rank, final]);

  const totalScore = final?.totalScore ?? submission?.totalScore ?? 0;
  const maxScore = final?.maxScore ?? submission?.maxScore ?? 0;
  const status = final?.status ?? submission?.status;

  return (
    <div className="space-y-4">
      <GameShell>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/20 ring-1 ring-amber-300/30">
            <Trophy className="h-8 w-8 text-amber-300" />
          </span>
          {totalPoints !== null ? (
            <>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-200">O&apos;yin tugadi</p>
              <p className="font-mono text-6xl font-black tabular-nums">{formatNumberUz(shown)}</p>
              <p className="-mt-2 text-sm font-bold text-slate-300">ochko</p>
            </>
          ) : (
            <p className="text-lg font-black">Test topshirilgan</p>
          )}

          <div className="grid w-full max-w-md grid-cols-3 gap-2 text-center">
            <Stat label="O'rin" value={rank ? `${rank}/${board?.players ?? rank}` : "—"} />
            <Stat
              label="To'g'ri"
              value={myRow?.correct !== null && myRow?.correct !== undefined ? `${myRow.correct}/${myRow.total}` : final ? `${final.correct}/${final.total}` : "—"}
            />
            <Stat label="Ball" value={status === "graded" ? `${totalScore}/${maxScore}` : "Tekshirilmoqda"} />
          </div>
          {final && final.maxStreak > 1 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
              <Flame className="h-4 w-4 text-orange-400" /> Eng uzun seriya: {final.maxStreak} ta
            </span>
          )}
        </div>
      </GameShell>

      {board && board.rows.length > 0 && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/80 dark:bg-surface sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
              <Medal className="h-5 w-5 text-amber-500" /> Guruh reytingi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {ended
                ? "Reyting yakunlangan"
                : `${formatDateUz(board.endsAt)} da yakunlanadi · 1–3 o'rin: ${board.prizes.map((p) => `+${p}`).join(" / ")} coin`}
            </p>
          </div>
          <ol className="space-y-1.5">
            {board.rows.map((r, i) => (
              <li
                key={`${r.name}-${i}`}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5",
                  r.isMe ? "bg-teal-500/10 ring-1 ring-teal-500/40" : "bg-slate-50 dark:bg-slate-800/40"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-black",
                    r.rank && r.rank <= 3 ? PLACE_STYLE[r.rank - 1] : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  )}
                >
                  {r.rank ?? "–"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  {r.name}
                  {r.isMe && <span className="ml-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">(siz)</span>}
                </span>
                {r.score !== null ? (
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">{formatNumberUz(r.score)}</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                      {r.correct}/{r.total} to&apos;g&apos;ri
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">o&apos;yinsiz topshirgan</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {submission && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => setShowReview((v) => !v)} className="min-h-[44px]">
            {showReview ? "Javoblarni yashirish" : "Javoblarimni ko'rish"}
          </Button>
        </div>
      )}
      {showReview && submission && (
        <QuizView
          // Server yangilangan natijani yuborganda sharh ham yangilanadi
          key={`${submission?.status ?? "none"}-${submission?.answers.length ?? 0}`}
          lessonId={lessonId}
          quiz={quiz}
          initialSubmission={submission}
          role="student"
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] px-2 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 font-mono text-base font-black tabular-nums">{value}</p>
    </div>
  );
}
