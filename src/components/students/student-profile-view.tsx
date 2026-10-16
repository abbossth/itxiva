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
import { ReportSection, StatTile } from "@/components/reports/report-parts";
import {
  ActivityTimeline,
  AttendancePanel,
  CoinHistory,
  GradesPanel,
  OrdersList,
  buildActivity,
  reportAverages,
} from "@/components/students/report-blocks";
import { ResetPasswordModal } from "@/components/mentor/reset-password-modal";
import { StudentPersonalForm } from "@/components/students/student-personal-form";
import { setStudentPhotoAction, type StudentProfileData } from "@/actions/student-profile.actions";
import { uploadFileToStorage } from "@/lib/upload-client";
import { ATTENDANCE_STATUS_META } from "@/lib/attendance-status";
import { formatPercent, scoreTone } from "@/lib/score-tone";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDateTimeUz, formatDateUz } from "@/lib/utils";

export function StudentProfileView({ profile }: { profile: StudentProfileData }) {
  const { report, personal } = profile;
  const { student, attendance } = report;
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const { homeworkAvg, quizAvg, examAvg } = reportAverages(report);
  // Faoliyat tasmasi: o'quvchining o'z harakatlari va mentor amallari bitta ro'yxatda
  const activity = useMemo(() => buildActivity(report, profile.mentorActions), [report, profile.mentorActions]);

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
              <Link href={`/mentor/groups/${profile.groupId}`} className="font-semibold hover:underline py-2 -my-2">
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
          <CoinHistory ledger={report.ledger} balance={student.spendableBalance} csvName={student.login} />
          <OrdersList orders={report.orders} />
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <AttendancePanel
            attendance={attendance}
            sessionHref={(id) => `/mentor/attendance/${id}`}
            onExport={() =>
              downloadCsv(
                `${student.login}_davomat.csv`,
                ["Sana", "Holat", "Izoh"],
                attendance.records.map((r) => [formatDateUz(r.date), ATTENDANCE_STATUS_META[r.status].label, r.notes])
              )
            }
          />

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

        <TabsContent value="grades">
          <GradesPanel report={report} homeworkHref={(id) => `/mentor/homework/${id}`} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTimeline items={activity} description="Davomat, topshiriqlar, xaridlar va mentor amallari — yangisidan eskisiga" />
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
