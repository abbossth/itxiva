import Link from "next/link";
import { ClipboardCheck, Flame, GraduationCap, QrCode, Sparkles, Target, Trophy, TrendingUp, Users } from "lucide-react";
import type { LeaderboardData, LeaderboardEntry } from "@/actions/leaderboard.actions";
import { Podium } from "@/components/leaderboard/podium";
import { RankTable } from "@/components/leaderboard/rank-table";
import { RankDelta } from "@/components/leaderboard/rank-delta";
import { CountUp } from "@/components/leaderboard/count-up";
import { TopThreeCelebration } from "@/components/leaderboard/celebrate";
import { MyRankFloat } from "@/components/leaderboard/my-rank-float";
import { NameAvatar } from "@/components/leaderboard/name-avatar";
import { LevelBadge } from "@/components/gamification/level-badge";
import { groupShortName } from "@/lib/group-name";
import { cn, formatNumberUz } from "@/lib/utils";

// Filtrlar qorong'i sahna ustida turadi
const tabClass = (active: boolean) =>
  cn(
    "flex-1 sm:flex-initial px-3.5 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[40px] flex items-center justify-center whitespace-nowrap",
    active ? "bg-white text-slate-900 shadow-xs" : "text-white/75 hover:text-white hover:bg-white/10"
  );
const chipClass = (active: boolean) =>
  cn(
    "px-3 rounded-xl text-xs font-bold transition-colors shrink-0 min-h-[34px] flex items-center justify-center ring-1",
    active ? "bg-teal-500 text-white ring-teal-400" : "bg-white/5 text-white/80 ring-white/10 hover:bg-white/10 hover:text-white"
  );

