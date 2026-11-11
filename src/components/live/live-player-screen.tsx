"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Crown, Gem, Hourglass, Shield, Sparkles, X, Zap } from "lucide-react";
import Link from "@/components/ui/link";
import {
  answerLiveQuestionAction,
  getLivePlayerStateAction,
  joinLiveGameAction,
  openLiveChestAction,
  type LivePlayerState,
} from "@/actions/live-game.actions";
import { LIVE_MODES, SURVIVAL_LIVES } from "@/lib/live-game/modes";
import { haptic } from "@/lib/haptics";
import { fireConfetti } from "@/lib/confetti";
import { requestRewardCheck } from "@/lib/rewards-client";
import { MODE_COLORS, MODE_ICONS } from "./live-games-manager";
import { MinigamePlayer } from "./live-minigame";
import { ArenaPlayer } from "./arena/arena-screens";
import { ImmersiveFrame, LETTERS, LiveShell, Lives, TEAM_STYLES, TILE_COLORS, TimerBadge, useCountdown } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

const POLL_MS = 1500;

export function LivePlayerScreen({ initial }: { initial: LivePlayerState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chest, setChest] = useState<{ kind: string; text: string; key: number } | null>(null);
  const seenReveal = useRef(-1);
  const celebrated = useRef(false);

  const refresh = useCallback(async () => {
    const res = await getLivePlayerStateAction(initial.id);
    if (res.success) setState(res.data);
  }, [initial.id]);

  useEffect(() => {
    if (state.status === "finished") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, state.status]);

  // Natija ochilganda — titrash (sinfda ovoz chiqarmaymiz)
  useEffect(() => {
    if (state.status !== "reveal" || seenReveal.current === state.index || !state.me) return;
    seenReveal.current = state.index;
    if (state.me.lastCorrect) haptic([30, 40, 30]);
    else haptic([120]);
  }, [state.status, state.index, state.me]);

  useEffect(() => {
    if (state.status !== "finished" || celebrated.current || !state.me) return;
    celebrated.current = true;
    requestRewardCheck();
    if (state.me.coins > 0) void fireConfetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, zIndex: 80 });
  }, [state.status, state.me]);

  const join = async () => {
    setBusy(true);
    setError(null);
    const res = await joinLiveGameAction(state.id);
    if (!res.success) setError(res.error);
    await refresh();
    setBusy(false);
  };

  const answer = async (value: string | string[]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Darhol "qabul qilindi" ko'rinsin
    setState((s) => (s.me ? { ...s, me: { ...s.me, answered: true, value } } : s));
    const res = await answerLiveQuestionAction(state.id, state.index, value);
    if (!res.success) setError(res.error);
    await refresh();
    setBusy(false);
  };

  const openChest = async () => {
    if (busy) return;
    setBusy(true);
    const res = await openLiveChestAction(state.id);
    if (res.success) {
      setChest({ kind: res.data.kind, text: res.data.text, key: Date.now() });
      haptic(res.data.kind === "empty" ? [60] : [30, 50, 30, 50]);
    } else setError(res.error);
    await refresh();
    setBusy(false);
  };

  const Icon = MODE_ICONS[state.mode];
  const me = state.me;

  return (
    <ImmersiveFrame>
      <div className={cn("mx-auto flex min-h-0 w-full flex-1 flex-col [&>*]:flex-1", state.status === "arena" ? "max-w-none" : "max-w-xl md:max-w-3xl lg:max-w-5xl")}>
      <LiveShell className="min-h-[75vh]">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br", MODE_COLORS[state.mode])}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-black leading-tight">{LIVE_MODES[state.mode].title}</p>
              <p className="text-[11px] text-slate-400">{state.groupName}</p>
            </div>
          </div>
          {me && (
            <div className="text-right">
              <p className="font-mono text-xl font-black tabular-nums lg:text-3xl">{formatNumberUz(me.score)}</p>
              <p className="text-[11px] text-slate-400">
                {me.rank}/{me.players}-o&apos;rin
              </p>
            </div>
          )}
        </div>

        {me && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold">
            {state.mode === "survival" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
                <Lives lives={me.lives} max={SURVIVAL_LIVES} />
              </span>
            )}
            {state.mode === "team" && (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1", TEAM_STYLES[me.team]?.soft)}>
                <span className={cn("h-2 w-2 rounded-full", TEAM_STYLES[me.team]?.dot)} /> {me.teamName}
              </span>
            )}
            {state.mode === "chest" && me.shield && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-3 py-1 text-sky-200">
                <Shield className="h-3.5 w-3.5" /> Qalqon
              </span>
            )}
            {state.mode === "chest" && me.double && (
              <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-3 py-1 text-fuchsia-200">
                <Zap className="h-3.5 w-3.5" /> ×2
              </span>
            )}
            {me.streak > 1 && <span className="rounded-full bg-orange-500/20 px-3 py-1 text-orange-200">🔥 {me.streak} ketma-ket</span>}
          </div>
        )}

        {error && <p className="mb-3 rounded-xl bg-rose-500/20 px-3 py-2 text-center text-sm font-semibold text-rose-200">{error}</p>}

        {!state.joined && state.status !== "finished" ? (
          <JoinView state={state} busy={busy} onJoin={join} />
        ) : state.status === "lobby" ? (
          <Waiting title="Siz o'yindasiz!" text="Mentor o'yinni boshlashini kuting. Savollar shu yerda chiqadi." />
        ) : state.status === "question" ? (
          me?.eliminated ? (
            <Waiting title="Siz o'yindan chiqdingiz" text="Jonlar tugadi — oxirigacha tomosha qiling." tone="out" />
          ) : me?.answered ? (
            <Waiting title="Javob qabul qilindi" text="Boshqalar javob berishini kuting…" tone="ok" />
          ) : (
            <AnswerView key={state.index} state={state} busy={busy} onAnswer={answer} />
          )
        ) : state.status === "arena" && state.arena ? (
          <ArenaPlayer gameId={state.id} arena={state.arena} />
        ) : state.status === "minigame" && state.minigame ? (
          <MinigamePlayer key={state.minigame.round} gameId={state.id} m={state.minigame} />
        ) : state.status === "reveal" ? (
          <RevealView state={state} chest={chest} busy={busy} onOpenChest={openChest} />
        ) : (
          <FinishedView state={state} />
        )}
      </LiveShell>
      </div>
    </ImmersiveFrame>
  );
}

