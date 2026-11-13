"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, Crown, Music, Pause, Settings2, Swords, Play, Repeat, SkipForward, Square, Users, Volume2, VolumeX } from "lucide-react";
import Link from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  cancelLiveGameAction,
  endMinigameAction,
  endArenaAction,
  finishLiveGameAction,
  revealLiveQuestionAction,
  startLiveIntroAction,
  startLiveQuestionAction,
  type LiveHostState,
} from "@/actions/live-game.actions";
import { TACTICS, isAdventure } from "@/lib/live-game/adventures";
import { MODE_THEMES } from "@/lib/live-game/themes";
import { AdventureBoard } from "./adventure-boards";
import { useLivePoll } from "./use-live-poll";
import { ModeIntro } from "./live-intro";
import { LIVE_MODES, SURVIVAL_LIVES } from "@/lib/live-game/modes";
import { playCheckInSound, playGameStart, playTickSound, unlockSound } from "@/lib/sound";
import { liveMusic } from "@/lib/live-game/music";
import { LiveLeaderboard } from "./live-leaderboard";
import { LivePodium } from "./live-podium";
import { BackgroundTrack, MUSIC_TRACKS, setMusicChoice, useMusicChoice, type MusicChoice } from "./live-track";
import { MinigameHost } from "./live-minigame";
import { ArenaHost } from "./arena/arena-screens";
import { MODE_COLORS, MODE_ICONS } from "./live-games-manager";
import { ImmersiveFrame, LETTERS, LiveShell, Lives, TEAM_STYLES, TILE_COLORS, TimerBadge, useCountdown } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

const POLL_MS = 1000;
/** Kutish zali kuyi (o'quvchilar qo'shilayotganda) */
const LOBBY_TRACK = "/audio/lobby.mp3";

/** Avto rejimda natija shuncha soniya ko'rsatiladi (xazinada — sandiq ochishga ulgurish uchun ko'proq) */
/** Avto rejimda natijadan keyingi kutish: to'g'ri javob (~3,5 s) + reyting sahnasi; xazinada sandiq ochishga ko'proq */
const autoDelayFor = (mode: LiveHostState["mode"]) => (mode === "chest" ? 14 : 10);
/** Natijada to'g'ri javob shuncha ko'rsatilgach reyting sahnasiga o'tiladi */
const ANSWER_STEP_MS = 3500;
/** Sarguzasht rejimlari: hamma javob bergach taktika tanlashga ko'pi bilan shuncha vaqt */
const TACTIC_WAIT_MS = 6000;