/** O'quvchining o'z o'rni: nechanchi, oldindagiga qancha qoldi */
function MyRankHero({ me, data }: { me: LeaderboardEntry; data: LeaderboardData }) {
  // Mendan oldinda turgan eng yaqin o'quvchi
  const ahead = [...data.entries].reverse().find((e) => e.totalCoins > me.totalCoins) ?? null;
  const behind = data.entries.find((e) => e.totalCoins < me.totalCoins) ?? null;
  const gap = ahead ? ahead.totalCoins - me.totalCoins : 0;
  const progress = ahead ? Math.max(4, Math.round((me.totalCoins / ahead.totalCoins) * 100)) : 100;

  const message = !ahead
    ? behind
      ? `Siz peshqadamsiz! Ikkinchi o'rindan ${me.totalCoins - behind.totalCoins} ${data.unit} oldindasiz — bo'shashmang.`
      : "Siz peshqadamsiz!"
    : gap <= 5
      ? "Bitta dars — va siz bir pog'ona yuqoridasiz!"
      : gap <= 20
        ? "Bitta yaxshi topshirilgan uyga vazifa yetarli."
        : "Har bir dars va vazifa sizni yuqoriga olib chiqadi.";

  return (
    <section
      aria-label="Mening o'rnim"
      className="page-enter relative overflow-hidden rounded-3xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 via-white to-white dark:via-surface dark:to-surface p-4 sm:p-5"
    >
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-600/25">
            <span className="font-mono text-3xl sm:text-4xl font-black leading-none tabular-nums">{me.rank}</span>
            <span className="mt-0.5 text-[10px] font-semibold text-white/90">o&apos;rin</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
              <span>Sizning o&apos;rningiz · {data.totalParticipants} ta ichida</span>
              <RankDelta rank={me.rank} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <CountUp value={me.totalCoins} className="font-mono text-2xl sm:text-3xl font-black tabular-nums text-slate-900 dark:text-slate-100" />
              <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{data.unit === "coin" ? "coin yig'ilgan" : data.unit}</span>
              {me.level !== undefined && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 py-0.5 pl-0.5 pr-1.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                  <LevelBadge level={me.level} size="xs" />
                  {me.levelName}
                </span>
              )}
              {me.weekCoins > 0 && (
                <span className="rank-pop inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="w-3.5 h-3.5" />+{me.weekCoins} bu hafta
                </span>
              )}
            </div>
            {/* Coin reytingi jami yig'ilgan bo'yicha: do'kondagi xarid reytingni tushirmaydi — balans alohida ko'rsatiladi */}
            {data.unit === "coin" && me.balance !== undefined && me.balance < me.totalCoins && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Hozirgi balansingiz: <b className="font-mono text-amber-700 dark:text-amber-400">{formatNumberUz(me.balance)} coin</b> · do&apos;konda{" "}
                {formatNumberUz(me.totalCoins - me.balance)} coin sarflagansiz (reytingdan ayirilmaydi)
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 sm:border-l sm:border-slate-200 dark:sm:border-slate-800 sm:pl-6">
          {ahead ? (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Target className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
                <span className="truncate">
                  {ahead.rank}-o&apos;ringa <span className="font-mono">{gap}</span> {data.unit} qoldi
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                <div className="bar-grow h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-400" style={{ width: `${progress}%`, animationDelay: "300ms" }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span>Siz: {me.totalCoins}</span>
                <span className="truncate pl-2">
                  {ahead.displayName}: {ahead.totalCoins}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
              <Trophy className="w-5 h-5 text-amber-500" />
              Birinchi o&apos;rin sizniki
            </div>
          )}
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        </div>
      </div>
    </section>
  );
}

export interface LeaderboardViewProps {
  data: LeaderboardData;
  groups: { _id: { toString(): string }; name: string; shortName?: string | null; grade: number }[];
  type: "all" | "group" | "grade";
  groupId?: string;
  grade?: number;
  metric?: "coin";
  role: "mentor" | "student";
  /** O'quvchining o'z guruhi — "Guruh" tabi shundan boshlanadi */
  viewerGroupId?: string | null;
  celebrate: boolean;
}

/** Reyting sahifasining ko'rinishi (ma'lumotni sahifa oladi) */
export function LeaderboardView({ data, groups, type, groupId, grade, metric, role, viewerGroupId, celebrate }: LeaderboardViewProps) {
  // Filtr havolalari tanlangan o'lchovni (XP yoki coin) saqlaydi
  const withMetric = (href: string) => (metric ? `${href}${href.includes("?") ? "&" : "?"}metric=coin` : href);
  const grades = [...new Set(groups.map((g) => g.grade))].sort((a, b) => a - b);
  const hasAnyCoins = data.top3.some((e) => e.totalCoins > 0);
  const me = data.currentUserEntry ?? null;

  const metricHref = (m: "xp" | "coin") =>
    `/leaderboard?type=${type}${groupId && type === "group" ? `&groupId=${groupId}` : ""}${grade && type === "grade" ? `&grade=${grade}` : ""}${m === "coin" ? "&metric=coin" : ""}`;
  const leader = data.top3[0];

  // O'quvchida o'z guruhi birinchi turadi (sukut ham shu), mentorda — umumiy reyting
  const ownGroup = viewerGroupId ? groups.find((g) => g._id.toString() === viewerGroupId) : undefined;
  const allTab = { type: "all" as const, label: "Umumiy", href: "/leaderboard?type=all" };
  const groupTab = {
    type: "group" as const,
    label: role === "student" && ownGroup ? "Guruhim" : "Guruh",
    href: groups.length > 0 ? `/leaderboard?type=group&groupId=${(ownGroup?._id ?? groups[0]._id).toString()}` : "/leaderboard?type=group",
  };
  const gradeTab = { type: "grade" as const, label: "Sinf", href: `/leaderboard?type=grade&grade=${ownGroup?.grade ?? grades[0] ?? 8}` };
  const typeTabs = role === "student" && ownGroup ? [groupTab, allTab, gradeTab] : [allTab, groupTab, gradeTab];

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      {/* Sahna: sarlavha, filtrlar va kuchli uchlik bitta qorong'i kartada (ikkala rejimda ham) */}
      <section
        aria-label="Reyting"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-teal-950 px-4 pt-4 sm:px-6 sm:pt-5 text-white shadow-xl shadow-slate-900/20 ring-1 ring-white/5"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-full w-[80%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.22),transparent_62%)]"
        />
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl sm:text-2xl font-black tracking-tight">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 ring-1 ring-amber-300/30">
                <Trophy className="w-5 h-5 text-amber-300" />
              </span>
              Reyting
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-white/70">
              {data.totalParticipants} o&apos;quvchi · jami {formatNumberUz(data.totalCoins)} {data.unit}
              {leader && leader.totalCoins > 0 ? ` · peshqadam: ${leader.displayName}` : ""}
            </p>
          </div>

          <nav aria-label="Reyting turi" className="flex w-full items-center gap-1 rounded-2xl bg-white/10 p-1 ring-1 ring-white/10 sm:w-fit">
            {typeTabs.map((t) => (
              <Link key={t.type} href={withMetric(t.href)} className={tabClass(type === t.type)} aria-current={type === t.type ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        {(data.canSwitch || type !== "all") && (
          <div className="relative mt-3 flex flex-wrap items-center gap-2">
            {data.canSwitch && (
              <nav aria-label="Reyting o'lchovi" className="flex items-center gap-1 rounded-xl bg-white/10 p-1 ring-1 ring-white/10">
                {(
                  [
                    ["xp", "XP", "Tajriba: sarflanmaydi, faollikni ko'rsatadi"],
                    ["coin", "Coin", "Jami yig'ilgan coin (do'kon xaridi kamaytirmaydi)"],
                  ] as const
                ).map(([m, label, hint]) => {
                  const active = (metric ?? "xp") === m;
                  return (
                    <Link
                      key={m}
                      href={metricHref(m)}
                      title={hint}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "min-h-[34px] rounded-lg px-3 text-xs font-bold flex items-center transition-colors",
                        active ? "bg-amber-400 text-slate-950" : "text-white/75 hover:text-white hover:bg-white/10"
                      )}
                    >
                      {label} bo&apos;yicha
                    </Link>
                  );
                })}
              </nav>
            )}
            {data.canSwitch && (
              <span className="text-[11px] text-white/60">
                {metric === "coin" ? "Jami yig'ilgan coin — do'konda sarflangani ayirilmaydi" : "XP — tajriba, sarflanmaydi"}
              </span>
            )}
            {type === "group" && (
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
                {groups.map((g) => (
                  <Link
                    key={g._id.toString()}
                    href={withMetric(`/leaderboard?type=group&groupId=${g._id.toString()}`)}
                    title={g.name}
                    className={cn(chipClass(groupId === g._id.toString()), "font-mono")}
                  >
                    {groupShortName(g)}
                  </Link>
                ))}
              </div>
            )}
            {type === "grade" && (
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
                {grades.map((gr) => (
                  <Link key={gr} href={withMetric(`/leaderboard?type=grade&grade=${gr}`)} className={chipClass(grade === gr)}>
                    {gr}-sinflar
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {hasAnyCoins ? (
          <div className="relative">
            <Podium top3={data.top3} unit={data.unit} />
          </div>
        ) : (
          <div className="relative mx-auto max-w-md space-y-2 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold">Hali hech kim {data.unit} to&apos;plamagan — birinchi bo&apos;ling!</h2>
            <p className="text-xs text-white/70">
              Darslarda qatnashing, davomatdan o&apos;ting va vazifalarni topshirib birinchi o&apos;ringa ko&apos;tariling.
            </p>
          </div>
        )}
      </section>

      {me && <MyRankHero me={me} data={data} />}
      {me && <MyRankFloat rank={me.rank} value={me.totalCoins} unit={data.unit} />}
      {/* Konfetti: o'quvchi kuchli uchlikda bo'lsa; mentorga esa uchlik ko'rsatilganda har doim (har filtr uchun qaytadan) */}
      {hasAnyCoins && celebrate && (
        <TopThreeCelebration
          key={`${type}-${groupId ?? ""}-${grade ?? ""}-${metric ?? "xp"}`}
          rank={role === "mentor" ? 1 : me && me.totalCoins > 0 ? me.rank : 0}
        />
      )}

      {data.weekStars.length > 0 && (
        <section aria-labelledby="week-stars" className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-3 sm:p-4">
          <h2 id="week-stars" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <Flame className="w-4 h-4 text-orange-500" />
            Hafta yulduzlari — oxirgi 7 kunda eng ko&apos;p o&apos;sganlar
          </h2>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {data.weekStars.map((e) => (
              <li
                key={e.userId}
                className={cn(
                  "stagger-item flex items-center gap-2.5 rounded-xl px-3 py-2",
                  e.isCurrentUser ? "bg-teal-500/10 ring-1 ring-teal-500/40" : "bg-slate-50 dark:bg-slate-800/50"
                )}
              >
                <NameAvatar name={e.fullName ?? e.displayName} seed={e.userId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {e.displayName}
                    {e.isCurrentUser && " (siz)"}
                  </span>
                  <span className="block text-[11px] text-slate-600 dark:text-slate-400">
                    {e.groupName} · {e.rank}-o&apos;rin
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">
                  +{e.weekCoins}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {role === "student" && (
        <section aria-label="Coin qanday yig'iladi" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { href: "/attendance", icon: QrCode, title: "Darsga keling", text: "Har bir dars uchun +5 coin" },
            { href: "/homework", icon: ClipboardCheck, title: "Vazifani topshiring", text: "Ball qancha yuqori bo'lsa, coin shuncha ko'p" },
            { href: "/exams", icon: GraduationCap, title: "Test va imtihon", text: "To'g'ri javoblar uchun coin" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="card-press flex items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface px-3 py-2.5 hover:border-teal-500/50 transition-colors"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                <item.icon className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{item.title}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">{item.text}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="full-list" className="space-y-2">
        <h2 id="full-list" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
          <Users className="w-4 h-4" />
          To&apos;liq ro&apos;yxat
        </h2>
        <RankTable entries={data.entries} unit={data.unit} />
      </section>
    </div>
  );
}
