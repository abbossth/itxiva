"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Award,
  CalendarClock,
  ClipboardCheck,
  Coins,
  Crown,
  Flame,
  GraduationCap,
  Lock,
  Percent,
  Settings,
  Shield,
  Trophy,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordForm } from "@/components/auth/password-form";
import { TelegramSection } from "@/components/profile/telegram-section";
import { CelebrationSetting } from "@/components/profile/celebration-setting";
import { OwnPhoto } from "@/components/profile/own-photo";
import { StudentPersonalForm } from "@/components/students/student-personal-form";
import { StatTile } from "@/components/reports/report-parts";
import { LevelBadge, XpBar } from "@/components/gamification/level-badge";
import { levelFrame } from "@/components/quests/achievements-view";
import {
  ActivityTimeline,
  AttendancePanel,
  CoinHistory,
  GradesPanel,
  OrdersList,
  XpHistory,
  buildActivity,
  reportAverages,
} from "@/components/students/report-blocks";
import type { MyProfileData, StudentActivityItem } from "@/actions/student-profile.actions";
import type { TelegramStatus } from "@/actions/telegram.actions";
import { formatPercent, scoreTone } from "@/lib/score-tone";
import { cn, formatDateUz, formatNumberUz } from "@/lib/utils";

const QUEST_STATUS: Record<MyProfileData["quests"][number]["status"], { label: string; tone: StudentActivityItem["tone"] }> = {
  pending: { label: "tekshiruvga yuborildi", tone: "warning" },
  approved: { label: "tasdiqlandi", tone: "success" },
  rejected: { label: "rad etildi", tone: "danger" },
};

const RANK_TONE = ["", "text-amber-500", "text-slate-400", "text-orange-500"];

