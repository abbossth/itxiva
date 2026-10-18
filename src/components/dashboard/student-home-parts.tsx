import Link from "next/link";
import { Award, CalendarCheck, Check, Coins, Flame, Gift, PieChart, Target, TrendingUp, Trophy, Users, Zap } from "lucide-react";
import type { StudentHomeStats } from "@/actions/dashboard.actions";
import type { StudentQuestsData } from "@/actions/student-quest.actions";
import { DashCard, DashEmpty } from "@/components/dashboard/dashboard-parts";
import { ATTENDANCE_STATUS_META } from "@/lib/attendance-status";
import { COIN_TYPE_COLORS, COIN_TYPE_LABELS } from "@/lib/coin-types";
import { TIER_LABEL } from "@/lib/gamification/badges";
import { SCORE_TONE, scoreTone } from "@/lib/score-tone";
import { cn, formatDateUz, formatNumberUz } from "@/lib/utils";
import { LevelBadge } from "@/components/gamification/level-badge";

// O'quvchi bosh sahifasining qiziqtiruvchi bloklari: maqsadlar, kunlik topshiriqlar, chellenj va diagrammalar.
// Diagrammalar oddiy SVG/CSS bilan — kutubxonasiz, tez yuklanadi.

const pct = (part: number, total: number) => (total > 0 ? Math.max(0, Math.min(100, Math.round((part / total) * 100))) : 0);

