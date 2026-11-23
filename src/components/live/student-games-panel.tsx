"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, Gamepad2, Settings2, Square, Users } from "lucide-react";
import Link from "@/components/ui/link";
import { Toggle } from "@/components/ui/toggle";
import { Pager } from "@/components/ui/pager";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { getStudentGamesForMentorAction, startStudentGameByMentorAction, stopStudentGameAction, type StudentGameMonitorItem } from "@/actions/live-game.actions";
import { updateStudentGamesSettingsAction } from "@/actions/settings.actions";
import { LIVE_MODES } from "@/lib/live-game/modes";
import { LIVE_GAME_MODES, type LiveGameMode } from "@/lib/live-game/mode-list";
import { MIN_DISCOUNTED_PRICE, MIN_STUDENT_GAME_PRICE, isFreeNow, type StudentGamesSettings } from "@/lib/live-game/student-games-config";
import { dateFromKey, fromTashkentInputValue, toDateKey, toTashkentInputValue } from "@/lib/schedule";
import { cn, formatDateTimeUz } from "@/lib/utils";
import { MODE_COLORS, MODE_ICONS } from "./live-games-manager";
import { GoldCoin } from "@/components/ui/gold-coin";

// Mentor: o'quvchilar yaratadigan jonli o'yinlar — sozlamalar va kuzatuv (kim yaratdi, kimlar o'ynayapti, qaysi bosqichda)