// "Avto" tanlovi brauzerda eslab qolinadi (keyingi o'yinda ham yoqilgan bo'ladi)
const AUTO_KEY = "itxiva:live-autoplay";
const AUTO_EVENT = "itxiva:live-autoplay";
function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}
function writeAuto(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    // Saqlab bo'lmasa ham shu sahifada ishlaydi
  }
  window.dispatchEvent(new Event(AUTO_EVENT));
}
function subscribeAuto(cb: () => void) {
  window.addEventListener(AUTO_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(AUTO_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function LiveHostScreen({ initial }: { initial: LiveHostState }) {
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [musicMenu, setMusicMenu] = useState(false);
  // Tayyor kuy tanlangan bo'lsa — o'sha chalinadi (original sintez kuylari o'chadi)
  const choice = useMusicChoice(initial.mode);
  const track = choice === "synth" ? null : MUSIC_TRACKS[choice];
  const synthOn = music && !track;
  // Natijaning ikkinchi qadami (reyting) qaysi savol uchun ochilgan
  const [boardFor, setBoardFor] = useState<number | null>(null);
  const autoplay = useSyncExternalStore(subscribeAuto, readAuto, () => false);
  // Avto rejim sanog'i: qaysi savol natijasi uchun va necha soniya qoldi
  const [auto, setAuto] = useState<{ key: string; left: number } | null>(null);
  const autoFired = useRef<string | null>(null);
  const minigameEnding = useRef<number | null>(null);
  const minigameEndsAt = useRef<{ round: number; at: number } | null>(null);
  const revealing = useRef<number | null>(null);
  const allDoneAt = useRef<{ index: number; at: number } | null>(null);
  const known = useRef(new Set(initial.players.map((p) => p.id)));

  // Holat har soniyada yangilanadi (tab yashirin bo'lsa — to'xtaydi). Oddiy GET: ustoz tugmalari
  // (server action) holat so'rovlari ortida navbatda kutib qolmaydi, sekin internetda so'rovlar to'planmaydi.
  const { refresh } = useLivePoll<LiveHostState>(
    `/api/live/host?gameId=${encodeURIComponent(initial.id)}`,
    POLL_MS,
    state.status !== "finished",
    setState
  );

  // Deploydan keyingi avtomatik yangilanish savol/jang/mini-o'yin o'rtasida bo'lmasin (VersionWatcher kutadi)
  useEffect(() => {
    const busy = state.status === "question" || state.status === "arena" || state.status === "minigame";
    document.documentElement.dataset.liveBusy = busy ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.liveBusy;
    };
  }, [state.status]);

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
    // Sarguzasht rejimlarida hamma javob bergan bo'lsa ham — taktika tanlashga bir necha soniya
    if (!timeUp && isAdventure(state.mode) && !state.players.filter((p) => p.answered).every((p) => p.tactic)) {
      if (allDoneAt.current?.index !== state.index) allDoneAt.current = { index: state.index, at: Date.now() };
      if (Date.now() - allDoneAt.current.at < TACTIC_WAIT_MS) return;
    }
    const index = state.index;
    revealing.current = index;
    // Tarmoq xatosida belgi qaytariladi — keyingi yangilanishda yana urinadi (aks holda savol ochilmay qolardi)
    void revealLiveQuestionAction(state.id).then(
      () => refresh(),
      () => {
        if (revealing.current === index) revealing.current = null;
      }
    );
  }, [remaining, state, refresh]);

  // Jang vaqti tugasa (yoki bitta o'yinchi qolsa) — bonus hisoblanadi
  // Har jang (raund) uchun alohida: muddatlar bir marta eslab qolinadi
  const arenaEnding = useRef<number | null>(null);
  const arenaEndsAt = useRef<{ round: number; at: number } | null>(null);
  const arenaDecidedAt = useRef<{ round: number; at: number } | null>(null);
  useEffect(() => {
    const a = state.arena;
    if (state.status !== "arena" || !a || a.ended || arenaEnding.current === a.round) return;
    if (arenaEndsAt.current?.round !== a.round) arenaEndsAt.current = { round: a.round, at: Date.now() + a.startsInMs + a.remainingMs };
    // Bittadan boshqa hamma chiqib ketsa — g'olib aniq, jang tugaydi
    // Jamoaviy arenada — bitta jamoa qolganda
    const aliveTeams = a.teams ? new Set(a.rows.filter((r) => !r.out).map((r) => r.team)).size : 0;
    const decided = a.startsInMs === 0 && (a.teams ? a.teams.length >= 2 && aliveTeams <= 1 : a.rows.length >= 2 && a.alive <= 1);
    // Mutlaq muddat: har soniyalik so'rov taymerni qaytadan boshlamasin
    if (decided && arenaDecidedAt.current?.round !== a.round) arenaDecidedAt.current = { round: a.round, at: Date.now() + 3000 };
    const deadline = decided ? arenaDecidedAt.current!.at : arenaEndsAt.current.at + 2000;
    const wait = Math.max(0, deadline - Date.now());
    const t = setTimeout(() => {
      arenaEnding.current = a.round;
      void endArenaAction(state.id).then(
        () => refresh(),
        () => {
          if (arenaEnding.current === a.round) arenaEnding.current = null;
          void refresh();
        }
      );
    }, wait);
    return () => clearTimeout(t);
  }, [state.status, state.arena, state.id, refresh]);

  // Natija: avval to'g'ri javob, bir necha soniyadan keyin reyting sahnasi
  useEffect(() => {
    if (state.status !== "reveal") return;
    const index = state.index;
    const t = setTimeout(() => setBoardFor(index), ANSWER_STEP_MS);
    return () => clearTimeout(t);
  }, [state.status, state.index]);
  const revealStep: "answer" | "board" = boardFor === state.index ? "board" : "answer";

  // Har rejimning o'z kuyi (tonallik, tezlik, tembr)
  useEffect(() => {
    liveMusic.setTheme(MODE_THEMES[state.mode]?.music ?? null);
  }, [state.mode]);

  // Fon musiqasi: holatga qarab kuy (g'oliblar musiqasini shohsupa o'zi boshqaradi)
  useEffect(() => {
    liveMusic.setEnabled(synthOn);
    if (!synthOn || state.status === "finished") return;
    // Kutish zalida — umumiy kutish kuyi (MP3), o'yin boshlangach — rejimning o'z kuyi
    if (state.status === "lobby") {
      liveMusic.play(null);
      return;
    }
    liveMusic.play(
      state.status === "question" || state.status === "arena" || (state.status === "minigame" && !state.minigame?.ended)
        ? "question"
        : "board"
    );
  }, [synthOn, state.status, state.minigame?.ended]);
  useEffect(() => {
    liveMusic.setBoost(state.status === "question" && remaining > 0 && remaining <= 5000);
  }, [remaining, state.status]);
  useEffect(() => () => liveMusic.stop(), []);

  const act = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    unlockSound();
    setBusy(true);
    try {
      const res = await fn();
      if (!res.success) toast.error(res.error ?? "Xatolik");
    } catch {
      toast.error("Internet aloqasi uzildi — qayta bosing");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  // Avto rejim: natija ko'rsatilgach sanoq, keyin keyingi savol (oxirgisida — g'oliblar)
  const actRef = useRef(act);
  useEffect(() => {
    actRef.current = act;
  });
  // Rejim introsi: proyektor va telefonlarda bir vaqtda; tugagach birinchi savol o'zi boshlanadi.
  // Taymerlar alohida saqlanadi: har soniyalik yangilanish ularni bekor qilmasin
  const introUntil = useRef<number | null>(null);
  const introTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [intro, setIntro] = useState<number | null>(null);
  const introOn = intro !== null;
  useEffect(() => {
    const timers = introTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    if (state.status !== "lobby" || state.introMs <= 0 || introUntil.current !== null) return;
    introUntil.current = Date.now() + state.introMs;
    const ms = state.introMs;
    introTimers.current.push(
      setTimeout(() => setIntro(ms), 0),
      setTimeout(() => {
        setIntro(null);
        void actRef.current(() => startLiveQuestionAction(state.id));
      }, ms)
    );
  }, [state.status, state.introMs, state.id]);

  // Avto rejim kaliti: natija ("r3") yoki tugagan qisqa o'yin ("m3")
  const autoKey =
    state.status === "reveal"
      ? `r${state.index}`
      : state.status === "minigame" && state.minigame?.ended
      ? `m${state.index}`
      : state.status === "arena" && state.arena?.ended
      ? `a${state.arena.round}`
      : null;
  useEffect(() => {
    if (!autoplay || !autoKey || autoFired.current === autoKey) return;
    const key = autoKey;
    // Oxirgi savoldan keyin: arena bo'lsa — arenaga, aks holda g'oliblar
    const last = key.startsWith("r") && state.index + 1 >= state.total && !state.arenaNext;
    const deadline = Date.now() + (key.startsWith("m") ? 6 : autoDelayFor(state.mode)) * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setAuto({ key, left });
      if (left > 0) return;
      clearInterval(id);
      autoFired.current = key;
      void actRef.current(() => (last ? finishLiveGameAction(state.id) : startLiveQuestionAction(state.id)));
    }, 250);
    return () => clearInterval(id);
  }, [autoplay, autoKey, state.index, state.total, state.mode, state.id, state.arenaNext]);
  const autoLeft = autoplay && autoKey && auto?.key === autoKey ? auto.left : null;

  // Qisqa o'yin vaqti tugasa — natija hisoblanadi (oxirgi natijalar yetib kelishi uchun biroz kutiladi)
  useEffect(() => {
    const m = state.minigame;
    if (state.status !== "minigame" || !m || m.ended || minigameEnding.current === m.round) return;
    // Tugash vaqti bir marta eslab qolinadi — har yangilanishda taymer qaytadan cho'zilmasin
    if (minigameEndsAt.current?.round !== m.round) minigameEndsAt.current = { round: m.round, at: Date.now() + m.startsInMs + m.remainingMs };
    const wait = Math.max(0, minigameEndsAt.current.at + 1500 - Date.now());
    const t = setTimeout(() => {
      minigameEnding.current = m.round;
      void endMinigameAction(state.id).then(
        () => refresh(),
        () => {
          if (minigameEnding.current === m.round) minigameEnding.current = null;
          void refresh();
        }
      );
    }, wait);
    return () => clearTimeout(t);
  }, [state.status, state.minigame, state.id, refresh]);

  const Icon = MODE_ICONS[state.mode];
  const isLast = state.index + 1 >= state.total;

  return (
    <ImmersiveFrame
      mode={state.mode}
      leading={
        <Link href="/mentor/live" className="inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Jonli o&apos;yinlar
        </Link>
      }
      toolbar={
        <>
          <button
            type="button"
            onClick={() => writeAuto(!autoplay)}
            aria-pressed={autoplay}
            title="Natijadan keyin keyingi savol o'zi boshlanadi"
            className={cn(
              "inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors",
              autoplay ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-white/10 text-slate-200 hover:bg-white/20"
            )}
          >
            <Repeat className="h-4 w-4" /> Avto {autoplay ? "yoqilgan" : "o'chiq"}
          </button>
          <button
            type="button"
            onClick={() => {
              unlockSound();
              setMusic((v) => !v);
            }}
            aria-pressed={music}
            title="Fon musiqasi"
            className={cn(
              "inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors",
              music ? "bg-fuchsia-500/80 text-white hover:bg-fuchsia-500" : "bg-white/10 text-slate-200 hover:bg-white/20"
            )}
          >
            <Music className="h-4 w-4" /> <span className="hidden sm:inline">Musiqa</span>
          </button>
          <button
            type="button"
            onClick={() => setMusicMenu((v) => !v)}
            title="Musiqani tanlash"
            aria-expanded={musicMenu}
            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-xl bg-white/10 px-2.5 text-slate-200 hover:bg-white/20"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          {musicMenu && <MusicMenu mode={state.mode} choice={choice} onClose={() => setMusicMenu(false)} />}
          <button
            type="button"
            onClick={() => setSound((v) => !v)}
            aria-pressed={sound}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold text-slate-200 hover:bg-white/20"
          >
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} <span className="hidden sm:inline">Ovoz</span>
          </button>
        </>
      }
    >
      <LiveShell className="min-h-[70vh]">
        {/* Jangda sarlavha yashiriladi — xaritaga ko'proq joy */}
        {state.status !== "arena" && (
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
        )}

        {state.status === "lobby" && (
          <Lobby state={state} busy={busy || introOn} onStart={() => {
              if (sound) playGameStart();
              void act(() => startLiveIntroAction(state.id));
            }} onCancel={() => act(() => cancelLiveGameAction(state.id))} />
        )}
        {state.status === "question" && state.question && (
          <QuestionView state={state} remaining={remaining} busy={busy} onReveal={() => act(() => revealLiveQuestionAction(state.id))} />
        )}
        {state.status === "reveal" && state.question && (
          <RevealView
            state={state}
            busy={busy}
            isLast={isLast}
            step={revealStep}
            sound={sound}
            onShowBoard={() => setBoardFor(state.index)}
            autoLeft={autoLeft}
            onStopAuto={() => writeAuto(false)}
            onNext={() => act(() => startLiveQuestionAction(state.id))}
            onFinish={() => act(() => finishLiveGameAction(state.id))}
          />
        )}
        {state.status === "minigame" && state.minigame && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <MinigameHost key={state.minigame.round} m={state.minigame} sound={sound} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
              {autoLeft !== null && (
                <Button variant="ghost" onClick={() => writeAuto(false)} className="gap-1.5 text-slate-300 hover:text-white">
                  <Pause className="h-4 w-4" /> Avtoni to&apos;xtatish
                </Button>
              )}
              <button
                type="button"
                onClick={() => act(() => startLiveQuestionAction(state.id))}
                disabled={busy}
                className="inline-flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl bg-white px-8 text-lg font-black text-slate-900 disabled:opacity-60"
              >
                {state.minigame.ended ? "Keyingi savol" : "O'tkazib yuborish"}
                {autoLeft !== null ? ` (${autoLeft})` : ""} <SkipForward className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
        {state.status === "arena" && state.arena && (
          <div className="flex min-h-0 flex-1 flex-col">
            <ArenaHost
              key={state.arena.round}
              gameId={state.id}
              arena={state.arena}
              sound={sound}
              actions={
                <>
                  {autoLeft !== null && (
                    <Button variant="ghost" onClick={() => writeAuto(false)} className="gap-1.5 text-slate-300 hover:text-white">
                      <Pause className="h-4 w-4" /> Avtoni to&apos;xtatish
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => act(() => startLiveQuestionAction(state.id))}
                    disabled={busy}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-amber-400 px-5 text-base font-black text-slate-900 disabled:opacity-60"
                  >
                    {state.arena.final ? (
                      <>
                        <Crown className="h-5 w-5" /> G&apos;oliblar
                      </>
                    ) : (
                      <>
                        Keyingi savol <SkipForward className="h-5 w-5" />
                      </>
                    )}
                    {autoLeft !== null ? ` (${autoLeft})` : ""}
                  </button>
                </>
              }
            />
          </div>
        )}
        {intro !== null && <ModeIntro mode={state.mode} ms={intro} sound={sound} />}
        {state.status === "finished" && <LivePodium state={state} sound={sound} music={synthOn} />}
      </LiveShell>
      {/* Kutish zali kuyi: o'quvchilar qo'shilayotganda; "Boshlash" bosilganda to'xtaydi */}
      <BackgroundTrack src={LOBBY_TRACK} playing={music && state.status === "lobby" && !introOn} volume={0.5} />
      {track && <BackgroundTrack src={track.src} playing={music && state.status !== "lobby"} volume={state.status === "finished" ? 0.35 : 0.55} />}
    </ImmersiveFrame>
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
      {state.bonus && (
        <p className="live-banner mx-auto w-fit rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-6 py-2 text-xl font-black text-slate-950">⚡ BONUS RAUND — ochko ×2</p>
      )}
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
        {isAdventure(state.mode) && <TacticTally state={state} />}
        <Button variant="secondary" onClick={onReveal} disabled={busy} className="gap-2">
          <SkipForward className="h-4 w-4" /> Natijani ko&apos;rsatish
        </Button>
      </div>
    </div>
  );
}

