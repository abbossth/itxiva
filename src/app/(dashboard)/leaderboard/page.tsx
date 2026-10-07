import Link from "next/link";
import { ArrowDown, ClipboardCheck, Flame, GraduationCap, QrCode, Sparkles, Target, Trophy, TrendingUp, Users } from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { getLeaderboardAction, type LeaderboardData, type LeaderboardEntry } from "@/actions/leaderboard.actions";
import { getGroups } from "@/actions/group.actions";
import { Podium } from "@/components/leaderboard/podium";
import { RankTable } from "@/components/leaderboard/rank-table";
import { RankDelta } from "@/components/leaderboard/rank-delta";
import { CountUp } from "@/components/leaderboard/count-up";
import { TopThreeCelebration } from "@/components/leaderboard/celebrate";
import { groupShortName } from "@/lib/group-name";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Reyting — ITXiva",
};

interface LeaderboardPageProps {
  searchParams: Promise<{
    type?: "all" | "group" | "grade";
    groupId?: string;
    grade?: string;
  }>;
}

const tabClass = (active: boolean) =>
  cn(
    "flex-1 sm:flex-initial px-3.5 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[40px] flex items-center justify-center whitespace-nowrap",
    active
      ? "bg-white dark:bg-surface text-teal-700 dark:text-teal-300 shadow-xs"
      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
  );