const STATUS: Record<string, { label: string; tone: string }> = {
  lobby: { label: "Kutish zali", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  question: { label: "Savol", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  reveal: { label: "Natija", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" },
  minigame: { label: "Mini o'yin", tone: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300" },
  arena: { label: "Arena", tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300" },
  galaxy: { label: "3D poyga", tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300" },
  zone: { label: "Yashil zona", tone: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300" },
  finished: { label: "Tugagan", tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

export function StudentGamesPanel({ initialSettings, initialGames }: { initialSettings: StudentGamesSettings; initialGames: StudentGameMonitorItem[] }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(initialSettings);
  const [games, setGames] = useState(initialGames);
  const [saving, startSave] = useTransition();
  const [stop, setStop] = useState<{ game: StudentGameMonitorItem; refund: boolean } | null>(null);
  const [stopping, setStopping] = useState(false);
  // Tayyor o'yinni mentor boshlaydi
  const startGame = (id: string) =>
    startSave(async () => {
      const r = await startStudentGameByMentorAction(id);
      if (!r.success) toast.error(r.error);
      else toast.success("O'yin boshlandi");
      const fresh = await getStudentGamesForMentorAction();
      if (fresh.success) setGames(fresh.data);
    });
  const [showSettings, setShowSettings] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  // Kuzatuv: har 5 soniyada (yashirin tabda — yo'q)
  useEffect(() => {
    const tick = () => {
      setNowMs(Date.now());
      if (document.visibilityState !== "visible") return;
      void getStudentGamesForMentorAction()
        .then((r) => r.success && setGames(r.data))
        .catch(() => {});
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const save = () =>
    startSave(async () => {
      const r = await updateStudentGamesSettingsAction(settings);
      if (r.success) toast.success(r.message ?? "Saqlandi");
      else toast.error(r.message ?? "Saqlab bo'lmadi");
    });

  const setPrice = (m: LiveGameMode, v: string) => setSettings((s) => ({ ...s, prices: { ...s.prices, [m]: v === "" ? 0 : Math.max(0, Math.round(Number(v) || 0)) } }));

  const active = games.filter((g) => g.status !== "finished");
  const recent = games.filter((g) => g.status === "finished");
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(recent.length / 5));
  const current = Math.min(page, pages);

  return (
    <section className="space-y-4 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-4 sm:p-5 dark:border-violet-500/20 dark:from-violet-500/5 dark:to-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-slate-100">
            <Gamepad2 className="h-5 w-5 text-violet-600" /> O&apos;quvchilar yaratgan o&apos;yinlar
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            O&apos;quvchilar guruhi yoki butun sinfi uchun o&apos;yin ochadi, narxini qatnashchilar birgalikda coin qo&apos;shib yig&apos;adi — to&apos;lgach o&apos;yin o&apos;zi
            boshlanadi. G&apos;oliblarga siz belgilagan coin beriladi, o&apos;yinni server o&apos;zi boshqaradi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-3 py-1 text-xs font-black", settings.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>
            {settings.enabled ? "Yoqilgan" : "O'chirilgan"}
          </span>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
          >
            <Settings2 className="h-4 w-4" /> Sozlamalar
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <div className="grid gap-3 sm:grid-cols-3">
            <Toggle checked={settings.enabled} onChange={(v) => setSettings((s) => ({ ...s, enabled: v }))} label="O'quvchilar o'yin yarata oladi" />
            <Toggle checked={settings.blockDuringLessons} onChange={(v) => setSettings((s) => ({ ...s, blockDuringLessons: v }))} label="Dars vaqtida taqiqlash" />
            <Toggle checked={settings.allowGrade} onChange={(v) => setSettings((s) => ({ ...s, allowGrade: v }))} label="Butun sinf uchun ruxsat" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Bir o&apos;quvchi kuniga nechta o&apos;yin yarata oladi
              <input
                type="number"
                min={1}
                max={20}
                value={settings.dailyLimit}
                onChange={(e) => setSettings((s) => ({ ...s, dailyLimit: Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))) }))}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-500/5 dark:ring-amber-500/20">
            <p className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-200">🏆 G&apos;oliblar sovrini (coin)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(["1-o'rin", "2-o'rin", "3-o'rin"] as const).map((label, i) => (
                <label key={label} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={settings.prizes[i]}
                    onChange={(e) =>
                      setSettings((s) => {
                        const prizes = [...s.prizes] as [number, number, number];
                        prizes[i] = Math.min(500, Math.max(0, Math.round(Number(e.target.value) || 0)));
                        return { ...s, prizes };
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              ))}
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Jamoaviy: g&apos;olib jamoaning har biriga
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={settings.teamPrize}
                  onChange={(e) => setSettings((s) => ({ ...s, teamPrize: Math.min(500, Math.max(0, Math.round(Number(e.target.value) || 0))) }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sovrin uchun kamida o&apos;yinchi
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.minPlayersForPrizes}
                  onChange={(e) => setSettings((s) => ({ ...s, minPlayersForPrizes: Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1))) }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            </div>
          </div>
          {/* Skidka va bepul davr */}
          <div className="space-y-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200 dark:bg-emerald-500/5 dark:ring-emerald-500/20">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                🏷️ Skidka: har bir o&apos;yin necha coin arzon (0 — skidka yo&apos;q)
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={settings.discount}
                  onChange={(e) => setSettings((s) => ({ ...s, discount: Math.min(500, Math.max(0, Math.round(Number(e.target.value) || 0))) }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-500">Narx {MIN_DISCOUNTED_PRICE} coindan kam bo&apos;lmaydi. Masalan, klassik: {settings.prices.classic} → {Math.max(MIN_DISCOUNTED_PRICE, settings.prices.classic - settings.discount)}</span>
              </label>
              <div className="flex items-end">
                <Toggle checked={settings.freePrizes} onChange={(v) => setSettings((s) => ({ ...s, freePrizes: v }))} label="Bepul o'yinlarda ham g'oliblarga coin" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                🎁 Bepul davr — shu vaqt ichida o&apos;quvchilar coin to&apos;lamasdan o&apos;yin ochadi{" "}
                {nowMs > 0 && isFreeNow(settings, nowMs) ? (
                  <span className="ml-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-black text-white">hozir faol</span>
                ) : nowMs > 0 && settings.freeUntil && Date.parse(settings.freeUntil) > nowMs ? (
                  <span className="ml-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-black text-slate-900">rejalashtirilgan</span>
                ) : null}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Boshlanishi
                  <input
                    type="datetime-local"
                    value={settings.freeFrom ? toTashkentInputValue(settings.freeFrom) : ""}
                    onChange={(e) => setSettings((s) => ({ ...s, freeFrom: fromTashkentInputValue(e.target.value)?.toISOString() ?? null }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Tugashi
                  <input
                    type="datetime-local"
                    value={settings.freeUntil ? toTashkentInputValue(settings.freeUntil) : ""}
                    onChange={(e) => setSettings((s) => ({ ...s, freeUntil: fromTashkentInputValue(e.target.value)?.toISOString() ?? null }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: "1 soat", ms: 3_600_000 },
                  { label: "Bugun kechgacha", ms: null },
                  { label: "3 kun", ms: 3 * 86_400_000 },
                  { label: "1 hafta", ms: 7 * 86_400_000 },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={(ev) => {
                      const now = performance.timeOrigin + ev.timeStamp;
                      const until = b.ms === null ? dateFromKey(toDateKey(now), "23:59").getTime() : now + b.ms;
                      setSettings((s) => ({ ...s, freeFrom: new Date(now).toISOString(), freeUntil: new Date(until).toISOString() }));
                    }}
                    className="cursor-pointer rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-50 dark:bg-slate-900 dark:text-emerald-300"
                  >
                    {b.label}
                  </button>
                ))}
                {(settings.freeFrom || settings.freeUntil) && (
                  <button
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, freeFrom: null, freeUntil: null }))}
                    className="cursor-pointer rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-rose-600 ring-1 ring-rose-300 hover:bg-rose-50 dark:bg-slate-900"
                  >
                    Bepul davrni to&apos;xtatish
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">O&apos;zgarish «Saqlash» bosilgandan keyin kuchga kiradi.</p>
            </div>
          </div>
          <div className="grid gap-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200 sm:grid-cols-2 dark:bg-sky-500/5 dark:ring-sky-500/20">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              👥 O&apos;yin boshlanishi uchun kamida nechta o&apos;yinchi
              <input
                type="number"
                min={2}
                max={50}
                value={settings.minPlayersToStart}
                onChange={(e) => setSettings((s) => ({ ...s, minPlayersToStart: Math.min(50, Math.max(2, Math.round(Number(e.target.value) || 2))) }))}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              ⏱️ Tayyor o&apos;yin: necha daqiqa yangi o&apos;yinchi qo&apos;shilmasa o&apos;zi boshlansin
              <input
                type="number"
                min={1}
                max={30}
                value={settings.autoStartMin}
                onChange={(e) => setSettings((s) => ({ ...s, autoStartMin: Math.min(30, Math.max(1, Math.round(Number(e.target.value) || 1))) }))}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <p className="text-[11px] text-slate-500 sm:col-span-2">
              Tayyor o&apos;yinni (coin yig&apos;ilgan va o&apos;yinchilar yetarli) o&apos;yin egasi yoki siz «Boshlash» bilan boshlaysiz. Yangi o&apos;yinlarga qo&apos;llanadi.
            </p>
          </div>
          <div className="grid gap-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200 sm:grid-cols-2 dark:bg-rose-500/5 dark:ring-rose-500/20">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Darsni sababsiz qoldirsa — jonli o&apos;yin necha kun yopiq (0 — cheklov yo&apos;q)
              <input
                type="number"
                min={0}
                max={14}
                value={settings.absenceBanDays}
                onChange={(e) => setSettings((s) => ({ ...s, absenceBanDays: Math.min(14, Math.max(0, Math.round(Number(e.target.value) || 0))) }))}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <div className="flex items-end">
              <Toggle
                checked={settings.absenceBanAllGames}
                onChange={(v) => setSettings((s) => ({ ...s, absenceBanAllGames: v }))}
                label="Mentor o'yinlariga ham (aks holda faqat o'quvchilar o'yiniga)"
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-200">
              O&apos;yin turlari narxi (coin). Kamida {MIN_STUDENT_GAME_PRICE}; 0 — bu tur o&apos;quvchilarga yopiq
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {LIVE_GAME_MODES.map((m) => {
                const Icon = MODE_ICONS[m];
                const off = !settings.prices[m];
                return (
                  <label key={m} className={cn("flex items-center gap-2 rounded-xl px-2.5 py-2 ring-1", off ? "bg-slate-50 opacity-70 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800" : "bg-white ring-slate-200 dark:bg-slate-950 dark:ring-slate-700")}>
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white", MODE_COLORS[m])}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800 dark:text-slate-200">{LIVE_MODES[m].title}</span>
                    <input
                      type="number"
                      min={0}
                      value={settings.prices[m] || ""}
                      placeholder="yopiq"
                      onChange={(e) => setPrice(m, e.target.value)}
                      className="w-16 rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-right font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="w-full cursor-pointer rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white shadow hover:bg-violet-500 disabled:opacity-60 sm:w-auto sm:px-6"
          >
            {saving ? "Saqlanmoqda…" : "Saqlash"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-black text-slate-800 dark:text-slate-200">Hozir ketayotgan o&apos;yinlar ({active.length})</p>
        {active.length === 0 && <p className="rounded-xl bg-white/70 px-3 py-3 text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900/50 dark:ring-slate-800">Hozir o&apos;quvchilar o&apos;yini yo&apos;q</p>}
        {active.map((g) => (
          <GameRow key={g.id} g={g} onStop={(refund) => setStop({ game: g, refund })} onStart={() => startGame(g.id)} />
        ))}
      </div>

      {recent.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-bold text-slate-600 dark:text-slate-400">Oxirgi o&apos;yinlar ({recent.length})</summary>
          <div className="mt-2 space-y-2">
            {recent.slice((current - 1) * 5, current * 5).map((g) => (
              <GameRow key={g.id} g={g} />
            ))}
            <Pager page={current} total={pages} onPage={setPage} />
          </div>
        </details>
      )}

      <ConfirmDialog
        isOpen={stop !== null}
        onClose={() => setStop(null)}
        isLoading={stopping}
        danger
        title="O'yinni to'xtatish"
        description={
          stop
            ? `${stop.game.creatorName} yaratgan «${LIVE_MODES[stop.game.mode].title}» o'yini to'xtatiladi.${stop.refund ? ` Yig'ilgan ${stop.game.paid} coin har bir qatnashchiga (kim qancha qo'shgan bo'lsa) qaytariladi.` : " Coin qaytarilmaydi."}`
            : ""
        }
        confirmText="To'xtatish"
        onConfirm={async () => {
          if (!stop) return;
          setStopping(true);
          try {
            const r = await stopStudentGameAction(stop.game.id, stop.refund);
            if (!r.success) toast.error(r.error);
            else toast.success("O'yin to'xtatildi");
            const fresh = await getStudentGamesForMentorAction();
            if (fresh.success) setGames(fresh.data);
          } finally {
            setStopping(false);
            setStop(null);
          }
        }}
      />
    </section>
  );
}

function GameRow({ g, onStop, onStart }: { g: StudentGameMonitorItem; onStop?: (refund: boolean) => void; onStart?: () => void }) {
  const Icon = MODE_ICONS[g.mode];
  const st = STATUS[g.status] ?? STATUS.finished;
  const step = g.status === "lobby" ? null : g.status === "finished" ? null : `${Math.max(1, g.index + 1)}/${g.total}`;
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", MODE_COLORS[g.mode])}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">
            {LIVE_MODES[g.mode].title} <span className="font-semibold text-slate-500">· {g.creatorName}</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {g.audience} ({g.groupName}) · yig&apos;ildi {g.paid}/{g.price} coin{g.refunded ? " (qaytarilgan)" : ""} · {formatDateTimeUz(g.createdAt)}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", st.tone)}>
          {g.status === "lobby"
            ? g.starting
              ? "Boshlanmoqda…"
              : g.ready
              ? `Tayyor · ${g.players.length} o'yinchi`
              : g.price > 0 && g.paid < g.price
                ? `Coin yig'ilmoqda ${g.paid}/${g.price}`
                : `O'yinchi kutilmoqda ${g.players.length}/${g.needPlayers}`
            : st.label}
          {step ? ` ${step}` : ""}
        </span>
        {g.status !== "finished" && (
          <Link
            href={`/mentor/live/${g.id}`}
            className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-500"
          >
            <Eye className="h-3.5 w-3.5" /> Kuzatish
          </Link>
        )}
        {onStart && g.ready && (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-500"
          >
            ▶ Boshlash
          </button>
        )}
        {onStop && (
          <>
            <button
              type="button"
              onClick={() => onStop(g.status === "lobby")}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
            >
              <Square className="h-3.5 w-3.5" /> To&apos;xtatish
            </button>
            {g.status !== "lobby" && !g.refunded && (
              <button
                type="button"
                onClick={() => onStop(true)}
                className="cursor-pointer rounded-xl px-2 py-1.5 text-xs font-bold text-slate-500 underline-offset-2 hover:underline"
              >
                to&apos;xtatib coinni qaytarish
              </button>
            )}
          </>
        )}
      </div>
      {g.contributors.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-amber-700 dark:text-amber-300"><GoldCoin /> Hissa:</span>
          {g.contributors.map((c, i) => (
            <span key={`${c.name}-${i}`} className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {c.name} <b className="font-mono">{c.amount}</b>
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-slate-400" />
        {g.players.length === 0 && <span className="text-xs text-slate-400">Hali hech kim qo&apos;shilmagan</span>}
        {g.players.map((p, i) => (
          <span
            key={`${p.name}-${i}`}
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              p.out ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800" : "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300"
            )}
          >
            {p.name}
            {g.status !== "lobby" && <b className="ml-1 font-mono">{p.score}</b>}
          </span>
        ))}
      </div>
    </div>
  );
}
