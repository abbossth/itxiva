"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  ClipboardCheck,
  Coins,
  GraduationCap,
  KeyRound,
  Loader2,
  Percent,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ReportSection, ScoreBar, StatTile } from "@/components/reports/report-parts";
import { ResetPasswordModal } from "@/components/mentor/reset-password-modal";
import { StudentPersonalForm } from "@/components/students/student-personal-form";
import { setStudentPhotoAction, type StudentActivityItem, type StudentProfileData } from "@/actions/student-profile.actions";
import { uploadFileToStorage } from "@/lib/upload-client";
import { ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER, formatCoinDelta } from "@/lib/attendance-status";
import { COIN_TYPE_COLORS, COIN_TYPE_LABELS } from "@/lib/coin-types";
import { HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS } from "@/lib/homework-status";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { SCORE_TONE, formatPercent, scoreTone } from "@/lib/score-tone";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDateTimeUz, formatDateUz } from "@/lib/utils";
import type { CoinTransactionType } from "@/lib/db/models/coin-ledger.model";

const empty = (text: string) => <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">{text}</p>;
const percentOf = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : null);
const average = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

const TONE_DOT: Record<StudentActivityItem["tone"], string> = {
  success: "bg-emerald-500",
  teal: "bg-teal-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  default: "bg-slate-400",
};

type LedgerFilter = "all" | "in" | "out";