/** Aylana progress (daraja) */
function Ring({ percent, size = 112, children }: { percent: number; size?: number; children: React.ReactNode }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(2, percent) / 100)}
          className="stroke-teal-500 transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function GoalRow({
  icon: Icon,
  tone,
  title,
  detail,
  percent,
  value,
  href,
}: {
  icon: typeof Target;
  tone: string;
  title: string;
  detail: string;
  percent: number;
  value: string;
  href?: string;
}) {
  const body = (
    <>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{title}</span>
          <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300">{value}</span>
        </span>
        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
          <span className="bar-grow block h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${Math.max(3, percent)}%` }} />
        </span>
        <span className="mt-1 block truncate text-[11px] text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl p-2.5 -mx-2.5 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-white/60 dark:hover:bg-slate-800/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Asosiy maqsadlar: keyingi daraja, reytingda oldinga o'tish, do'kondagi sovg'a, eng yaqin nishon */
export function GoalsHero({ quests, stats }: { quests: StudentQuestsData | null; stats: StudentHomeStats }) {
  const level = quests?.level ?? null;
  const milestone = quests?.milestones[0] ?? null;
  const { rankGap, shopGoal, unit } = stats;
  const weekTotal = stats.days.slice(-7).reduce((s, d) => s + (unit === "XP" ? d.xp : d.coins), 0);

  return (
    <section className="stagger-item relative overflow-hidden rounded-3xl border border-teal-500/30 bg-white dark:bg-surface p-5 sm:p-6 shadow-xs">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-transparent to-amber-400/10" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
        {level ? (
          <div className="flex items-center gap-4 lg:w-72 lg:shrink-0">
            <Ring percent={level.percent}>
              <LevelBadge level={level.level} size="lg" />
            </Ring>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Mening darajam</p>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100">{level.name}</p>
              <p className="font-mono text-sm tabular-nums text-slate-600 dark:text-slate-400">
                {formatNumberUz(level.xp)}
                {level.nextXp !== null ? ` / ${formatNumberUz(level.nextXp)}` : ""} XP
              </p>
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
                <TrendingUp className="w-3 h-3" />
                Shu hafta +{formatNumberUz(weekTotal)} {unit}
              </p>
            </div>
          </div>
        ) : (
          <div className="lg:w-64 lg:shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Maqsadlarim</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Shu hafta <strong className="text-slate-900 dark:text-slate-100">+{formatNumberUz(weekTotal)} coin</strong> to&apos;pladingiz
            </p>
          </div>
        )}

        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {level && level.nextXp !== null && (
            <GoalRow
              icon={Zap}
              tone="bg-teal-500/15 text-teal-700 dark:text-teal-300"
              title={`Keyingi daraja: ${level.nextName}`}
              detail={`Yana ${formatNumberUz(level.toNext)} XP to'plang`}
              percent={level.percent}
              value={`${level.percent}%`}
              href="/achievements"
            />
          )}
          {rankGap && (
            <GoalRow
              icon={Trophy}
              tone="bg-amber-500/15 text-amber-700 dark:text-amber-300"
              title={rankGap.position === 1 ? "Guruhda 1-o'rindasiz!" : `Guruhda ${rankGap.position}-o'rin`}
              detail={
                rankGap.position === 1
                  ? "O'rningizni saqlab qoling"
                  : `${rankGap.aheadName ?? "Oldingi o'quvchi"}dan o'tish uchun yana ${formatNumberUz(rankGap.gap)} ${unit}`
              }
              percent={pct(rankGap.total - rankGap.position + 1, rankGap.total)}
              value={`${rankGap.position} / ${rankGap.total}`}
              href="/leaderboard"
            />
          )}
          {shopGoal && (
            <GoalRow
              icon={Gift}
              tone="bg-rose-500/15 text-rose-700 dark:text-rose-300"
              title={`Sovg'a: ${shopGoal.title}`}
              detail={
                shopGoal.balance >= shopGoal.price
                  ? "Balansingiz yetadi — do'konda oling!"
                  : `Yana ${formatNumberUz(shopGoal.price - shopGoal.balance)} coin yig'ing`
              }
              percent={pct(shopGoal.balance, shopGoal.price)}
              value={`${formatNumberUz(Math.min(shopGoal.balance, shopGoal.price))} / ${formatNumberUz(shopGoal.price)}`}
              href="/shop"
            />
          )}
          {milestone?.next && (
            <GoalRow
              icon={Award}
              tone="bg-violet-500/15 text-violet-700 dark:text-violet-300"
              title={`${milestone.title} nishoni: ${TIER_LABEL[milestone.next.tier].toLowerCase()} bosqich`}
              detail={`Yana ${formatNumberUz(milestone.next.threshold - milestone.value)} ${milestone.unit} · +${milestone.next.coins} coin`}
              percent={pct(milestone.value, milestone.next.threshold)}
              value={`${milestone.value} / ${milestone.next.threshold}`}
              href="/achievements"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** Bugungi avtomatik topshiriqlar va shu haftaning kirish seriyasi */
export function DailyCard({ quests }: { quests: StudentQuestsData }) {
  const { daily, streak } = quests;
  const done = daily.filter((d) => d.state === "done").length;
  return (
    <DashCard title={`Bugungi topshiriqlar · ${done}/${daily.length}`} icon={Target} href="/quests">
      {daily.length === 0 ? (
        <DashEmpty>Bugun uchun topshiriq yo&apos;q</DashEmpty>
      ) : (
        <ul className="space-y-2">
          {daily.map((d) => {
            const isDone = d.state === "done";
            const p = d.progress;
            return (
              <li
                key={d.quest._id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  isDone ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-200/80 dark:border-slate-800"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    isDone ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                  )}
                >
                  {isDone ? <Check className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-semibold", isDone ? "text-slate-500 line-through" : "text-slate-900 dark:text-slate-100")}>
                    {d.quest.title}
                  </span>
                  {p && p.target > 1 && (
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <span className="block h-full rounded-full bg-teal-500" style={{ width: `${pct(p.current, p.target)}%` }} />
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500">
                        {p.current}/{p.target}
                      </span>
                    </span>
                  )}
                </span>
                <span className={cn("shrink-0 font-mono text-sm font-black", isDone ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                  +{d.quest.reward.coinsMin}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-orange-500/10 p-3">
        <Flame className="w-6 h-6 shrink-0 text-orange-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{streak.current} kunlik seriya</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">Eng uzuni: {streak.best} kun</p>
        </div>
        {/* Tor ekranda kunlar alohida qatorga tushadi */}
        <div className="flex w-full justify-between gap-1 sm:w-auto sm:justify-start">
          {streak.week.map((w) => (
            <span
              key={w.label}
              title={w.label}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold",
                w.state === "done" && "bg-orange-500 text-white",
                w.state === "today" && "border-2 border-orange-500 text-orange-600 dark:text-orange-300",
                w.state === "missed" && "bg-slate-200 text-slate-400 dark:bg-slate-800",
                w.state === "future" && "bg-slate-100 text-slate-400 dark:bg-slate-800/50"
              )}
            >
              {w.label}
            </span>
          ))}
        </div>
      </div>
    </DashCard>
  );
}

/** Guruhlararo oylik davomat chellenji: o'z guruhim qayerda */
export function ChallengeCard({ challenge }: { challenge: NonNullable<StudentQuestsData["challenge"]> }) {
  const mine = challenge.groups.find((g) => g.mine) ?? null;
  const myPlace = mine ? challenge.groups.indexOf(mine) + 1 : null;
  const gap = mine ? challenge.target - mine.rate : null;
  return (
    <DashCard title={challenge.title} icon={Users} href="/quests" hrefLabel="Batafsil">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-bold text-slate-700 dark:text-slate-300">
          {challenge.daysLeft} kun qoldi
        </span>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-bold text-amber-800 dark:text-amber-300">Har bir a&apos;zoga +{challenge.coins} coin</span>
      </div>

      {mine && (
        <div
          className={cn(
            "mb-4 rounded-2xl p-3.5",
            gap !== null && gap <= 0 ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-amber-500/10 text-amber-900 dark:text-amber-200"
          )}
        >
          <p className="text-sm font-black">
            Guruhingiz: {mine.rate}% · {myPlace}-o&apos;rin
          </p>
          <p className="text-xs">
            {gap !== null && gap <= 0
              ? `Maqsad (${challenge.target}%) bajarilmoqda — oy oxirigacha shunday davom eting!`
              : `Maqsadgacha yana ${gap}% kerak. Darslarga kechikmay keling!`}
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {challenge.groups.slice(0, 8).map((g) => (
          <li key={g.name} className={cn("flex items-center gap-3 rounded-lg px-2 py-1", g.mine && "bg-teal-500/10 ring-1 ring-teal-500/40")}>
            <span className={cn("w-12 shrink-0 font-mono text-xs font-bold", g.mine ? "text-teal-700 dark:text-teal-300" : "text-slate-600 dark:text-slate-400")}>
              {g.name}
            </span>
            <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <span
                className={cn("bar-grow block h-full rounded-full", g.rate >= challenge.target ? "bg-emerald-500" : g.mine ? "bg-teal-500" : "bg-slate-400 dark:bg-slate-500")}
                style={{ width: `${g.rate}%` }}
              />
              <span aria-hidden className="absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${challenge.target}%` }} />
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300">{g.rate}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Qora chiziq — maqsad ({challenge.target}%)</p>
    </DashCard>
  );
}

/** So'nggi 14 kunda kunlik XP (yoki coin) — ustunli diagramma */
export function DaysChart({ stats }: { stats: StudentHomeStats }) {
  const { days, unit } = stats;
  const values = days.map((d) => (unit === "XP" ? d.xp : d.coins));
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const activeDays = values.filter((v) => v > 0).length;
  const bestIdx = values.indexOf(Math.max(...values));
  return (
    <DashCard title={`So'nggi 14 kun: ${unit}`} icon={TrendingUp}>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span>
          Jami: <strong className="font-mono text-slate-900 dark:text-slate-100">+{formatNumberUz(total)}</strong>
        </span>
        <span>
          Faol kunlar: <strong className="text-slate-900 dark:text-slate-100">{activeDays} / 14</strong>
        </span>
        {total > 0 && (
          <span>
            Eng yaxshi kun: <strong className="text-slate-900 dark:text-slate-100">{formatDateUz(days[bestIdx].key).split(",")[0]}</strong>
          </span>
        )}
      </div>
      <div className="flex h-40 items-end gap-1 sm:gap-1.5" role="img" aria-label={`So'nggi 14 kunda jami ${total} ${unit}`}>
        {days.map((d, i) => {
          const v = values[i];
          const isToday = i === days.length - 1;
          return (
            <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${formatDateUz(d.key).split(",")[0]}: +${v} ${unit}`}>
              <span className="font-mono text-[9px] font-bold tabular-nums text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 sm:text-[10px]">
                {v > 0 ? v : ""}
              </span>
              <div
                className={cn(
                  "w-full origin-bottom rounded-t-md podium-rise",
                  v === 0 ? "bg-slate-200 dark:bg-slate-800" : isToday ? "bg-gradient-to-t from-amber-500 to-amber-300" : "bg-gradient-to-t from-teal-600 to-teal-400"
                )}
                style={{ height: `${v === 0 ? 3 : Math.max(8, (v / max) * 100)}%`, animationDelay: `${i * 30}ms` }}
              />
              <span className={cn("text-[9px] sm:text-[10px]", isToday ? "font-black text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400")}>
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </DashCard>
  );
}

/** Oxirgi baholar: vazifa bali va test foizi, eskidan yangiga */
export function ScoresChart({ stats }: { stats: StudentHomeStats }) {
  const { scores } = stats;
  const avg = scores.length > 0 ? Math.round(scores.reduce((s, x) => s + x.percent, 0) / scores.length) : null;
  const half = Math.floor(scores.length / 2);
  const trend =
    scores.length >= 4
      ? Math.round(scores.slice(half).reduce((s, x) => s + x.percent, 0) / (scores.length - half) - scores.slice(0, half).reduce((s, x) => s + x.percent, 0) / half)
      : null;
  return (
    <DashCard title="Baholarim dinamikasi" icon={PieChart} href="/homework">
      {scores.length === 0 ? (
        <DashEmpty>Baholangan vazifa yoki test hali yo&apos;q</DashEmpty>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span>
              O&apos;rtacha: <strong className={cn("font-mono", SCORE_TONE[scoreTone(avg)].text)}>{avg}%</strong>
            </span>
            {trend !== null && (
              <span>
                Oxirgi natijalar:{" "}
                <strong className={trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {trend >= 0 ? `+${trend}% yaxshilandi` : `${trend}% pasaydi`}
                </strong>
              </span>
            )}
          </div>
          <div className="relative flex h-40 items-end gap-1.5 sm:gap-2" role="img" aria-label={`Oxirgi ${scores.length} ta baho, o'rtacha ${avg}%`}>
            {avg !== null && (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-slate-400/60" style={{ bottom: `calc(${avg}% * 0.82 + 18px)` }} />
            )}
            {scores.map((s, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${s.title} — ${s.percent}%`}>
                <span className="font-mono text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">{s.percent}</span>
                <div
                  className={cn("w-full max-w-10 rounded-t-md podium-rise", SCORE_TONE[scoreTone(s.percent)].bar)}
                  style={{ height: `${Math.max(4, s.percent * 0.82)}%`, animationDelay: `${i * 40}ms` }}
                />
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{s.kind === "quiz" ? "T" : "V"}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">V — uyga vazifa, T — test. Uzuq chiziq — o&apos;rtacha natija</p>
        </>
      )}
    </DashCard>
  );
}

/** Oxirgi darslar davomati: foiz va har bir dars katakchasi */
export function AttendanceCard({ stats }: { stats: StudentHomeStats }) {
  const { attendance, attendancePercent } = stats;
  const tone = scoreTone(attendancePercent);
  return (
    <DashCard title="Davomatim" icon={CalendarCheck} href="/attendance">
      {attendance.length === 0 ? (
        <DashEmpty>Hali davomat yozuvi yo&apos;q</DashEmpty>
      ) : (
        <div className="flex items-center gap-5">
          <Ring percent={attendancePercent ?? 0} size={96}>
            <span className={cn("font-mono text-2xl font-black", SCORE_TONE[tone].text)}>{attendancePercent ?? "—"}%</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">Oxirgi {attendance.length} ta dars</p>
            <div className="flex flex-wrap gap-1.5">
              {attendance.map((a, i) => (
                <span
                  key={i}
                  title={`${formatDateUz(a.date).split(",")[0]} — ${ATTENDANCE_STATUS_META[a.status].label}`}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black", ATTENDANCE_STATUS_META[a.status].className)}
                >
                  {ATTENDANCE_STATUS_META[a.status].short}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashCard>
  );
}

/** So'nggi 30 kunda coin qayerdan keldi */
export function SourcesCard({ stats }: { stats: StudentHomeStats }) {
  const total = stats.sources.reduce((s, x) => s + x.amount, 0);
  return (
    <DashCard title="Coinlarim qayerdan (30 kun)" icon={Coins} href="/profile" hrefLabel="Tarix">
      {total === 0 ? (
        <DashEmpty>So&apos;nggi 30 kunda coin olinmagan</DashEmpty>
      ) : (
        <>
          {/* Bitta chiziqda ulushlar */}
          <div className="mb-4 flex h-3 overflow-hidden rounded-full">
            {stats.sources.map((s) => (
              <span key={s.type} className={cn("h-full", COIN_TYPE_COLORS[s.type].bar)} style={{ width: `${(s.amount / total) * 100}%` }} />
            ))}
          </div>
          <ul className="space-y-1.5">
            {stats.sources.slice(0, 5).map((s) => (
              <li key={s.type} className="flex items-center gap-2 text-sm">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", COIN_TYPE_COLORS[s.type].bar)} />
                <span className="flex-1 text-slate-700 dark:text-slate-300">{COIN_TYPE_LABELS[s.type]}</span>
                <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">+{formatNumberUz(s.amount)}</span>
                <span className="w-10 text-right text-xs text-slate-500">{Math.round((s.amount / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashCard>
  );
}
