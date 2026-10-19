"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronRight, Clock, Flame, LogIn, Send, ShieldCheck, Sparkles, Target, UserRoundCheck, Zap } from "lucide-react";
import type { MilestoneView, StudentQuestCard, StudentQuestsData } from "@/actions/student-quest.actions";
import type { OneTimeTask } from "@/lib/onboarding-rewards";
import { TIER_LABEL } from "@/lib/gamification/badges";
import { BadgeMedal } from "@/components/gamification/badge-medal";
import { LevelBadge, XpBar } from "@/components/gamification/level-badge";
import { LevelRevealTrigger } from "@/components/gamification/level-reveal";
import { DIFFICULTY_LABEL, REPEAT_LABEL, VERIFY_LABEL, VERIFY_TONE, rewardLabel } from "@/lib/gamification/labels";
import { cn, formatNumberUz, formatTimeUz } from "@/lib/utils";

type Tab = "all" | "active" | "pending" | "done";

const DIFFICULTY_DOT = { easy: "bg-emerald-500", medium: "bg-amber-500", hard: "bg-rose-500" } as const;

function timeLeft(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "muddat tugadi";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d} kun ${h % 24} soat qoldi` : `${Math.max(1, h)} soat qoldi`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const months = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

function matches(card: StudentQuestCard, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "pending") return card.pendingCount > 0;
  if (tab === "done") return card.state === "done";
  return card.state === "available" || card.state === "rejected";
}

const DAILY_ICON = { tests_today: Target, materials: BookOpen, login: LogIn } as const;

function DailyCard({ card }: { card: StudentQuestCard }) {
  const q = card.quest;
  const done = card.state === "done";
  const Icon = DAILY_ICON[q.autoRule?.kind as keyof typeof DAILY_ICON] ?? Zap;
  const xp = q.reward.xp ?? q.reward.coinsMin;
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 space-y-3",
        done ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", done ? "bg-emerald-500/15 text-emerald-600" : "bg-teal-500/10 text-teal-600 dark:text-teal-400")}>
          {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <span className="rounded-lg bg-amber-500/10 px-2 py-1 font-mono text-xs font-bold text-amber-700 dark:text-amber-400">
          +{q.reward.coinsMin}
          {xp !== q.reward.coinsMin ? ` · ${xp} XP` : ""}
        </span>
      </div>
      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{q.title}</div>
      {done ? (
        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          Bajarildi{card.doneAt ? ` · ${formatTimeUz(card.doneAt)}` : ""}
        </div>
      ) : card.progress ? (
        <div className="flex items-center gap-3">
          <XpBar percent={Math.round((card.progress.current / card.progress.target) * 100)} className="flex-1" />
          <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {card.progress.current}/{card.progress.target}
          </span>
        </div>
      ) : null}
    </div>
  );
}

const ONE_TIME_ICON = { profile: UserRoundCheck, telegram: Send } as const;

/** Bir martalik topshiriq: profilni to'ldirish yoki Telegram'ni ulash — bajarilguncha Sozlamalarga olib boradi */
function OneTimeCard({ task }: { task: OneTimeTask }) {
  const Icon = ONE_TIME_ICON[task.id];
  const percent = task.progress ? Math.round((task.progress.current / task.progress.target) * 100) : null;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl",
            task.done ? "bg-emerald-500/15 text-emerald-600" : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
          )}
        >
          {task.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <span className="rounded-lg bg-amber-500/10 px-2 py-1 font-mono text-xs font-bold text-amber-700 dark:text-amber-400">+{task.coins} coin</span>
      </div>
      <div>
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{task.title}</div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
      </div>
      {task.done ? (
        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Bajarildi · coin olingan</div>
      ) : (
        <div className="flex items-center gap-3">
          {percent !== null ? (
            <>
              <XpBar percent={percent} className="flex-1" />
              <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">{percent}%</span>
            </>
          ) : (
            <span className="flex-1" />
          )}
          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-teal-700 dark:text-teal-400">
            {task.id === "telegram" ? "Ulash" : "To'ldirish"}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      )}
    </>
  );
  const box = "rounded-2xl border p-4 space-y-3 block";
  return task.done ? (
    <div className={cn(box, "border-emerald-500/30 bg-emerald-500/5")}>{body}</div>
  ) : (
    <Link
      href={task.href}
      className={cn(
        box,
        "border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface transition-colors hover:border-teal-500/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500"
      )}
    >
      {body}
    </Link>
  );
}

function stateBadge(card: StudentQuestCard) {
  if (card.state === "done") return <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Bajarildi</span>;
  if (card.pendingCount > 0)
    return <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">{card.pendingCount} ta tekshiruvda</span>;
  if (card.state === "rejected") return <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">Rad etildi</span>;
  if (card.state === "limit") return <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">Oylik limit</span>;
  return null;
}

function footerHint(card: StudentQuestCard): string {
  const q = card.quest;
  if (q.guard.monthlyLimit) return `shu oy ${card.monthUsed}/${q.guard.monthlyLimit}`;
  if (q.reward.coinsMin !== q.reward.coinsMax) return "kurs hajmiga qarab";
  if (q.endsAt) return `${shortDate(q.endsAt)} gacha`;
  return REPEAT_LABEL[q.repeat].toLowerCase();
}

function MainCard({ card }: { card: StudentQuestCard }) {
  const q = card.quest;
  const highlighted = card.pendingCount > 0;
  const canSubmit = q.verify !== "auto" && (card.state === "available" || card.state === "rejected");
  const xp = q.reward.xp ?? q.reward.coinsMin;
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border bg-white dark:bg-surface p-4 sm:p-5",
        highlighted ? "border-amber-400/60" : "border-slate-200/80 dark:border-slate-800/80"
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", VERIFY_TONE[q.verify])}>{VERIFY_LABEL[q.verify]}</span>
        {q.repeat === "unlimited" ? (
          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">Takrorlanadi</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <span className={cn("h-1.5 w-1.5 rounded-full", DIFFICULTY_DOT[q.difficulty])} />
            {DIFFICULTY_LABEL[q.difficulty]}
          </span>
        )}
        <span className="ml-auto">{stateBadge(card)}</span>
      </div>
      <h3 className="mt-2 font-bold text-slate-900 dark:text-slate-100">{q.title}</h3>
      {q.description && <p className="mt-1 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">{q.description}</p>}
      {card.rejectReason && <p className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-800 dark:text-rose-300">{card.rejectReason}</p>}
      {card.progress && card.state !== "done" && (
        <div className="mt-3 flex items-center gap-3">
          <XpBar percent={Math.round((card.progress.current / card.progress.target) * 100)} className="flex-1" />
          <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {card.progress.current}/{card.progress.target}
          </span>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 mt-4">
        <span className="min-w-0 truncate text-xs text-slate-600 dark:text-slate-400">
          <b className="font-mono text-amber-700 dark:text-amber-400">{rewardLabel(q.reward, q.verify)}</b>
          {q.reward.coinsMin === q.reward.coinsMax && ` · ${xp} XP`} · {footerHint(card)}
        </span>
        {q.verify !== "auto" && (
          <Link
            href={`/quests/${q._id}`}
            aria-disabled={!canSubmit}
            className={cn(
              "shrink-0 inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-bold transition-colors",
              canSubmit
                ? highlighted
                  ? "bg-teal-600 text-white hover:bg-teal-700"
                  : "border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-teal-500"
                : "border border-slate-200 dark:border-slate-800 text-slate-500"
            )}
          >
            {canSubmit ? (card.state === "rejected" ? "Qayta yuborish" : "Yuborish") : "Ko'rish"}
          </Link>
        )}
      </div>
    </article>
  );
}


const TIER_BAR = { bronze: "bg-orange-700/80", silver: "bg-slate-400", gold: "bg-amber-400" } as const;

function MilestoneCard({ m }: { m: MilestoneView }) {
  const next = m.next!;
  const owned = [...m.tiers].reverse().find((t) => t.owned)?.tier ?? null;
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <BadgeMedal id={m.id} tier={owned} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900 dark:text-slate-100">{m.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {owned ? <b className="text-slate-700 dark:text-slate-300">{TIER_LABEL[owned]}</b> : m.description} · {TIER_LABEL[next.tier].toLowerCase()} bosqichgacha {next.threshold - m.value} qoldi
          </div>
        </div>
        <span className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {m.value}
          <span className="text-slate-400">/{next.threshold}</span>
        </span>
      </div>
      <div className="flex gap-1">
        {m.tiers.map((t, i) => {
          const from = i === 0 ? 0 : m.tiers[i - 1].threshold;
          const fill = Math.max(0, Math.min(1, (m.value - from) / (t.threshold - from)));
          return (
            <div key={t.tier} className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={cn("h-full rounded-full", TIER_BAR[t.tier])} style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>{m.tiers.map((t) => `${TIER_LABEL[t.tier]} · ${t.threshold}`).join("   ")}</span>
        <span className="font-mono font-bold text-amber-700 dark:text-amber-400">+{next.coins}</span>
      </div>
    </div>
  );
}

export function StudentQuestsView({ data }: { data: StudentQuestsData }) {
  const [tab, setTab] = useState<Tab>("all");
  const daily = data.daily.filter((c) => matches(c, tab));
  const main = data.main.filter((c) => matches(c, tab));
  const weekly = data.weekly && matches(data.weekly, tab) ? data.weekly : null;
  // Bir martalik: bajarilmaganlari "Barchasi"/"Faol"da, bajarilganlari faqat "Bajarilgan"da (doim ko'rinib turmasin)
  const oneTime = data.oneTime.filter((t) => (tab === "done" ? t.done : tab === "pending" ? false : !t.done));
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "Barchasi" },
    { id: "active", label: "Faol" },
    { id: "pending", label: "Tekshiruvda", count: data.counts.pending },
    { id: "done", label: "Bajarilgan" },
  ];

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Topshiriqlar</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Bajaring — coin va tajriba (XP) yig&apos;ing</p>
        </div>
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-1 [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition-colors cursor-pointer",
                tab === t.id ? "bg-white dark:bg-surface text-slate-900 dark:text-slate-100 shadow-xs" : "text-slate-600 dark:text-slate-400"
              )}
            >
              {t.label}
              {t.count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Daraja va seriya: telefonda tepada, kompyuterda o'ngda */}
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-20">
          <section aria-label="Daraja" className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 space-y-3">
            <div className="flex items-center gap-3">
              <LevelRevealTrigger level={data.level.level} owned>
                <LevelBadge level={data.level.level} size="md" />
              </LevelRevealTrigger>
              <div className="min-w-0">
                <div className="truncate text-lg font-black text-slate-900 dark:text-slate-100">{data.level.name}</div>
                {data.level.nextName && <div className="text-xs text-slate-500 dark:text-slate-400">Keyingisi: <b>{data.level.nextName}</b></div>}
              </div>
            </div>
            <div className="flex justify-between font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
              <span>
                {formatNumberUz(data.level.xp)}
                {data.level.nextXp !== null ? ` / ${formatNumberUz(data.level.nextXp)}` : ""} XP
              </span>
              {data.level.nextXp !== null && <span>yana {formatNumberUz(data.level.toNext)}</span>}
            </div>
            <XpBar percent={data.level.percent} className="h-2" />
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Coin", formatNumberUz(data.level.balance), ""],
                ["Guruhda", data.groupRank ? `${data.groupRank}-o'rin` : "—", ""],
                ["Bu hafta", `${data.weekXp >= 0 ? "+" : ""}${data.weekXp}`, "text-emerald-700 dark:text-emerald-400"],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2.5 py-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
                  <div className={cn("font-mono text-sm font-black text-slate-900 dark:text-slate-100", tone)}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Kunlik seriya" className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-600">
                <Flame className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 dark:text-slate-100">{data.streak.current} kunlik seriya</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Eng uzuni: {data.streak.best} kun</div>
              </div>
              {data.streak.shields > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-1 text-[11px] font-bold text-teal-700 dark:text-teal-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  himoya ×{data.streak.shields}
                </span>
              )}
            </div>
            <ol className="flex justify-between" aria-label="Shu haftadagi kirishlar">
              {data.streak.week.map((d) => (
                <li key={d.label} className="flex flex-col items-center gap-1">
                  <span
                    aria-label={`${d.label}: ${d.state === "done" ? "kirilgan" : d.state === "today" ? "bugun" : d.state === "missed" ? "kirilmagan" : "kelgusi"}`}
                    className={cn(
                      "h-7 w-7 rounded-full",
                      d.state === "done" && "bg-emerald-500/30",
                      d.state === "today" && "border-2 border-teal-600 bg-white dark:bg-surface",
                      d.state === "missed" && "bg-slate-200 dark:bg-slate-800",
                      d.state === "future" && "bg-slate-100 dark:bg-slate-800/50"
                    )}
                  />
                  <span className={cn("text-[11px] font-semibold", d.state === "today" ? "text-teal-700 dark:text-teal-300" : "text-slate-500")}>{d.label}</span>
                </li>
              ))}
            </ol>
          </section>

          {data.challenge && (
            <section aria-label="Guruh chellenji" className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900 dark:text-slate-100">{data.challenge.title}</h2>
                <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {data.challenge.daysLeft} kun qoldi
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Guruh {data.challenge.target}% davomatga yetsa, har bir a&apos;zo <b className="text-amber-700 dark:text-amber-400">+{data.challenge.coins} coin</b> oladi.
              </p>
              <ul className="space-y-1.5">
                {data.challenge.groups.map((g) => {
                  const reached = g.rate >= data.challenge!.target;
                  return (
                    <li key={g.name} className={cn("grid grid-cols-[3rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-lg px-1.5 py-1", g.mine && "bg-teal-500/10")}>
                      <span className={cn("font-mono text-xs font-bold", g.mine ? "text-teal-700 dark:text-teal-300" : "text-slate-700 dark:text-slate-300")}>{g.name}</span>
                      <span className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <span
                          className={cn("absolute inset-y-0 left-0 rounded-full", reached ? "bg-emerald-500" : g.mine ? "bg-teal-500" : "bg-slate-400")}
                          style={{ width: `${g.rate}%` }}
                        />
                        <span aria-hidden className="absolute -top-1 -bottom-1 w-0.5 bg-slate-900 dark:bg-slate-100" style={{ left: `${data.challenge!.target}%` }} />
                      </span>
                      <span className={cn("text-right font-mono text-xs font-bold", reached ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400")}>{g.rate}%</span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="h-3 w-0.5 bg-slate-900 dark:bg-slate-100" />
                Maqsad — {data.challenge.target}%
              </div>
            </section>
          )}
        </aside>

        <div className="space-y-5 min-w-0 lg:order-1">
          {daily.length > 0 && (
            <section aria-labelledby="daily-title" className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 id="daily-title" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Bugungi topshiriqlar
                </h2>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  23:59 gacha
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {daily.map((c) => (
                  <DailyCard key={c.quest._id} card={c} />
                ))}
              </div>
            </section>
          )}

          {oneTime.length > 0 && (
            <section aria-labelledby="one-time-title" className="space-y-2">
              <h2 id="one-time-title" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Bir martalik topshiriqlar
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {oneTime.map((t) => (
                  <OneTimeCard key={t.id} task={t} />
                ))}
              </div>
            </section>
          )}

          {weekly && (
            <section aria-label="Haftalik masala" className="relative overflow-hidden rounded-2xl bg-slate-900 p-5 sm:p-6 text-white dark:bg-slate-950 dark:ring-1 dark:ring-slate-800">
              <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-400/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-teal-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    Haftalik masala
                  </span>
                  <h2 className="text-xl font-black leading-tight">{weekly.quest.title}</h2>
                  {weekly.quest.description && <p className="line-clamp-2 text-sm text-slate-300">{weekly.quest.description}</p>}
                  <p className="text-xs text-slate-400">
                    {[timeLeft(weekly.quest.endsAt), `${weekly.participants} kishi yechmoqda`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-2">
                  {weekly.quest.reward.places.map((coins, i) => (
                    <div key={i} className="rounded-xl bg-white/5 px-3 py-2 text-center ring-1 ring-white/10">
                      <div className="text-[11px] text-slate-400">{i + 1}-o&apos;rin</div>
                      <div className="font-mono text-lg font-black text-amber-300">+{coins}</div>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                href={`/quests/${weekly.quest._id}`}
                className="relative mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-400 px-5 text-sm font-bold text-slate-950 hover:bg-teal-300"
              >
                {weekly.state === "done" ? "Natijani ko'rish" : weekly.pendingCount ? "Yechim tekshiruvda" : "Yechishni boshlash"}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          <section aria-labelledby="main-title" className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 id="main-title" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Asosiy topshiriqlar
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">{main.length} ta</span>
            </div>
            {main.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {tab === "all" ? "Hozircha topshiriq yo'q — mentor yangi topshiriq e'lon qilganda shu yerda ko'rinadi." : "Bu bo'limda topshiriq yo'q."}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {main.map((c) => (
                  <MainCard key={c.quest._id} card={c} />
                ))}
              </div>
            )}
          </section>

          {tab === "all" && data.milestones.length > 0 && (
            <section aria-labelledby="milestones-title" className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 id="milestones-title" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Marralar
                </h2>
                <Link href="/achievements" className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline">
                  Barcha nishonlar →
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {data.milestones.map((m) => (
                  <MilestoneCard key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
