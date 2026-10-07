"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, PencilLine, QrCode } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { AttendanceJournal } from "@/components/mentor/attendance-journal";
import { startAttendanceSessionAction, createManualSessionAction } from "@/actions/attendance.actions";
import { toDateKey, isLessonNow, getNextLesson, formatSchedule, type GroupSchedule } from "@/lib/schedule";
import { ATTENDANCE_COINS, ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER, formatCoinDelta } from "@/lib/attendance-status";
import { formatTimeUz } from "@/lib/utils";

interface GroupAttendanceViewProps {
  groupId: string;
  schedule: GroupSchedule | null;
  activeSession: { _id: string; startTime: string; present: number } | null;
  todaySession: { _id: string; status: "active" | "closed" } | null;
}

export function GroupAttendanceView({ groupId, schedule, activeSession, todaySession }: GroupAttendanceViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const todayKey = toDateKey();

  const [isStarting, setIsStarting] = useState(false);
  // Davomat faqat dars vaqtida ochiladi (server ham shuni tekshiradi)
  const canStart = isLessonNow(schedule);
  const nextLesson = getNextLesson(schedule);

  // Qo'lda (QR'siz) davomat kiritish oynasi
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(todayKey);
  const [isCreatingManual, setIsCreatingManual] = useState(false);

  const handleStart = async () => {
    try {
      setIsStarting(true);
      const res = await startAttendanceSessionAction(groupId);
      if (res.success && res.data?.sessionId) {
        toast.success("Davomat sessiyasi ochildi!");
        router.push(`/mentor/attendance/${res.data.sessionId}`);
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Sessiyani boshlab bo'lmadi");
    } finally {
      setIsStarting(false);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreatingManual(true);
      const res = await createManualSessionAction({ groupId, dateKey: manualDate });
      if (res.success && res.data?.sessionId) {
        if (res.message) toast.info(res.message);
        router.push(`/mentor/attendance/${res.data.sessionId}`);
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Davomatni yaratib bo'lmadi");
    } finally {
      setIsCreatingManual(false);
    }
  };

  const manualButton = (
    <Button variant="secondary" onClick={() => setIsManualOpen(true)} className="gap-2 min-h-[44px]">
      <PencilLine className="w-4 h-4" />
      Qo&apos;lda kiritish
    </Button>
  );

  return (
    <div className="space-y-5 page-enter">
      {activeSession ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-teal-500/50 bg-teal-50 dark:bg-teal-500/10 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <QrCode className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Davomat hozir ochiq</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {formatTimeUz(activeSession.startTime)} da boshlandi · {activeSession.present} nafar keldi
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/mentor/attendance/${activeSession._id}`} className={buttonVariants({ variant: "primary" })}>
              <ExternalLink className="w-4 h-4" />
              Ekranni ochish
            </Link>
            {manualButton}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {todaySession?.status === "closed" ? (
            <Link href={`/mentor/attendance/${todaySession._id}`} className={buttonVariants({ variant: "primary" })}>
              Bugungi davomatni ochish
            </Link>
          ) : (
            <Button
              variant="primary"
              onClick={handleStart}
              isLoading={isStarting}
              disabled={!canStart}
              className="gap-2 min-h-[44px]"
            >
              <QrCode className="w-4 h-4" />
              Davomatni boshlash
            </Button>
          )}
          {manualButton}
          <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 px-1">
            {todaySession?.status === "closed"
              ? "Bugungi dars davomati olingan."
              : canStart
                ? "Dars vaqti — QR va kod ekrani ochiladi."
                : nextLesson
                  ? `Davomat faqat dars vaqtida ochiladi. Keyingi dars: ${nextLesson.label}.`
                  : "Guruhga dars jadvali belgilanmagan."}
          </span>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-semibold">Coin:</span>
        {ATTENDANCE_STATUS_ORDER.map((st) => (
          <span key={st}>
            {ATTENDANCE_STATUS_META[st].label.toLowerCase()}{" "}
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{formatCoinDelta(ATTENDANCE_COINS[st])}</span>
          </span>
        ))}
      </p>

      <AttendanceJournal groupId={groupId} onManualEntry={() => setIsManualOpen(true)} />

      <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>Davomatni qo&apos;lda kiritish</DialogTitle>
            <DialogDescription>
              QR ochilmagan yoki o&apos;tib ketgan dars uchun. Faqat jadvaldagi dars kuni tanlanadi ({formatSchedule(schedule)}),
              bir kunga bitta davomat.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateManual} className="space-y-4">
            <Field htmlFor="manual-date" label="Dars sanasi" required>
              <Input
                id="manual-date"
                type="date"
                max={todayKey}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                required
              />
            </Field>
            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsManualOpen(false)} disabled={isCreatingManual}>
                Bekor qilish
              </Button>
              <Button type="submit" variant="primary" isLoading={isCreatingManual}>
                Davom etish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