const chipClass = (active: boolean) =>
  cn(
    "px-3.5 rounded-xl text-xs sm:text-sm font-bold transition-colors shrink-0 min-h-[36px] flex items-center justify-center",
    active
      ? "bg-teal-600 text-white"
      : "bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
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
      ? `Siz peshqadamsiz! Ikkinchi o'rindan ${me.totalCoins - behind.totalCoins} coin oldindasiz — bo'shashmang.`
      : "Siz peshqadamsiz!"
    : gap <= 5
      ? "Bitta dars — va siz bir pog'ona yuqoridasiz!"
      : gap <= 20
        ? "Bitta yaxshi topshirilgan uyga vazifa yetarli."
        : "Har bir dars va vazifa sizni yuqoriga olib chiqadi.";

  return (
    <section
      aria-label="Mening o'rnim"
      className="page-enter relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-5 sm:p-6 text-white shadow-lg shadow-teal-600/20"
    >
      <span aria-hidden className="hero-glow absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
      <span aria-hidden className="hero-glow absolute -left-16 -bottom-20 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl" style={{ animationDelay: "2.5s" }} />

      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 flex-col items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/30 backdrop-blur-xs">
            <span className="font-mono text-4xl sm:text-5xl font-black leading-none tabular-nums">{me.rank}</span>
            <span className="mt-1 text-[11px] font-semibold text-white/90">o&apos;rin</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/90">
              <span>Sizning o&apos;rningiz · {data.totalParticipants} o&apos;quvchi ichida</span>
              <RankDelta rank={me.rank} />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <CountUp value={me.totalCoins} className="font-mono text-3xl sm:text-4xl font-black tabular-nums" />
              <span className="text-sm font-bold text-white/90">coin</span>
              {me.weekCoins > 0 && (
                <span className="rank-pop inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-mono text-xs font-bold">
                  <TrendingUp className="w-3.5 h-3.5" />+{me.weekCoins} bu hafta
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 sm:border-l sm:border-white/25 sm:pl-6">
          {ahead ? (
            <>
              <div className="flex items-center gap-2 text-sm font-bold">
                <Target className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {ahead.rank}-o&apos;ringa yetish uchun <span className="font-mono">{gap}</span> coin qoldi
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                <div className="bar-grow h-full rounded-full bg-amber-300" style={{ width: `${progress}%`, animationDelay: "300ms" }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] font-semibold text-white/90">
                <span>Siz: {me.totalCoins}</span>
                <span className="truncate pl-2">
                  {ahead.displayName}: {ahead.totalCoins}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-base font-black">
              <Trophy className="w-5 h-5 text-amber-300" />
              Birinchi o&apos;rin sizniki
            </div>
          )}
          <p className="mt-2 text-sm text-white/95">{message}</p>
        </div>
      </div>

      <a
        href="#my-rank"
        className="relative mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 min-h-[36px] text-xs font-bold ring-1 ring-white/30 hover:bg-white/25 transition-colors"
      >
        <ArrowDown className="w-3.5 h-3.5" />
        Ro&apos;yxatda o&apos;zimni ko&apos;rsat
      </a>
    </section>
  );
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const session = await requireAuth();
  const resolvedSearchParams = await searchParams;

  const type = resolvedSearchParams.type || "all";
  const groupId = resolvedSearchParams.groupId;
  const grade = resolvedSearchParams.grade ? parseInt(resolvedSearchParams.grade, 10) : undefined;

  const [data, groups] = await Promise.all([getLeaderboardAction({ type, groupId, grade }), getGroups()]);

  const grades = [...new Set(groups.map((g) => g.grade))].sort((a, b) => a - b);
  const hasAnyCoins = data.top3.some((e) => e.totalCoins > 0);
  const me = data.currentUserEntry ?? null;

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Trophy className="w-6 h-6 text-amber-500" />
            Reyting
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {data.totalParticipants} o&apos;quvchi · jami {data.totalCoins.toLocaleString("uz-UZ")} coin yig&apos;ilgan
          </p>
        </div>

        <nav aria-label="Reyting turi" className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full sm:w-fit">
          <Link href="/leaderboard?type=all" className={tabClass(type === "all")}>
            Umumiy
          </Link>
          <Link
            href={groups.length > 0 ? `/leaderboard?type=group&groupId=${(session.groupId ?? groups[0]._id).toString()}` : "/leaderboard?type=group"}
            className={tabClass(type === "group")}
          >
            Guruh
          </Link>
          <Link href={`/leaderboard?type=grade&grade=${grades[0] ?? 8}`} className={tabClass(type === "grade")}>
            Sinf
          </Link>
        </nav>
      </div>

      {type === "group" && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {groups.map((g) => (
            <Link
              key={g._id.toString()}
              href={`/leaderboard?type=group&groupId=${g._id.toString()}`}
              title={g.name}
              className={cn(chipClass(groupId === g._id.toString()), "font-mono")}
            >
              {groupShortName(g)}
            </Link>
          ))}
        </div>
      )}
      {type === "grade" && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {grades.map((gr) => (
            <Link key={gr} href={`/leaderboard?type=grade&grade=${gr}`} className={chipClass(grade === gr)}>
              {gr}-sinflar
            </Link>
          ))}
        </div>
      )}

      {me && <MyRankHero me={me} data={data} />}
      {/* Konfetti: o'quvchi kuchli uchlikda bo'lsa; mentorga esa uchlik ko'rsatilganda har doim (har filtr uchun qaytadan) */}
      {hasAnyCoins && (
        <TopThreeCelebration
          key={`${type}-${groupId ?? ""}-${grade ?? ""}`}
          rank={session.role === "mentor" ? 1 : me && me.totalCoins > 0 ? me.rank : 0}
        />
      )}

      {hasAnyCoins ? (
        <section
          aria-label="Kuchli uchlik"
          className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/30 dark:to-surface px-4 sm:px-6"
        >
          <h2 className="pt-4 text-center text-xs font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300">
            Kuchli uchlik
          </h2>
          <Podium top3={data.top3} />
        </section>
      ) : (
        <div className="rounded-3xl border border-dashed border-amber-300/80 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/20 p-6 text-center space-y-2 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Hali hech kim coin to&apos;plamagan — birinchi bo&apos;ling!</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            Darslarda qatnashing, davomatdan o&apos;ting va vazifalarni topshirib birinchi o&apos;ringa ko&apos;tariling.
          </p>
        </div>
      )}

      {data.weekStars.length > 0 && (
        <section aria-labelledby="week-stars" className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-3 sm:p-4">
          <h2 id="week-stars" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <Flame className="w-4 h-4 text-orange-500" />
            Hafta yulduzlari — oxirgi 7 kunda eng ko&apos;p o&apos;sganlar
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {data.weekStars.map((e) => (
              <li
                key={e.userId}
                className={cn(
                  "stagger-item flex items-center gap-2.5 rounded-xl px-3 py-2",
                  e.isCurrentUser ? "bg-teal-500/10 ring-1 ring-teal-500/40" : "bg-slate-50 dark:bg-slate-800/50"
                )}
              >
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

      {session.role === "student" && (
        <section aria-label="Coin qanday yig'iladi" className="grid gap-2 sm:grid-cols-3">
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
        <RankTable entries={data.entries} />
      </section>
    </div>
  );
}
