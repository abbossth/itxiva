"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Gamepad2, Users } from "lucide-react";
import Link from "@/components/ui/link";
import { createStudentGameAction, type PlayableGame, type StudentGameSetup } from "@/actions/live-game.actions";
import { LIVE_MODES } from "@/lib/live-game/modes";
import { LIVE_GAME_MODES, type LiveGameMode } from "@/lib/live-game/mode-list";
import type { StudentGameAudience } from "@/lib/live-game/student-games-config";
import { haptic } from "@/lib/haptics";
import { playRankUp, unlockSound } from "@/lib/sound";
import { cn, formatDateTimeUz, formatNumberUz } from "@/lib/utils";
import { MODE_COLORS, MODE_ICONS } from "./live-games-manager";
import { PrizeLine } from "./student-fund";
import { GoldCoin } from "@/components/ui/gold-coin";

// O'quvchi: jonli o'yinlar markazi — qo'shilish mumkin bo'lgan o'yinlar va o'z o'yinini ochish (narx birgalikda yig'iladi)

const STATUS_TEXT: Record<string, string> = {
  lobby: "Kutish zali",
  question: "Ketmoqda",
  reveal: "Ketmoqda",
  minigame: "Mini o'yin",
  arena: "Jang",
  galaxy: "Poyga",
  zone: "Yashil zona",
};

