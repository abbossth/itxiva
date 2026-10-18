"use client";

import Link from "next/link";
import { Check, Lock } from "lucide-react";
import type { AchievementsData } from "@/actions/student-quest.actions";
import { LevelBadge, XpBar } from "@/components/gamification/level-badge";
import { CountUp } from "@/components/leaderboard/count-up";
import { BadgeInfo } from "@/components/gamification/badge-info";
import { LEVEL_MATERIALS } from "@/lib/gamification/levels";
import { cn, formatDateUz, formatNumberUz } from "@/lib/utils";

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5";

/** Profil ramkasi darajaga qarab o'zgaradi (yangi darajada "yangi ramka") */
export function levelFrame(level: number): string {
  if (level >= 10) return "ring-4 ring-fuchsia-500 ring-offset-2";
  if (level >= 7) return "ring-4 ring-amber-400 ring-offset-2";
  if (level >= 4) return "ring-4 ring-teal-500 ring-offset-2";
  return "ring-2 ring-slate-300 dark:ring-slate-600 ring-offset-2";
}


function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
}

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

export function AchievementsView({ data }: { data: AchievementsData }) {
  const joined = data.profile.joinedAt ? new Date(data.profile.joinedAt) : null;
  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Yutuqlarim</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Daraja, nishonlar va o&apos;qish yo&apos;lingiz</p>
      </div>

      <section className={cn(card, "flex flex-col gap-4 lg:flex-row lg:items-center")} aria-label="Profil">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="relative shrink-0">
            <span className={cn("grid h-16 w-16 place-items-center rounded-full bg-teal-600 text-xl font-black text-white ring-offset-white dark:ring-offset-slate-900", levelFrame(data.level.level))}>
              {initials(data.profile.fullName)}
            </span>
            <LevelBadge level={data.level.level} size="sm" className="absolute -bottom-2 -right-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-black text-slate-900 dark:text-slate-100">{data.profile.fullName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {[
                data.profile.groupName && `${data.profile.groupName} guruh`,
                data.profile.grade && `${data.profile.grade}-sinf`,
                joined && `dasturda ${joined.getDate()}-${MONTHS[joined.getMonth()]}dan`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                {data.level.level}-daraja · {data.level.name}
              </span>
              {data.level.nextXp !== null && (
                <span className="flex min-w-[10rem] flex-1 items-center gap-2">
                  <XpBar percent={data.level.percent} className="flex-1" />
                  <span className="font-mono text-xs tabular-nums text-slate-500">
                    {formatNumberUz(data.level.xp)}/{formatNumberUz(data.level.nextXp)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 lg:w-[26rem]">
          {[
            ["XP", <CountUp key="xp" value={data.level.xp} />, "text-slate-900 dark:text-slate-100"],
            ["Coin", <CountUp key="coin" value={data.level.balance} />, "text-amber-700 dark:text-amber-400"],
            [
              "Nishonlar",
              <>
                {data.badgesOwned}
                <span className="text-sm text-slate-400">/{data.badgesTotal}</span>
              </>,
              "text-slate-900 dark:text-slate-100",
            ],
            ["Seriya", data.streak, "text-orange-600"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-xl bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
              <div className={cn("font-mono text-xl font-black tabular-nums", tone as string)}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={card} aria-labelledby="levels">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="levels" className="font-bold text-slate-900 dark:text-slate-100">Darajalar</h2>
          {data.levelUpBonus > 0 && <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">har yangi darajada +{data.levelUpBonus} coin</span>}
        </div>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {data.levels.map((l) => (
            <li
              key={l.level}
              aria-current={l.state === "current" ? "step" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-default transition-colors hover:border-teal-500/40",
                l.state === "current" && "border-teal-600 bg-teal-600 text-white",
                l.state === "passed" && "border-slate-200 dark:border-slate-800",
                l.state === "future" && "border-transparent bg-slate-50 dark:bg-slate-900/50",
                l.level === 10 && l.state === "future" && "border-dashed border-amber-400 bg-amber-50 dark:bg-amber-500/10"
              )}
            >
              <LevelBadge level={l.level} size="sm" locked={l.state === "future"} />
              <span className="min-w-0">
                <span className={cn("block truncate text-[10px] font-bold uppercase tracking-wider", l.state === "current" ? "text-white/75" : "text-slate-500 dark:text-slate-400")}>
                  {l.level}-daraja · {LEVEL_MATERIALS[l.level - 1]}
                </span>
                <span className={cn("block truncate text-sm font-bold", l.state === "current" ? "text-white" : "text-slate-900 dark:text-slate-100")}>{l.name}</span>
                <span className={cn("block font-mono text-[11px]", l.state === "passed" ? "font-sans font-semibold text-emerald-700 dark:text-emerald-400" : l.state === "current" ? "text-white/80" : "text-slate-500")}>
                  {l.state === "passed" ? "O'tildi" : l.state === "current" ? `${formatNumberUz(data.level.xp)} / ${data.level.nextXp !== null ? formatNumberUz(data.level.nextXp) : "∞"}` : `${formatNumberUz(l.minXp)} XP`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-4">
        <section className={card} aria-labelledby="badges">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="badges" className="font-bold text-slate-900 dark:text-slate-100">Nishonlar</h2>
            <span className="font-mono text-sm text-slate-500">
              {data.badgesOwned} / {data.badgesTotal}
            </span>
          </div>
          <p className="-mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400">
            Har nishonning 3 bosqichi bor: bronza, kumush, oltin. Kartani bosing — qanday olinishi va har bosqich uchun coin ko&apos;rinadi.
          </p>
          <ul className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.badges.map((b) => (
              <li key={b.id}>
                <BadgeInfo id={b.id} tier={b.tier} value={b.value} />
              </li>
            ))}
          </ul>
        </section>

        <section className={card} aria-labelledby="path">
          <h2 id="path" className="mb-3 font-bold text-slate-900 dark:text-slate-100">O&apos;qish yo&apos;lim</h2>
          {data.path.length === 0 ? (
            <p className="text-sm text-slate-500">Hali darslar yo&apos;q.</p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:left-[17px] before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {data.path.map((q) => {
                const finished = q.total > 0 && q.done === q.total;
                const percent = q.total ? Math.round((q.done / q.total) * 100) : 0;
                return (
                  <li key={q.quarter} className="relative flex gap-3">
                    <span
                      className={cn(
                        "relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black",
                        finished ? "bg-emerald-600 text-white" : q.state === "current" ? "border-2 border-teal-600 bg-white dark:bg-surface text-teal-700 dark:text-teal-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      )}
                    >
                      {finished ? <Check className="h-4 w-4" /> : q.state === "current" ? `${percent}%` : q.state === "future" ? <Lock className="h-3.5 w-3.5" /> : q.quarter}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                        {q.quarter}-chorak
                        {q.state === "current" && <span className="rounded bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">HOZIR</span>}
                      </div>
                      <div className={cn("text-xs", finished ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}>
                        {q.state === "future" && q.total === 0
                          ? `${q.quarter - 1}-chorak tugagach ochiladi`
                          : `${finished ? "Tugatildi · " : ""}${q.done}/${q.total} dars${!finished && q.nextLesson ? ` · keyingisi: ${q.nextLesson}` : ""}`}
                      </div>
                      {q.state === "current" && !finished && <XpBar percent={percent} className="mt-1.5" />}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <section className={cn(card, "p-0 sm:p-0 overflow-hidden")} aria-labelledby="submissions">
        <h2 id="submissions" className="px-4 pt-4 sm:px-5 sm:pt-5 font-bold text-slate-900 dark:text-slate-100">Yuborganlarim</h2>
        {data.submissions.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            Hali hech narsa yubormagansiz.{" "}
            <Link href="/quests" className="font-semibold text-teal-700 dark:text-teal-400 hover:underline">
              Topshiriqlar →
            </Link>
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 sm:px-5 py-2 font-bold">Topshiriq</th>
                  <th className="px-3 py-2 font-bold">Sana</th>
                  <th className="px-3 py-2 font-bold">Holat</th>
                  <th className="px-3 py-2 font-bold">Izoh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.submissions.map((s) => (
                  <tr key={s._id}>
                    <td className="px-4 sm:px-5 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                      {s.title}
                      {s.detail && <span className="font-normal text-slate-500"> · {s.detail}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDateUz(s.date)}</td>
                    <td className="px-3 py-2.5">
                      {s.revoked ? (
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">Bekor qilindi</span>
                      ) : s.status === "approved" ? (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">+{s.coins}</span>
                      ) : s.status === "pending" ? (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">Tekshiruvda</span>
                      ) : (
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">Rad etildi</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {s.reason || "—"}
                      {s.status === "rejected" && !s.revoked && (
                        <>
                          {" "}
                          <Link href={`/quests/${s.questId}`} className="font-semibold text-teal-700 dark:text-teal-400 underline">
                            Qayta yuborish
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