/** Proyektorda: qaysi taktikani nechta o'quvchi tanladi (sirli emas — natijada baribir ko'rinadi) */
function TacticTally({ state }: { state: LiveHostState }) {
  if (!isAdventure(state.mode)) return null;
  const list = TACTICS[state.mode];
  const count = (id: string) => state.players.filter((p) => p.tactic === id).length;
  const picked = state.players.filter((p) => p.tactic).length;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Taktikalar">
      <span className="text-sm font-bold text-slate-300">Taktika:</span>
      {list.map((t) => (
        <span key={t.id} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-black transition-colors", count(t.id) > 0 ? "bg-white/15" : "bg-white/5 text-white/40")}>
          <span>{t.icon}</span>
          <span className="font-mono">{count(t.id)}</span>
        </span>
      ))}
      {picked === 0 && <span className="text-xs text-slate-400">javob berganlar telefonda tanlaydi</span>}
    </div>
  );
}

function RevealView({
  state,
  busy,
  isLast,
  step,
  sound,
  onShowBoard,
  autoLeft,
  onStopAuto,
  onNext,
  onFinish,
}: {
  state: LiveHostState;
  busy: boolean;
  isLast: boolean;
  /** answer — to'g'ri javob va taqsimot, board — reyting sahnasi */
  step: "answer" | "board";
  sound: boolean;
  onShowBoard: () => void;
  /** Avto rejimda keyingi qadamgacha qolgan soniya */
  autoLeft: number | null;
  onStopAuto: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const q = state.question!;
  const max = Math.max(1, ...state.distribution.map((d) => d.count));
  return (
    <div className="space-y-5">
      {step === "board" ? (
        <>
          <p className="text-center text-sm font-black uppercase tracking-[0.35em] text-fuchsia-300">
            {state.mode === "team" ? "Jamoalar poygasi" : `${state.index + 1}-savoldan keyin reyting`}
          </p>
          {state.mode === "team" ? (
            <ModePanel state={state} />
          ) : isAdventure(state.mode) ? (
            <AdventureBoard key={state.index} state={state} />
          ) : (
            <LiveLeaderboard key={state.index} players={state.players} mode={state.mode} sound={sound} index={state.index} />
          )}
          {state.mode === "chest" && state.events.length > 0 && <ChestFeed events={state.events} />}
        </>
      ) : (
        <>
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
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {step === "answer" && (
          <Button variant="ghost" onClick={onShowBoard} className="gap-1.5 text-slate-300 hover:text-white">
            {isAdventure(state.mode) ? "Maydonni ko'rsatish" : "Reytingni ko'rsatish"}
          </Button>
        )}
        {autoLeft !== null && (
          <Button variant="ghost" onClick={onStopAuto} className="gap-1.5 text-slate-300 hover:text-white">
            <Pause className="h-4 w-4" /> Avtoni to&apos;xtatish
          </Button>
        )}
        {state.arenaRoundNext ? (
          <button type="button" onClick={onNext} disabled={busy} className="inline-flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-600 px-8 text-lg font-black text-white disabled:opacity-60">
            <Swords className="h-5 w-5" /> Jangga!{autoLeft !== null ? ` (${autoLeft})` : ""}
          </button>
        ) : isLast && state.arenaNext ? (
          <button type="button" onClick={onNext} disabled={busy} className="inline-flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-600 px-8 text-lg font-black text-white disabled:opacity-60">
            <Swords className="h-5 w-5" /> Arenaga o&apos;tish{autoLeft !== null ? ` (${autoLeft})` : ""}
          </button>
        ) : isLast ? (
          <button type="button" onClick={onFinish} disabled={busy} className="inline-flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl bg-amber-400 px-8 text-lg font-black text-slate-900 disabled:opacity-60">
            <Crown className="h-5 w-5" /> G&apos;oliblarni ko&apos;rsatish{autoLeft !== null ? ` (${autoLeft})` : ""}
          </button>
        ) : (
          <button type="button" onClick={onNext} disabled={busy} className="inline-flex min-h-[56px] cursor-pointer items-center gap-2 rounded-2xl bg-white px-8 text-lg font-black text-slate-900 disabled:opacity-60">
            Keyingi savol{autoLeft !== null ? ` (${autoLeft})` : ""} <SkipForward className="h-5 w-5" />
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

function ChestFeed({ events }: { events: LiveHostState["events"] }) {
  return (
    <ul className="mx-auto grid max-w-3xl gap-1.5 sm:grid-cols-2">
      {events.slice(0, 4).map((e, i) => (
        <li key={i} className="quiz-pop rounded-xl bg-amber-400/15 px-3 py-2 text-sm font-bold text-amber-100" style={{ animationDelay: `${1.4 + i * 0.15}s` }}>
          {e.text}
        </li>
      ))}
    </ul>
  );
}

/** Musiqa tanlash: shu o'yin turi uchun tayyor kuy yoki o'yinning original kuylari */
function MusicMenu({ mode, choice, onClose }: { mode: LiveHostState["mode"]; choice: MusicChoice; onClose: () => void }) {
  const options: { id: MusicChoice; title: string; hint: string }[] = [
    ...(Object.entries(MUSIC_TRACKS) as [MusicChoice, { title: string }][]).map(([id, t]) => ({ id, title: t.title, hint: "Tayyor fon kuyi, takrorlanib chalinadi" })),
    { id: "synth", title: "Original kuylar", hint: "Holatga qarab o'zgaradi: kutish, savol, reyting, g'alaba" },
  ];
  return (
    <div className="absolute right-3 top-14 z-20 w-[min(92vw,340px)] space-y-2 rounded-2xl bg-slate-900 p-3 text-left shadow-2xl ring-1 ring-white/15 sm:right-6">
      <p className="px-1 text-sm font-black">{LIVE_MODES[mode].title} uchun musiqa</p>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => {
            setMusicChoice(mode, o.id);
            onClose();
          }}
          aria-pressed={choice === o.id}
          className={cn(
            "flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
            choice === o.id ? "bg-fuchsia-500/25 ring-1 ring-fuchsia-400" : "hover:bg-white/10"
          )}
        >
          <Music className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="block text-sm font-bold">{o.title}</span>
            <span className="block text-[11px] text-slate-400">{o.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