export function StudentProfileView({ profile }: { profile: StudentProfileData }) {
  const { report, personal } = profile;
  const { student, attendance } = report;
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  const [ledgerType, setLedgerType] = useState<CoinTransactionType | "">("");

  const homeworkAvg = average(report.homework.filter((h) => h.status === "graded" && h.score !== null).map((h) => h.score as number));
  const quizAvg = average(report.quizzes.flatMap((q) => percentOf(q.totalScore, q.maxScore) ?? []));
  const examAvg = average(
    report.exams.filter((e) => e.status === "graded").flatMap((e) => percentOf(e.totalScore, e.maxScore) ?? [])
  );

  // Coinlar: manba bo'yicha kirim va chiqim
  const coinStats = useMemo(() => {
    let earned = 0;
    let lost = 0;
    const byType = new Map<CoinTransactionType, { plus: number; minus: number }>();
    for (const l of report.ledger) {
      if (l.amount >= 0) earned += l.amount;
      else lost += -l.amount;
      const t = byType.get(l.type) ?? { plus: 0, minus: 0 };
      if (l.amount >= 0) t.plus += l.amount;
      else t.minus += -l.amount;
      byType.set(l.type, t);
    }
    return { earned, lost, byType: [...byType.entries()].sort((a, b) => b[1].plus + b[1].minus - (a[1].plus + a[1].minus)) };
  }, [report.ledger]);

  const ledgerRows = report.ledger.filter(
    (l) =>
      (ledgerFilter === "all" || (ledgerFilter === "in" ? l.amount > 0 : l.amount < 0)) && (!ledgerType || l.type === ledgerType)
  );

  // Faoliyat tasmasi: o'quvchining o'z harakatlari va mentor amallari bitta ro'yxatda
  const activity = useMemo(() => {
    const items: StudentActivityItem[] = [...profile.mentorActions];
    for (const r of attendance.records) {
      items.push({
        at: r.date,
        label: `Davomat: ${ATTENDANCE_STATUS_META[r.status].label}`,
        detail: r.notes,
        tone: r.status === "present" ? "success" : r.status === "absent" ? "danger" : "warning",
      });
    }
    for (const h of report.homework) {
      if (!h.submittedAt) continue;
      items.push({
        at: h.submittedAt,
        label: h.status === "graded" ? `Vazifa baholandi: ${h.score} ball` : "Vazifa topshirdi",
        detail: h.title + (h.isLate ? " · kechikib" : ""),
        tone: h.isLate ? "warning" : "teal",
      });
    }
    for (const q of report.quizzes) {
      if (!q.submittedAt) continue;
      items.push({ at: q.submittedAt, label: `Test topshirdi: ${q.totalScore} / ${q.maxScore}`, detail: q.title, tone: "teal" });
    }
    for (const e of report.exams) {
      if (!e.submittedAt) continue;
      items.push({
        at: e.submittedAt,
        label: `Imtihon topshirdi: ${e.totalScore} / ${e.maxScore}`,
        detail: e.title,
        tone: e.status === "graded" ? (e.isPassed ? "success" : "danger") : "teal",
      });
    }
    for (const o of report.orders) {
      if (!o.createdAt) continue;
      items.push({
        at: o.createdAt,
        label: `Do'kondan buyurtma: ${o.productTitle}`,
        detail: `${o.price} coin · ${ORDER_STATUS_LABELS[o.status]}`,
        tone: "default",
      });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150);
  }, [profile.mentorActions, attendance.records, report.homework, report.quizzes, report.exams, report.orders]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Faqat rasm fayli tanlang");
      return;
    }
    try {
      setPhotoBusy(true);
      const uploaded = await uploadFileToStorage(file, { avatarStudentId: student._id });
      const res = await setStudentPhotoAction(student._id, uploaded.key);
      if (res.success) {
        setPhotoUrl(res.data?.photoUrl ?? null);
        toast.success(res.message || "Rasm saqlandi");
        router.refresh();
      } else {
        toast.error(res.message || "Rasmni saqlab bo'lmadi");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rasmni yuklab bo'lmadi");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    try {
      setPhotoBusy(true);
      const res = await setStudentPhotoAction(student._id, null);
      if (res.success) {
        setPhotoUrl(null);
        toast.success(res.message || "Rasm olib tashlandi");
        router.refresh();
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl pb-12">
      <PageHeader
        title="O'quvchi profili"
        backHref={profile.groupId ? `/mentor/groups/${profile.groupId}` : "/mentor/groups"}
        backLabel={student.groupName ? `${student.groupName} guruhiga qaytish` : "Guruhlarga qaytish"}
        className="border-b-0 pb-0"
      />

      {/* Sarlavha kartasi: rasm, ism, holat */}
      <section className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative shrink-0 self-start">
          <Avatar src={photoUrl} name={student.fullName} size="xl" className="w-24 h-24 text-3xl rounded-3xl" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            aria-label={photoUrl ? "Rasmni almashtirish" : "Rasm qo'yish"}
            title={photoUrl ? "Rasmni almashtirish" : "Rasm qo'yish"}
            className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white shadow-md hover:bg-teal-700 cursor-pointer disabled:opacity-60"
          >
            {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 break-words">
            {student.fullName}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            <span className="font-mono text-teal-700 dark:text-teal-300">@{student.login}</span>
            {student.groupName && profile.groupId ? (
              <Link href={`/mentor/groups/${profile.groupId}`} className="font-semibold hover:underline">
                {student.groupName}
              </Link>
            ) : (
              <span>Guruhsiz</span>
            )}
            <span>Oxirgi kirish: {student.lastLoginAt ? formatDateTimeUz(student.lastLoginAt) : "hali kirmagan"}</span>
            {profile.createdAt && <span>Qo&apos;shilgan: {formatDateUz(profile.createdAt)}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Badge variant={profile.telegramLinked ? "success" : "secondary"} className="gap-1">
              <Send className="w-3 h-3" />
              {profile.telegramLinked ? "Telegram ulangan" : "Telegram ulanmagan"}
            </Badge>
            {profile.mustChangePassword && <Badge variant="warning">Vaqtinchalik parolda</Badge>}
            {personal.phone && <Badge variant="outline">{personal.phone}</Badge>}
          </div>
        </div>

        <div className="flex sm:flex-col gap-2 shrink-0">
          <Button variant="secondary" size="sm" className="gap-1.5 min-h-[40px]" onClick={() => setResetOpen(true)}>
            <KeyRound className="w-4 h-4" />
            Parolni tiklash
          </Button>
          {photoUrl && (
            <Button variant="ghost" size="sm" className="gap-1.5 min-h-[40px]" onClick={removePhoto} disabled={photoBusy}>
              <Trash2 className="w-4 h-4" />
              Rasmni olib tashlash
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          icon={Percent}
          label="Davomat"
          value={formatPercent(attendance.percent)}
          tone={scoreTone(attendance.percent)}
          hint={`${attendance.records.length} dars · ${attendance.counts.absent} ta qoldirgan`}
        />
        <StatTile
          icon={ClipboardCheck}
          label="Vazifalar"
          value={homeworkAvg === null ? "—" : homeworkAvg}
          tone={scoreTone(homeworkAvg)}
          hint={`${report.homework.length} ta topshirgan · o'rtacha ball`}
        />
        <StatTile
          icon={GraduationCap}
          label="Testlar"
          value={formatPercent(quizAvg)}
          tone={scoreTone(quizAvg)}
          hint={`${report.quizzes.length} ta test${examAvg === null ? "" : ` · imtihon ${examAvg}%`}`}
        />
        <StatTile icon={Coins} label="Jami coin" value={student.totalCoins} hint="Reyting uchun" />
        <div className="col-span-2 lg:col-span-1">
          <StatTile icon={Wallet} label="Balans" value={student.spendableBalance} hint="Sarflash mumkin" />
        </div>
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Shaxsiy ma&apos;lumotlar</TabsTrigger>
          <TabsTrigger value="coins">Coinlar</TabsTrigger>
          <TabsTrigger value="attendance">Davomat</TabsTrigger>
          <TabsTrigger value="grades">Baholar</TabsTrigger>
          <TabsTrigger value="activity">Faoliyat</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <StudentPersonalForm mode="mentor" studentId={student._id} fullName={student.fullName} personal={personal} />
        </TabsContent>

        <TabsContent value="coins" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile icon={Coins} label="Olgan" value={`+${coinStats.earned}`} tone="good" />
            <StatTile icon={Coins} label="Yechilgan / sarflagan" value={coinStats.lost === 0 ? "0" : `−${coinStats.lost}`} tone={coinStats.lost > 0 ? "low" : "none"} />
            <div className="col-span-2 sm:col-span-1">
              <StatTile icon={Wallet} label="Hozirgi balans" value={student.spendableBalance} />
            </div>
          </div>

          <ReportSection title="Nima uchun olgan va nimaga ketgan" description="Manbalar bo'yicha (oxirgi 300 ta amal)">
            {coinStats.byType.length === 0 ? (
              empty("Coin harakati yo'q")
            ) : (
              <ul className="space-y-2.5">
                {coinStats.byType.map(([type, v]) => {
                  const total = Math.max(1, coinStats.earned + coinStats.lost);
                  return (
                    <li key={type} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{COIN_TYPE_LABELS[type]}</span>
                        <span className="font-bold tabular-nums">
                          {v.plus > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{v.plus}</span>}
                          {v.plus > 0 && v.minus > 0 && <span className="text-slate-400"> · </span>}
                          {v.minus > 0 && <span className="text-rose-700 dark:text-rose-400">−{v.minus}</span>}
                        </span>
                      </div>
                      <div className="flex h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className={cn("h-full", COIN_TYPE_COLORS[type].bar)} style={{ width: `${(v.plus / total) * 100}%` }} />
                        <div className="h-full bg-rose-500/70" style={{ width: `${(v.minus / total) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ReportSection>

          <ReportSection
            title="Coinlar tarixi"
            description={`${ledgerRows.length} ta amal`}
            onExport={() =>
              downloadCsv(
                `${student.login}_coinlar.csv`,
                ["Sana", "Manba", "Sabab", "Miqdor", "Balans"],
                ledgerRows.map((l) => [
                  l.createdAt ? formatDateTimeUz(l.createdAt) : "",
                  COIN_TYPE_LABELS[l.type],
                  l.description,
                  l.amount,
                  l.balanceAfter ?? "",
                ])
              )
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", "Hammasi"],
                  ["in", "Olgan"],
                  ["out", "Yechilgan"],
                ] as [LedgerFilter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={ledgerFilter === id}
                  onClick={() => setLedgerFilter(id)}
                  className={cn(
                    "px-3 min-h-[36px] rounded-lg text-xs font-semibold cursor-pointer transition-colors",
                    ledgerFilter === id
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  {label}
                </button>
              ))}
              <select
                aria-label="Manba"
                value={ledgerType}
                onChange={(e) => setLedgerType(e.target.value as CoinTransactionType | "")}
                className="ml-auto px-3 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-bg text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <option value="">Barcha manbalar</option>
                {coinStats.byType.map(([type]) => (
                  <option key={type} value={type}>
                    {COIN_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            {ledgerRows.length === 0 ? (
              empty("Bu filtr bo'yicha amal yo'q")
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[32rem] overflow-y-auto pr-1">
                {ledgerRows.map((l, i) => (
                  <li key={i} className="py-2.5 flex items-center gap-3">
                    <span
                      className={cn(
                        "shrink-0 w-14 text-center py-1 rounded-lg text-sm font-black tabular-nums",
                        l.amount > 0 ? SCORE_TONE.good.soft : l.amount < 0 ? SCORE_TONE.low.soft : SCORE_TONE.none.soft
                      )}
                    >
                      {formatCoinDelta(l.amount)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-800 dark:text-slate-200 break-words">{l.description}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className={cn("px-1.5 py-0.5 rounded-md font-semibold", COIN_TYPE_COLORS[l.type].soft)}>
                          {COIN_TYPE_LABELS[l.type]}
                        </span>
                        {l.createdAt && <span>{formatDateTimeUz(l.createdAt)}</span>}
                      </span>
                    </span>
                    {l.balanceAfter !== null && (
                      <span className="shrink-0 text-right text-[11px] text-slate-500 dark:text-slate-400">
                        balans
                        <span className="block text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">{l.balanceAfter}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

          <ReportSection title="Do'kon buyurtmalari">
            {report.orders.length === 0 ? (
              empty("Buyurtma bermagan")
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {report.orders.map((o, i) => (
                  <li key={i} className="py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-700 dark:text-slate-200">{o.productTitle}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {o.createdAt ? formatDateUz(o.createdAt) : ""} · {o.price} coin
                      </span>
                    </span>
                    <Badge variant={ORDER_STATUS_BADGE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <ReportSection
            title="Davomat"
            description="Katakcha ustiga bosilsa o'sha dars davomati ochiladi"
            onExport={() =>
              downloadCsv(
                `${student.login}_davomat.csv`,
                ["Sana", "Holat", "Izoh"],
                attendance.records.map((r) => [formatDateUz(r.date), ATTENDANCE_STATUS_META[r.status].label, r.notes])
              )
            }
          >
            <ScoreBar percent={attendance.percent} label="Qatnashish ulushi (sababli qoldirilganlar hisobga olinmaydi)" />
            <div className="flex flex-wrap gap-1.5">
              {ATTENDANCE_STATUS_ORDER.map((s) => (
                <span key={s} className={cn("px-2 py-1 rounded-md text-[11px] font-bold", ATTENDANCE_STATUS_META[s].className)}>
                  {ATTENDANCE_STATUS_META[s].label}: {attendance.counts[s]}
                </span>
              ))}
            </div>
            {attendance.records.length === 0 ? (
              empty("Hali davomat yozuvi yo'q")
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {attendance.records.map((r) => (
                  <Link
                    key={r.sessionId}
                    href={`/mentor/attendance/${r.sessionId}`}
                    title={`${formatDateUz(r.date)} — ${ATTENDANCE_STATUS_META[r.status].label}${r.notes ? ` (${r.notes})` : ""}`}
                    className={cn(
                      "flex flex-col items-center justify-center w-14 h-12 rounded-xl text-[10px] font-semibold hover:ring-2 hover:ring-teal-500/40 transition-shadow",
                      ATTENDANCE_STATUS_META[r.status].className
                    )}
                  >
                    <span className="text-sm font-black leading-none">{ATTENDANCE_STATUS_META[r.status].short}</span>
                    <span className="mt-0.5 opacity-80">{formatDateUz(r.date).split(",")[0]}</span>
                  </Link>
                ))}
              </div>
            )}
          </ReportSection>

          {attendance.records.some((r) => r.notes) && (
            <ReportSection title="Izohlar" description="Mentor davomatga yozgan izohlar">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {attendance.records
                  .filter((r) => r.notes)
                  .map((r) => (
                    <li key={r.sessionId} className="py-2 flex items-start gap-3">
                      <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold", ATTENDANCE_STATUS_META[r.status].className)}>
                        {formatDateUz(r.date).split(",")[0]}
                      </span>
                      <span className="text-slate-700 dark:text-slate-200">{r.notes}</span>
                    </li>
                  ))}
              </ul>
            </ReportSection>
          )}
        </TabsContent>

        <TabsContent value="grades" className="space-y-4">
          <ReportSection title="Uyga vazifalar" description={homeworkAvg === null ? undefined : `O'rtacha ball: ${homeworkAvg} / 100`}>
            {report.homework.length === 0 ? (
              empty("Hali vazifa topshirmagan")
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {report.homework.map((h) => (
                  <li key={h.lessonId} className="py-2 flex items-center justify-between gap-3">
                    <Link
                      href={`/mentor/homework/${h.lessonId}`}
                      className="min-w-0 truncate text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
                    >
                      {h.title}
                    </Link>
                    <span className="shrink-0 flex items-center gap-2">
                      {h.isLate && <Badge variant="danger">Kechikkan</Badge>}
                      {h.status === "graded" && h.score !== null ? (
                        <ScorePill percent={h.score} text={`${h.score} / 100`} />
                      ) : (
                        <Badge variant={HOMEWORK_STATE_BADGE[h.status]}>{HOMEWORK_STATE_LABELS[h.status]}</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportSection title="Testlar (quiz)" description={quizAvg === null ? undefined : `O'rtacha natija: ${quizAvg}%`}>
              {report.quizzes.length === 0 ? (
                empty("Hali test topshirmagan")
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {report.quizzes.map((q, i) => (
                    <li key={i} className="py-2 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{q.title}</span>
                      <ScorePill percent={percentOf(q.totalScore, q.maxScore)} text={`${q.totalScore} / ${q.maxScore}`} />
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>

            <ReportSection title="Imtihonlar" description={examAvg === null ? undefined : `O'rtacha natija: ${examAvg}%`}>
              {report.exams.length === 0 ? (
                empty("Hali imtihon topshirmagan")
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {report.exams.map((e, i) => (
                    <li key={i} className="py-2 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{e.title}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        {e.status === "graded" ? (
                          <Badge variant={e.isPassed ? "success" : "danger"}>{e.isPassed ? "O'tdi" : "O'tmadi"}</Badge>
                        ) : (
                          <Badge variant="warning">Tekshirilmoqda</Badge>
                        )}
                        <ScorePill
                          percent={e.status === "graded" ? percentOf(e.totalScore, e.maxScore) : null}
                          text={`${e.totalScore} / ${e.maxScore}`}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <ReportSection title="Faoliyat tarixi" description="Davomat, topshiriqlar, xaridlar va mentor amallari — yangisidan eskisiga">
            {activity.length === 0 ? (
              empty("Hali faoliyat yo'q")
            ) : (
              <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-800 space-y-4 py-1">
                {activity.map((a, i) => (
                  <li key={i} className="relative pl-5">
                    <span className={cn("absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-surface", TONE_DOT[a.tone])} />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{a.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTimeUz(a.at)}
                      {a.detail ? ` · ${a.detail}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </ReportSection>
        </TabsContent>
      </Tabs>

      <ResetPasswordModal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        student={resetOpen ? { _id: student._id, fullName: student.fullName, login: student.login } : null}
      />
    </div>
  );
}

function ScorePill({ percent, text }: { percent: number | null; text: string }) {
  return (
    <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums", SCORE_TONE[scoreTone(percent)].soft)}>
      {text}
    </span>
  );
}