/** O'quvchining o'z profili: men, guruhim, natijalarim, tarixlar va sozlamalar */
export function MyProfileView({
  data,
  userId,
  fullName,
  login,
  telegram,
  celebrationsEnabled,
}: {
  data: MyProfileData;
  userId: string;
  fullName: string;
  login: string;
  telegram: TelegramStatus;
  celebrationsEnabled: boolean;
}) {
  const { report, group, gamification: g } = data;
  const { student, attendance } = report;
  const { homeworkAvg, quizAvg, examAvg } = reportAverages(report);

  const activity = useMemo(
    () =>
      buildActivity(
        report,
        data.quests.map((q) => ({
          at: q.at,
          label: `Topshiriq ${QUEST_STATUS[q.status].label}: ${q.title}`,
          detail: q.status === "approved" && q.coins > 0 ? `+${q.coins} coin` : "",
          tone: QUEST_STATUS[q.status].tone,
        }))
      ),
    [report, data.quests]
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-12 animate-in fade-in">
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
          <User className="w-7 h-7 text-teal-600 dark:text-teal-400" />
          Mening profilim
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Natijalarim, guruhim va barcha amallarim tarixi</p>
      </div>

      {/* Men: rasm, ism, daraja */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-teal-500/15 via-transparent to-amber-400/15" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="self-start">
            <OwnPhoto userId={userId} fullName={fullName} initialUrl={data.photoUrl} avatarClassName={g ? levelFrame(g.level) : undefined} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 break-words">{fullName}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              <span className="font-mono text-teal-700 dark:text-teal-300">@{login}</span>
              {group ? <span className="font-semibold">{group.name} guruhi</span> : <span>Guruhga biriktirilmagan</span>}
              {data.createdAt && <span>Platformada: {formatDateUz(data.createdAt)} dan</span>}
            </div>
            {g && (
              <div className="pt-2 max-w-md">
                <div className="flex items-center gap-3">
                  <LevelBadge level={g.level} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {g.level}-daraja · {g.levelName}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{formatNumberUz(g.xp)} XP</span>
                    </div>
                    <XpBar percent={g.percent} className="mt-1.5 h-2" />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {g.nextName ? (
                        <>
                          {g.nextName}gacha yana <strong className="text-teal-700 dark:text-teal-300">{formatNumberUz(g.toNext)} XP</strong>
                        </>
                      ) : (
                        "Eng yuqori darajadasiz!"
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={cn("grid grid-cols-2 gap-3", g ? "lg:grid-cols-5" : "lg:grid-cols-3")}>
        {g && <StatTile icon={Zap} label="Tajriba (XP)" value={formatNumberUz(g.xp)} hint={`${g.level}-daraja`} />}
        <StatTile icon={Coins} label="Jami coin" value={formatNumberUz(student.totalCoins)} hint="Hamma vaqt davomida" />
        <StatTile icon={Wallet} label="Balans" value={formatNumberUz(student.spendableBalance)} hint="Do'konda sarflash mumkin" />
        {g && (
          <StatTile
            icon={Flame}
            label="Kirish seriyasi"
            value={`${g.streak} kun`}
            hint={`Eng uzuni: ${g.bestStreak} kun${g.shields > 0 ? ` · himoya: ${g.shields}` : ""}`}
          />
        )}
        <div className={cn(g ? "col-span-2 lg:col-span-1" : "col-span-2 lg:col-span-1")}>
          <StatTile
            icon={Trophy}
            label="Guruhdagi o'rin"
            value={group?.myRank ? `${group.myRank}-o'rin` : "—"}
            hint={group ? `${group.students} o'quvchidan · ${data.unit} bo'yicha` : "Reyting yo'q"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Guruhim */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Guruhim
            </h2>
            <Link href="/leaderboard" className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline min-h-[32px] inline-flex items-center">
              Reyting
            </Link>
          </div>
          {!group ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Siz hali guruhga biriktirilmagansiz.</p>
          ) : (
            <>
              <div>
                <p className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{group.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {group.grade}-sinf · {group.academicYear} o&apos;quv yili · {group.students} o&apos;quvchi
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                  <dt className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <CalendarClock className="w-3.5 h-3.5" />
                    Dars jadvali
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{group.schedule || "Belgilanmagan"}</dd>
                </div>
                <div className={cn("rounded-xl p-3", group.nextLesson?.isNow ? "bg-teal-500/10" : "bg-slate-50 dark:bg-slate-800/50")}>
                  <dt className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <CalendarClock className="w-3.5 h-3.5" />
                    Keyingi dars
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{group.nextLesson?.label ?? "—"}</dd>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                  <dt className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <Percent className="w-3.5 h-3.5" />
                    Guruhning shu oydagi davomati
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatPercent(group.monthAttendance)}</dd>
                </div>
              </dl>

              {group.top.length > 0 && (
                <ol className="space-y-1.5">
                  {group.top.map((t, i) => (
                    <li
                      key={`${t.rank}-${t.name}`}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2",
                        t.isMe ? "bg-teal-500/10 ring-1 ring-teal-500/40" : "bg-slate-50 dark:bg-slate-800/40",
                        // O'quvchi uchlikdan pastda bo'lsa — alohida qatorda, oradan bo'shliq bilan
                        i === 3 && "mt-3"
                      )}
                    >
                      <span className={cn("w-7 shrink-0 text-center font-mono text-sm font-black", RANK_TONE[t.rank] ?? "text-slate-500")}>
                        {t.rank <= 3 ? <Crown className={cn("mx-auto w-4 h-4", RANK_TONE[t.rank])} /> : t.rank}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {t.name}
                        {t.isMe && <span className="ml-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">(siz)</span>}
                      </span>
                      <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300">
                        {formatNumberUz(t.value)} <span className="text-[10px] text-slate-500">{data.unit}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>

        {/* Natijalarim */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <GraduationCap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Natijalarim
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={Percent}
              label="Davomat"
              value={formatPercent(attendance.percent)}
              tone={scoreTone(attendance.percent)}
              hint={`${attendance.records.length} dars · ${attendance.counts.absent} ta qoldirilgan`}
            />
            <StatTile
              icon={ClipboardCheck}
              label="Vazifalar"
              value={homeworkAvg === null ? "—" : homeworkAvg}
              tone={scoreTone(homeworkAvg)}
              hint={`${report.homework.length} ta · o'rtacha ball`}
            />
            <StatTile icon={GraduationCap} label="Testlar" value={formatPercent(quizAvg)} tone={scoreTone(quizAvg)} hint={`${report.quizzes.length} ta test`} />
            <StatTile icon={Shield} label="Imtihonlar" value={formatPercent(examAvg)} tone={scoreTone(examAvg)} hint={`${report.exams.length} ta urinish`} />
          </div>
          {g && (
            <Link
              href="/achievements"
              className="flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-3.5 hover:shadow-card transition-shadow"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
                <Award className="w-5 h-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">Nishonlarim: {g.badges} / {g.badgeTotal}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">Darajalar, nishonlar va o&apos;qish yo&apos;li — Yutuqlarim sahifasida</span>
              </span>
            </Link>
          )}
        </section>
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Amallar tarixi</TabsTrigger>
          <TabsTrigger value="coins">Coin tarixi</TabsTrigger>
          {g && <TabsTrigger value="xp">XP tarixi</TabsTrigger>}
          <TabsTrigger value="grades">Baholar</TabsTrigger>
          <TabsTrigger value="attendance">Davomat</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <ActivityTimeline items={activity} description="Davomat, vazifalar, testlar, topshiriqlar va xaridlar — yangisidan eskisiga" />
        </TabsContent>

        <TabsContent value="coins" className="space-y-4">
          <CoinHistory ledger={report.ledger} balance={student.spendableBalance} csvName={login} />
          <OrdersList orders={report.orders} />
        </TabsContent>

        {g && (
          <TabsContent value="xp">
            <XpHistory rows={report.xpHistory} xp={g.xp} />
          </TabsContent>
        )}

        <TabsContent value="grades">
          <GradesPanel report={report} homeworkHref={(id) => `/lessons/${id}#homework`} />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendancePanel attendance={attendance} />
        </TabsContent>
      </Tabs>

      {/* Sozlamalar */}
      <section aria-labelledby="settings-heading" className="space-y-3 pt-4">
        <h2 id="settings-heading" className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-slate-100">
          <Settings className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Sozlamalar
        </h2>

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
            <User className="w-4 h-4" />
            Shaxsiy ma&apos;lumotlarim
          </h3>
          <StudentPersonalForm
            // Saqlangach yoki mentor ruxsatni o'zgartirgach forma yangi holatda ochiladi
            key={JSON.stringify(data.personal) + data.canEdit}
            mode="student"
            personal={data.personal}
            locked={!data.canEdit}
          />
        </div>

        <TelegramSection initial={telegram} role="student" />

        <CelebrationSetting initialEnabled={celebrationsEnabled} />

        <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Parolni yangilash</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            Parol almashtirilgach, boshqa qurilmalarda ochiq qolgan sessiyalar avtomatik yopiladi.
          </p>
          <PasswordForm requireCurrent idPrefix="profile" submitLabel="Parolni saqlash" className="max-w-md" buttonClassName="font-semibold" />
        </div>
      </section>
    </div>
  );
}