const nonce = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function StudentGamesHub({ setup, games }: { setup: StudentGameSetup | null; games: PlayableGame[] }) {
  const router = useRouter();
  // Ochiq turlar — to'liq narx bo'yicha (bepul davrda yig'iladigan narx 0 bo'ladi)
  const open = LIVE_GAME_MODES.filter((m) => setup?.fullPrices[m]);
  const free = Boolean(setup?.freeUntil);
  const [mode, setMode] = useState<LiveGameMode | null>(open[0] ?? null);
  const [audience, setAudience] = useState<StudentGameAudience>("group");
  const [count, setCount] = useState(10);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const extra = audience === "grade" ? setup?.gradeExtra ?? 0 : 0;
  const price = free || !mode || setup?.prices[mode] == null ? 0 : setup.prices[mode]! + extra;
  const fullPrice = mode && setup?.fullPrices[mode] ? setup.fullPrices[mode]! + extra : 0;
  const [firstRaw, setFirst] = useState(5);
  const first = Math.max(1, Math.min(price || 1, firstRaw, setup?.balance ?? 0));

  const create = () =>
    start(async () => {
      if (!mode) return;
      unlockSound();
      setError(null);
      const r = await createStudentGameAction({ mode, audience, count, first: free ? 0 : first, nonce: nonce() });
      if (!r.success) {
        setError(r.error);
        return;
      }
      playRankUp();
      haptic([20, 40, 20]);
      router.push(`/live/${r.data.gameId}`);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900 dark:text-slate-100 sm:text-3xl">
          <Gamepad2 className="h-7 w-7 text-violet-600" /> Jonli o&apos;yinlar
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Do&apos;stlaringiz bilan o&apos;ynang: o&apos;yin oching, narxini birgalikda coin qo&apos;shib yig&apos;ing — to&apos;lgach o&apos;yin o&apos;zi boshlanadi.
        </p>
      </div>

      {/* Hozir qo'shilish mumkin bo'lgan o'yinlar */}
      <section className="space-y-2">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Hozir ketayotgan o&apos;yinlar</h2>
        {games.length === 0 && (
          <p className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            Hozir ochiq o&apos;yin yo&apos;q — pastda o&apos;zingiz oching!
          </p>
        )}
        {games.map((g) => {
          const Icon = MODE_ICONS[g.mode];
          return (
            <Link
              key={g.id}
              href={`/live/${g.id}`}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 dark:ring-slate-800"
            >
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow", MODE_COLORS[g.mode])}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-black text-slate-900 dark:text-slate-100">{LIVE_MODES[g.mode].title}</span>
                <span className="block truncate text-xs text-slate-500">
                  {g.studentGame ? `${g.mine ? "Sizning o'yiningiz" : `${g.creatorName} o'yini`} · ${g.audience}` : "Mentor o'yini"} · {STATUS_TEXT[g.status] ?? g.status}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
                <Users className="h-3.5 w-3.5" /> {g.players}
              </span>
              <span className={cn("rounded-xl px-3 py-1.5 text-sm font-black", g.joined ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" : "bg-violet-600 text-white")}>
                {g.joined ? "Ochish" : "Qo'shilish"}
              </span>
            </Link>
          );
        })}
      </section>

      {/* O'yin ochish */}
      {setup && (
        <section className="space-y-4 rounded-3xl bg-gradient-to-b from-violet-600 to-fuchsia-700 p-4 text-white shadow-xl sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black">🎮 O&apos;z o&apos;yiningizni oching</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-3 py-1 text-sm font-bold">
              <Coins className="h-4 w-4 text-amber-300" /> {formatNumberUz(setup.balance)}
            </span>
          </div>

          {!setup.enabled ? (
            <p className="rounded-2xl bg-black/25 px-4 py-3 text-sm font-semibold">Mentor hozircha o&apos;quvchilar o&apos;yinini o&apos;chirib qo&apos;ygan.</p>
          ) : setup.myActive ? (
            <Link href={`/live/${setup.myActive}`} className="block rounded-2xl bg-white/15 px-4 py-3 text-center font-black hover:bg-white/25">
              Sizning o&apos;yiningiz davom etmoqda — ochish →
            </Link>
          ) : (
            <>
              {setup.blocked && <p className="rounded-2xl bg-rose-500/30 px-4 py-3 text-sm font-bold ring-1 ring-rose-200/40">⛔ {setup.blocked}</p>}
              {setup.questions === 0 && <p className="rounded-2xl bg-black/25 px-4 py-3 text-sm">Guruhingiz darslarida hali test savollari yo&apos;q.</p>}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {open.map((m) => {
                  const Icon = MODE_ICONS[m];
                  const on = m === mode;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-2xl p-2.5 text-left transition",
                        on ? "bg-white text-slate-900 shadow-lg ring-2 ring-amber-300" : "bg-white/10 hover:bg-white/20"
                      )}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", MODE_COLORS[m])}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">{LIVE_MODES[m].title}</span>
                        <span className={cn("text-xs font-bold", on ? "text-amber-600" : "text-amber-200")}>
                          {free ? (
                            <span className={on ? "text-emerald-600" : "text-emerald-300"}>Bepul</span>
                          ) : (
                            <>
                              <GoldCoin /> {setup.prices[m]}
                              {setup.discount > 0 && setup.fullPrices[m] !== setup.prices[m] && <s className="ml-1 opacity-60">{setup.fullPrices[m]}</s>}
                            </>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {mode && <p className="text-xs text-white/80">{LIVE_MODES[mode].tagline}</p>}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-white/70">Kimlar uchun</p>
                  <div className="flex gap-1.5 rounded-2xl bg-black/20 p-1">
                    <button
                      type="button"
                      onClick={() => setAudience("group")}
                      className={cn("flex-1 cursor-pointer rounded-xl px-3 py-2 text-sm font-black", audience === "group" ? "bg-white text-slate-900" : "text-white/80")}
                    >
                      Guruhim
                    </button>
                    {setup.allowGrade && setup.grade !== null && (
                      <button
                        type="button"
                        onClick={() => setAudience("grade")}
                        className={cn("flex-1 cursor-pointer rounded-xl px-3 py-2 text-sm font-black", audience === "grade" ? "bg-white text-slate-900" : "text-white/80")}
                      >
                        Barcha {setup.grade}-sinflar{setup.gradeExtra > 0 ? ` (+${setup.gradeExtra})` : ""}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-white/70">Savollar soni</p>
                  <div className="flex gap-1.5 rounded-2xl bg-black/20 p-1">
                    {setup.counts.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCount(c)}
                        className={cn("flex-1 cursor-pointer rounded-xl px-3 py-2 text-sm font-black", count === c ? "bg-white text-slate-900" : "text-white/80")}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {mode && free && (
                <div className="rounded-2xl bg-emerald-400/20 p-3 ring-1 ring-emerald-300/40">
                  <p className="text-sm font-black text-emerald-100">🎁 Bepul davr! Coin kerak emas — o&apos;yinni oching, do&apos;stlaringiz qo&apos;shilgach o&apos;zingiz boshlaysiz.</p>
                  <p className="mt-1 text-[11px] text-white/70">
                    {formatDateTimeUz(setup.freeUntil!)} gacha{!setup.freePrizes ? " · bepul o'yinlarda sovrin yo'q" : ""}
                  </p>
                </div>
              )}

              {mode && !free && (
                <div className="rounded-2xl bg-black/20 p-3">
                  <p className="text-sm font-bold">
                    O&apos;yin narxi: <b className="text-amber-300"><GoldCoin /> {price}</b>
                    {fullPrice > price && (
                      <>
                        {" "}
                        <s className="text-white/50">{fullPrice}</s> <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black">SKIDKA −{fullPrice - price}</span>
                      </>
                    )}{" "}
                    — siz boshlab berasiz, qolganini qatnashchilar qo&apos;shadi
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs font-bold text-white/70">Sizning hissangiz:</span>
                    <input
                      type="range"
                      min={1}
                      max={Math.max(1, Math.min(price, setup.balance))}
                      value={first}
                      onChange={(e) => setFirst(Number(e.target.value))}
                      className="flex-1 accent-amber-300"
                      aria-label="Birinchi hissa"
                    />
                    <span className="w-16 rounded-xl bg-white px-2 py-1 text-center font-mono font-black text-slate-900">{first}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/60">O&apos;yin boshlanmasa (20 daqiqada coin yig&apos;ilmasa yoki bekor qilinsa) — hamma coin qaytariladi.</p>
                </div>
              )}

              {mode && (!free || setup.freePrizes) && <PrizeLine prizes={mode === "team" ? [setup.teamPrize] : setup.prizes} team={mode === "team"} minPlayers={setup.minPlayers} light />}
              {error && <p className="rounded-xl bg-rose-500/30 px-3 py-2 text-sm font-bold">{error}</p>}
              <button
                type="button"
                disabled={pending || !mode || Boolean(setup.blocked) || setup.questions === 0 || (!free && setup.balance < 1)}
                onClick={create}
                className="w-full cursor-pointer rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 py-3.5 text-base font-black text-slate-900 shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Ochilmoqda…" : free ? "O'yinni ochish · bepul" : `O'yinni ochish · ${first} coin qo'shaman`}
              </button>
              <p className="text-center text-[11px] text-white/70">
                Bugun: {setup.createdToday}/{setup.dailyLimit} ta o&apos;yin · Dars vaqtida va darsni sababsiz qoldirgandan keyin o&apos;yinlar yopiq bo&apos;lishi
                mumkin
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