function JoinView({ state, busy, onJoin }: { state: LivePlayerState; busy: boolean; onJoin: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-fuchsia-300">Jonli o&apos;yin</p>
      <h2 className="text-3xl font-black">{LIVE_MODES[state.mode].tagline}</h2>
      <ul className="space-y-1.5 text-sm text-slate-300">
        {LIVE_MODES[state.mode].rules.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onJoin}
        disabled={busy}
        className="quiz-pulse inline-flex min-h-[60px] w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white text-xl font-black text-slate-900 disabled:opacity-60"
      >
        <Sparkles className="h-6 w-6" /> Qo&apos;shilish
      </button>
    </div>
  );
}

function Waiting({ title, text, tone = "wait" }: { title: string; text: string; tone?: "wait" | "ok" | "out" }) {
  const Icon = tone === "ok" ? Check : tone === "out" ? X : Hourglass;
  return (
    <div className="quiz-pop flex flex-col items-center gap-4 py-14 text-center">
      <span
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-full",
          tone === "ok" ? "bg-emerald-500/20 text-emerald-300" : tone === "out" ? "bg-rose-500/20 text-rose-300" : "bg-white/10 text-white"
        )}
      >
        <Icon className={cn("h-10 w-10", tone === "wait" && "animate-pulse")} />
      </span>
      <p className="text-2xl font-black lg:text-4xl">{title}</p>
      <p className="max-w-xs text-sm text-slate-300">{text}</p>
    </div>
  );
}

