"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Crown, Expand, Play, SkipForward, Square, Users, Volume2, VolumeX } from "lucide-react";
import Link from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  cancelLiveGameAction,
  finishLiveGameAction,
  getLiveHostStateAction,
  revealLiveQuestionAction,
  startLiveQuestionAction,
  type LiveHostState,
} from "@/actions/live-game.actions";
import { LIVE_MODES, SURVIVAL_LIVES } from "@/lib/live-game/modes";
import { fireConfetti } from "@/lib/confetti";
import { playCheckInSound, playFireworksSound, playTickSound, unlockSound } from "@/lib/sound";
import { MODE_COLORS, MODE_ICONS } from "./live-games-manager";
import { LETTERS, LiveShell, Lives, TEAM_STYLES, TILE_COLORS, TimerBadge, useCountdown } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

const POLL_MS = 1000;

export function LiveHostScreen({ initial }: { initial: LiveHostState }) {
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(true);
  const revealing = useRef<number | null>(null);
  const known = useRef(new Set(initial.players.map((p) => p.id)));
  const celebrated = useRef(false);

  const refresh = useCallback(async () => {
    const res = await getLiveHostStateAction(initial.id);
    if (res.success) setState(res.data);
  }, [initial.id]);

  // Holat har soniyada yangilanadi (tab yashirin bo'lsa — to'xtaydi)
  useEffect(() => {
    if (state.status === "finished") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, state.status]);

  // Yangi qo'shilgan o'quvchi — "ding"
  useEffect(() => {
    const fresh = state.players.filter((p) => !known.current.has(p.id));
    fresh.forEach((p) => known.current.add(p.id));
    if (fresh.length > 0 && sound && state.status === "lobby") playCheckInSound(fresh.length);
  }, [state.players, state.status, sound]);

  const remaining = useCountdown(state.remainingMs, state.status === "question");
  const lastTick = useRef(99);
  useEffect(() => {
    const secs = Math.ceil(remaining / 1000);
    if (sound && state.status === "question" && secs <= 5 && secs > 0 && secs < lastTick.current) playTickSound();
    lastTick.current = secs;
  }, [remaining, sound, state.status]);

  // Vaqt tugasa yoki hamma javob bersa — natija avtomatik ochiladi
  useEffect(() => {
    if (state.status !== "question" || revealing.current === state.index) return;
    const allDone = state.activeCount > 0 && state.players.filter((p) => !p.eliminated || p.answered).every((p) => p.answered);
    // Vaqt — server qiymati bo'yicha (mahalliy taymer faqat ko'rsatish uchun)
    const timeUp = state.remainingMs <= 0 || (remaining <= 0 && state.remainingMs < 1500);
    if (!timeUp && !allDone) return;
    revealing.current = state.index;
    void revealLiveQuestionAction(state.id).then(() => refresh());
  }, [remaining, state, refresh]);

  useEffect(() => {
    if (state.status !== "finished" || celebrated.current) return;
    celebrated.current = true;
    if (sound) playFireworksSound([0, 0.5, 1.1]);
    void fireConfetti({ particleCount: 160, spread: 100, origin: { y: 0.45 }, zIndex: 80 });
  }, [state.status, sound]);

  const act = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    unlockSound();
    setBusy(true);
    try {
      const res = await fn();
      if (!res.success) toast.error(res.error ?? "Xatolik");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const fullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };

  const Icon = MODE_ICONS[state.mode];
  const isLast = state.index + 1 >= state.total;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/mentor/live" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-slate-600 hover:text-teal-600 dark:text-slate-400">
          <ArrowLeft className="h-4 w-4" /> Jonli o&apos;yinlar
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSound((s) => !s)} className="gap-1.5" aria-pressed={sound}>
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Ovoz
          </Button>
          <Button variant="secondary" size="sm" onClick={fullscreen} className="gap-1.5">
            <Expand className="h-4 w-4" /> To&apos;liq ekran
          </Button>
        </div>
      </div>

      <LiveShell className="min-h-[70vh]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br", MODE_COLORS[state.mode])}>
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-black leading-tight">{LIVE_MODES[state.mode].title}</p>
              <p className="text-xs text-slate-400">{state.groupName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm font-bold text-slate-300">
            {state.index >= 0 && (
              <span>
                {Math.min(state.index + 1, state.total)} / {state.total}-savol
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
              <Users className="h-4 w-4" /> {state.players.length}
            </span>
          </div>
        </div>

        {state.status === "lobby" && (
          <Lobby state={state} busy={busy} onStart={() => act(() => startLiveQuestionAction(state.id))} onCancel={() => act(() => cancelLiveGameAction(state.id))} />
        )}
        {state.status === "question" && state.question && (
          <QuestionView state={state} remaining={remaining} busy={busy} onReveal={() => act(() => revealLiveQuestionAction(state.id))} />
        )}
        {state.status === "reveal" && state.question && (
          <RevealView
            state={state}
            busy={busy}
            isLast={isLast}
            onNext={() => act(() => startLiveQuestionAction(state.id))}
            onFinish={() => act(() => finishLiveGameAction(state.id))}
          />
        )}
        {state.status === "finished" && <Podium state={state} />}
      </LiveShell>
    </div>
  );
}

function Lobby({ state, busy, onStart, onCancel }: { state: LiveHostState; busy: boolean; onStart: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Kutish zali</p>
        <h2 className="mt-2 text-3xl font-black sm:text-5xl">Qo&apos;shiling!</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
          Telefonda saytga kiring — ekran o&apos;rtasida yoki tepadagi <strong className="text-white">&quot;Jonli o&apos;yinga qo&apos;shilish&quot;</strong> tugmasini bosing.
        </p>
      </div>
      <ul className="flex flex-wrap justify-center gap-2 text-xs text-slate-300">
        {LIVE_MODES[state.mode].rules.map((r) => (
          <li key={r} className="rounded-full bg-white/10 px-3 py-1.5">
            {r}
          </li>
        ))}
      </ul>
      <div className="flex min-h-[120px] w-full flex-wrap content-start justify-center gap-2">
        {state.players.length === 0 ? (
          <p className="self-center text-sm text-slate-400">Hali hech kim qo&apos;shilmadi…</p>
        ) : (
          state.players.map((p) => (
            <span
              key={p.id}
              className={cn(
                "quiz-pop inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-base font-black shadow-lg",
                state.mode === "team" ? `ring-1 ${TEAM_STYLES[p.team]?.soft}` : "bg-white text-slate-900"
              )}
            >
              {state.mode === "team" && <span className={cn("h-2.5 w-2.5 rounded-full", TEAM_STYLES[p.team]?.dot)} />}
              {p.name}
            </span>
          ))
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="quiz-pulse inline-flex min-h-[60px] cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-10 text-xl font-black text-slate-900 shadow-lg transition-transform hover:scale-[1.03] disabled:opacity-60"
        >
          <Play className="h-6 w-6 fill-current" /> Boshlash ({state.players.length})
        </button>
        <Button variant="ghost" onClick={onCancel} disabled={busy} className="text-slate-300 hover:text-white">
          Bekor qilish
        </Button>
      </div>
    </div>
  );
}

function QuestionView({ state, remaining, busy, onReveal }: { state: LiveHostState; remaining: number; busy: boolean; onReveal: () => void }) {
  const q = state.question!;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="quiz-pop min-w-0 flex-1 rounded-3xl bg-white px-5 py-6 text-center text-slate-900 shadow-xl sm:px-8 sm:py-10">
          <p className="whitespace-pre-wrap text-2xl font-black leading-snug sm:text-4xl">{q.prompt}</p>
          {q.type === "multiple_choice" && <p className="mt-2 text-sm font-semibold text-slate-500">Bir nechta to&apos;g&apos;ri javob</p>}
          {q.type === "short_answer" && <p className="mt-2 text-sm font-semibold text-slate-500">Javobni telefonda yozing</p>}
        </div>
        <TimerBadge ms={remaining} limit={q.timeLimit} big />
      </div>
      {q.options.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.options.map((opt, i) => (
            <div
              key={opt}
              className={cn("quiz-tile flex min-h-[80px] items-center gap-4 rounded-2xl border-b-4 px-5 text-xl font-black shadow-md sm:text-2xl", TILE_COLORS[i % TILE_COLORS.length])}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/20 font-mono">{LETTERS[i]}</span>
              <span className="min-w-0 break-words">{opt}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-black">
          Javob berdi: <span className="font-mono text-emerald-300">{state.players.filter((p) => p.answered).length}</span>
          <span className="text-slate-400"> / {state.activeCount}</span>
        </p>
        <Button variant="secondary" onClick={onReveal} disabled={busy} className="gap-2">
          <SkipForward className="h-4 w-4" /> Natijani ko&apos;rsatish
        </Button>
      </div>
    </div>
  );
}

function RevealView({
  state,
  busy,
  isLast,
  onNext,
  onFinish,
}: {
  state: LiveHostState;
  busy: boolean;
  isLast: boolean;
  onNext: () => void;
  onFinish: () => void;
}) {
  const q = state.question!;
  const max = Math.max(1, ...state.distribution.map((d) => d.count));
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white/[0.06] px-5 py-4 text-center">
        <p className="text-lg font-black sm:text-2xl">{q.prompt}</p>
        <p className="mt-1 text-sm text-slate-300">
          To&apos;g&apos;ri javob berdi: <strong className="text-emerald-300">{state.correctCount}</strong> / {state.players.length}
        </p>
      </div>

      {state.distribution.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {state.distribution.map((d, i) => (
            <div
              key={d.option}
              className={cn(
                "relative flex min-h-[60px] items-center gap-3 overflow-hidden rounded-2xl px-4 text-lg font-black",
                d.correct ? "bg-emerald-600 ring-4 ring-emerald-300" : "bg-white/10 text-white/60"
              )}
            >
              <span aria-hidden className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${(d.count / max) * 100}%` }} />
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/20 font-mono">
                {d.correct ? <Check className="h-5 w-5" strokeWidth={3} /> : LETTERS[i]}
              </span>
              <span className="relative min-w-0 flex-1 break-words">{d.option}</span>
              <span className="relative font-mono">{d.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-xl font-black">To&apos;g&apos;ri javob: {state.correctAnswers.join(" / ")}</p>
      )}

      <ModePanel state={state} />

      <div className="flex justify-end gap-2">
        {isLast ? (
          <button type="button" onClick={onFinish} disabled={busy} className="inline-flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl bg-amber-400 px-8 text-lg font-black text-slate-900 disabled:opacity-60">
            <Crown className="h-5 w-5" /> G&apos;oliblarni ko&apos;rsatish
          </button>
        ) : (
          <button type="button" onClick={onNext} disabled={busy} className="inline-flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl bg-white px-8 text-lg font-black text-slate-900 disabled:opacity-60">
            Keyingi savol <SkipForward className="h-5 w-5" />
          </button>
        )}
        {!isLast && (
          <Button variant="ghost" onClick={onFinish} disabled={busy} className="gap-1.5 text-slate-300 hover:text-white">
            <Square className="h-4 w-4" /> Yakunlash
          </Button>
        )}
      </div>
    </div>
  );
}

function ModePanel({ state }: { state: LiveHostState }) {
  if (state.mode === "team") {
    const top = Math.max(1, ...state.standings.map((s) => s.average));
    return (
      <div className="space-y-2">
        {state.standings.map((s, i) => (
          <div key={s.team} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm font-black">
              {i === 0 && "👑 "}
              {s.name}
            </span>
            <div className="h-9 flex-1 overflow-hidden rounded-xl bg-white/10">
              <div className={cn("flex h-full items-center justify-end rounded-xl px-3 font-mono text-sm font-black transition-[width] duration-700", TEAM_STYLES[s.team]?.bar)} style={{ width: `${Math.max(8, (s.average / top) * 100)}%` }}>
                {formatNumberUz(s.average)}
              </div>
            </div>
            <span className="w-10 text-right text-xs text-slate-400">{s.members} ta</span>
          </div>
        ))}
      </div>
    );
  }
  const rows = state.players.slice(0, 5);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <ol className="space-y-1.5">
        {rows.map((p, i) => (
          <li key={p.id} className={cn("flex items-center gap-3 rounded-2xl px-4 py-2.5", p.eliminated ? "bg-white/[0.03] text-white/40" : "bg-white/10")}>
            <span className="w-6 font-mono font-black text-slate-400">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-base font-black">{p.name}</span>
            {state.mode === "survival" && <Lives lives={p.lives} max={SURVIVAL_LIVES} />}
            {p.lastPoints > 0 && <span className="font-mono text-xs font-black text-emerald-300">+{p.lastPoints}</span>}
            <span className="w-20 text-right font-mono text-base font-black">{formatNumberUz(p.score)}</span>
          </li>
        ))}
      </ol>
      {state.mode === "survival" && (
        <div className="rounded-2xl bg-white/[0.06] px-5 py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Omon qolganlar</p>
          <p className="font-mono text-5xl font-black text-rose-300">{state.players.filter((p) => !p.eliminated).length}</p>
        </div>
      )}
      {state.mode === "chest" && state.events.length > 0 && (
        <ul className="space-y-1.5 lg:w-72">
          {state.events.slice(0, 5).map((e, i) => (
            <li key={i} className="quiz-pop rounded-xl bg-amber-400/15 px-3 py-2 text-sm font-bold text-amber-100">
              {e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PODIUM = [
  { place: 2, h: "h-28", color: "bg-slate-300 text-slate-900" },
  { place: 1, h: "h-40", color: "bg-amber-400 text-amber-950" },
  { place: 3, h: "h-20", color: "bg-orange-400 text-orange-950" },
];

function Podium({ state }: { state: LiveHostState }) {
  if (state.mode === "team") {
    const winner = state.standings[0];
    const members = state.players.filter((p) => p.team === winner?.team);
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <Crown className="h-14 w-14 text-amber-300" />
        <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-200">G&apos;olib jamoa</p>
        <h2 className="text-5xl font-black">{winner?.name ?? "—"}</h2>
        <p className="text-slate-300">O&apos;rtacha {formatNumberUz(winner?.average ?? 0)} ochko</p>
        <div className="flex flex-wrap justify-center gap-2">
          {members.map((m) => (
            <span key={m.id} className="rounded-2xl bg-white px-4 py-2 font-black text-slate-900">
              {m.name}
              {m.coins > 0 && <span className="ml-1.5 text-amber-600">+{m.coins}</span>}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const top = state.players.slice(0, 3);
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-200">G&apos;oliblar</p>
      <div className="flex w-full max-w-2xl items-end justify-center gap-3">
        {PODIUM.map(({ place, h, color }) => {
          const p = top[place - 1];
          if (!p) return <div key={place} className="flex-1" />;
          return (
            <div key={place} className="quiz-pop flex flex-1 flex-col items-center gap-2" style={{ animationDelay: `${(3 - place) * 250}ms` }}>
              <span className="max-w-full truncate text-lg font-black sm:text-2xl">{p.name}</span>
              <span className="font-mono text-sm text-slate-300">{formatNumberUz(p.score)}</span>
              {p.coins > 0 && <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-black text-amber-200">+{p.coins} coin</span>}
              <div className={cn("flex w-full items-start justify-center rounded-t-2xl pt-3 font-mono text-4xl font-black", h, color)}>{place}</div>
            </div>
          );
        })}
      </div>
      <Link href="/mentor/live" className="inline-flex min-h-[48px] items-center rounded-2xl bg-white/10 px-6 font-bold hover:bg-white/20">
        Yangi o&apos;yin
      </Link>
    </div>
  );
}