function AnswerView({ state, busy, onAnswer }: { state: LivePlayerState; busy: boolean; onAnswer: (v: string | string[]) => void }) {
  const q = state.question!;
  const remaining = useCountdown(state.remainingMs, true);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const timeUp = remaining <= 0;

  // Kompyuterda klaviatura: 1–6 yoki A–F — variant, Enter — tasdiqlash (bir nechta javobda)
  const keyRef = useRef({ picked, busy, timeUp, onAnswer });
  useEffect(() => {
    keyRef.current = { picked, busy, timeUp, onAnswer };
  });
  useEffect(() => {
    if (q.type === "short_answer") return;
    const onKey = (e: KeyboardEvent) => {
      const { picked: cur, busy: b, timeUp: up, onAnswer: send } = keyRef.current;
      if (b || up || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const i = /^[1-6]$/.test(k) ? Number(k) - 1 : "abcdef".indexOf(k);
      if (e.key === "Enter" && q.type === "multiple_choice" && cur.length > 0) {
        send(cur);
        return;
      }
      if (i < 0 || i >= q.options.length) return;
      const opt = q.options[i];
      if (q.type === "single_choice") send(opt);
      else setPicked((p) => (p.includes(opt) ? p.filter((x) => x !== opt) : [...p, opt]));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q.type, q.options]);

  return (
    <div className="space-y-3 lg:space-y-5">
      {state.bonus && <p className="live-pop mx-auto w-fit rounded-xl bg-amber-400 px-4 py-1.5 text-sm font-black text-slate-950 lg:text-lg">⚡ BONUS: ochko ×2</p>}
      <div className="flex items-start gap-3 lg:gap-5">
        <p className="min-w-0 flex-1 whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-base font-black text-slate-900 sm:text-xl md:px-6 md:py-5 lg:text-4xl lg:leading-snug">{q.prompt}</p>
        <span className="lg:hidden">
          <TimerBadge ms={remaining} limit={q.timeLimit} />
        </span>
        <span className="hidden lg:block">
          <TimerBadge ms={remaining} limit={q.timeLimit} big />
        </span>
      </div>
      {timeUp && <p className="text-center text-sm font-bold text-rose-300">Vaqt tugadi</p>}

      {q.type !== "short_answer" ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:gap-4">
          {q.options.map((opt, i) => {
            const on = picked.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                disabled={busy || timeUp}
                onClick={() => {
                  if (q.type === "single_choice") onAnswer(opt);
                  else setPicked((p) => (p.includes(opt) ? p.filter((x) => x !== opt) : [...p, opt]));
                }}
                className={cn(
                  "quiz-tile flex min-h-[68px] cursor-pointer items-center gap-3 rounded-2xl border-b-4 px-4 text-left text-lg font-black shadow-md transition-transform hover:scale-[1.02] active:translate-y-0.5 disabled:opacity-50 sm:min-h-[96px] sm:text-xl lg:min-h-[130px] lg:gap-4 lg:px-6 lg:text-3xl",
                  TILE_COLORS[i % TILE_COLORS.length],
                  on && "ring-4 ring-white"
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20 font-mono lg:h-14 lg:w-14 lg:text-2xl">
                  {on ? <Check className="h-5 w-5" strokeWidth={3} /> : LETTERS[i]}
                </span>
                <span className="min-w-0 break-words">{opt}</span>
              </button>
            );
          })}
          {q.type === "multiple_choice" && (
            <button
              type="button"
              disabled={busy || timeUp || picked.length === 0}
              onClick={() => onAnswer(picked)}
              className="min-h-[56px] cursor-pointer rounded-2xl bg-white text-lg font-black text-slate-900 disabled:opacity-50 sm:col-span-2 lg:min-h-[72px] lg:text-2xl"
            >
              Tasdiqlash ({picked.length})
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(text);
          }}
          className="space-y-2.5"
        >
          <input
            autoFocus
            value={text}
            disabled={busy || timeUp}
            onChange={(e) => setText(e.target.value.slice(0, 200))}
            placeholder="Javobingiz…"
            className="w-full min-h-[60px] rounded-2xl border-2 border-white/20 bg-white/10 px-4 text-xl font-black text-white placeholder:text-slate-400 focus:border-white focus:outline-hidden lg:min-h-[84px] lg:text-3xl"
          />
          <button type="submit" disabled={busy || timeUp || !text.trim()} className="w-full min-h-[56px] cursor-pointer rounded-2xl bg-white text-lg font-black text-slate-900 disabled:opacity-50 lg:min-h-[72px] lg:text-2xl">
            Yuborish
          </button>
        </form>
      )}
    </div>
  );
}

function RevealView({
  state,
  chest,
  busy,
  onOpenChest,
}: {
  state: LivePlayerState;
  chest: { kind: string; text: string; key: number } | null;
  busy: boolean;
  onOpenChest: () => void;
}) {
  const me = state.me!;
  const ok = me.lastCorrect === true;
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "quiz-pop flex flex-col items-center gap-2 rounded-3xl px-4 py-7 text-center",
          me.eliminated && me.lastCorrect !== true ? "bg-rose-700" : ok ? "bg-emerald-600" : "bg-rose-600"
        )}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          {ok ? <Check className="h-8 w-8" strokeWidth={3} /> : <X className="h-8 w-8" strokeWidth={3} />}
        </span>
        <p className="text-3xl font-black lg:text-5xl">{ok ? "To'g'ri!" : me.value === null || me.value === "" ? "Javob bermadingiz" : "Noto'g'ri"}</p>
        {ok && me.lastPoints > 0 && <p className="font-mono text-4xl font-black lg:text-6xl">+{formatNumberUz(me.lastPoints)}</p>}
        {me.lastRank > 0 && (
          <p className="live-pop mt-1 inline-flex items-center gap-2 rounded-full bg-black/20 px-4 py-1.5 text-base font-black lg:text-xl" style={{ animationDelay: "0.6s" }}>
            {me.lastRank === 1 ? "👑 1-o'rindasiz!" : `${me.lastRank}-o'rin`}
            {me.prevRank > me.lastRank && <span className="text-emerald-200">↑{me.prevRank - me.lastRank}</span>}
            {me.prevRank > 0 && me.prevRank < me.lastRank && <span className="text-rose-200">↓{me.lastRank - me.prevRank}</span>}
          </p>
        )}
        {!ok && state.mode === "survival" && (
          <p className="text-sm font-bold">{me.eliminated ? "Jonlar tugadi — o'yindan chiqdingiz" : `Bitta jon ketdi · qoldi: ${me.lives}`}</p>
        )}
        {!ok && state.correctAnswers.length > 0 && (
          <p className="rounded-xl bg-white/90 px-3 py-1.5 text-sm font-bold text-slate-900">To&apos;g&apos;ri javob: {state.correctAnswers.join(", ")}</p>
        )}
      </div>

      {state.mode === "chest" && (me.chests > 0 || chest) && (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-amber-400/10 p-5 text-center ring-1 ring-amber-300/30">
          {chest && (
            <p key={chest.key} className="quiz-count text-xl font-black text-amber-100">
              {chest.text}
            </p>
          )}
          {me.chests > 0 && (
            <button
              type="button"
              onClick={onOpenChest}
              disabled={busy}
              className="quiz-pulse inline-flex min-h-[64px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-xl font-black text-amber-950 disabled:opacity-60"
            >
              <Gem className="h-6 w-6" /> Sandiqni ochish {me.chests > 1 ? `(${me.chests})` : ""}
            </button>
          )}
        </div>
      )}

      {state.mode === "team" && state.standings.length > 0 && (
        <div className="space-y-1.5">
          {state.standings.map((s) => (
            <div key={s.team} className={cn("flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold ring-1", TEAM_STYLES[s.team]?.soft)}>
              <span>{s.name}</span>
              <span className="font-mono">{formatNumberUz(s.average)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-center text-xs text-slate-400">Keyingi savolni kuting…</p>
    </div>
  );
}

function FinishedView({ state }: { state: LivePlayerState }) {
  const me = state.me;
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <Crown className="h-14 w-14 text-amber-300" />
      <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">O&apos;yin tugadi</p>
      {me ? (
        <>
          <p className="text-4xl font-black">{me.rank}-o&apos;rin</p>
          <p className="font-mono text-lg text-slate-300">{formatNumberUz(me.score)} ochko</p>
          {me.coins > 0 && <p className="rounded-full bg-amber-400/20 px-4 py-1.5 text-lg font-black text-amber-200">+{me.coins} coin</p>}
        </>
      ) : (
        <p className="text-slate-300">Bu o&apos;yinda qatnashmadingiz.</p>
      )}
      {state.top.length > 0 && (
        <ol className="w-full space-y-1.5 text-left">
          {state.top.map((t, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">
              <span className="w-5 font-mono text-slate-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="font-mono">{formatNumberUz(t.score)}</span>
            </li>
          ))}
        </ol>
      )}
      <Link href="/" className="inline-flex min-h-[48px] items-center rounded-2xl bg-white/10 px-6 font-bold hover:bg-white/20">
        Bosh sahifaga
      </Link>
    </div>
  );
}
