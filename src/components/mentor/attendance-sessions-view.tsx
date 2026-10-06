"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  QrCode,
  Plus,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  CalendarClock,
  PencilLine,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { startAttendanceSessionAction, createManualSessionAction } from "@/actions/attendance.actions";
import { cn, formatDateUz, formatTimeUz } from "@/lib/utils";
import { AttendanceJournal } from "@/components/mentor/attendance-journal";
import { Select } from "@/components/ui/select";
import { hasLessonOn, isLessonNow, isValidSchedule, toDateKey } from "@/lib/schedule";

interface AttendanceSessionItem {
  _id: string;
  groupId: {
    _id: string;
    name: string;
    grade: number;
  };
  mentorId: {
    _id: string;
    fullName: string;
  };
  date: string;
  startTime: string;
  status: "active" | "closed";
  currentCode: string;
  defaultCoinsReward: number;
  summary?: {
    totalPresent: number;
    totalLate: number;
    totalExcused: number;
    totalAbsent: number;
  };
}

import { IGroupData } from "@/lib/db/models/group.model";

interface AttendanceSessionsViewProps {
  sessions: AttendanceSessionItem[];
  groups: IGroupData[];
}

export function AttendanceSessionsView({
  sessions,
  groups,
}: AttendanceSessionsViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isStartOpen, setIsStartOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    groups[0]?._id?.toString() || ""
  );
  const [coinsReward, setCoinsReward] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<"lessons" | "journal">("lessons");
  const [groupFilter, setGroupFilter] = useState("all");
  const [quickStartId, setQuickStartId] = useState<string | null>(null);

  // Qo'lda (QR'siz) davomat kiritish oynasi
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(() => toDateKey());
  const [isCreatingManual, setIsCreatingManual] = useState(false);

  const todayKey = toDateKey();
  const todaysGroups = groups
    .filter((g) => hasLessonOn(g.schedule))
    .sort((a, b) => (a.schedule?.startTime ?? "").localeCompare(b.schedule?.startTime ?? ""));
  const sessionsToday = (groupId: string) =>
    sessions.find((s) => s.groupId?._id === groupId && toDateKey(s.date) === todayKey);

  const startSession = async (groupId: string, reward: number) => {
    const res = await startAttendanceSessionAction(groupId, reward);
    if (res.success && res.data?.sessionId) {
      toast.success("Davomat sessiyasi ochildi!");
      router.push(`/mentor/attendance/${res.data.sessionId}`);
      return true;
    }
    toast.error(res.message || "Xatolik yuz berdi");
    return false;
  };

  const handleQuickStart = async (groupId: string) => {
    try {
      setQuickStartId(groupId);
      await startSession(groupId, 10);
    } catch {
      toast.error("Sessiyani boshlab bo'lmadi");
    } finally {
      setQuickStartId(null);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) return;
    try {
      setIsCreatingManual(true);
      const res = await createManualSessionAction({ groupId: selectedGroupId, dateKey: manualDate, coinsReward });
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

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) {
      toast.error("Guruhni tanlang");
      return;
    }

    try {
      setIsLoading(true);
      const res = await startAttendanceSessionAction(selectedGroupId, coinsReward);
      if (res.success && res.data?.sessionId) {
        toast.success("Davomat sessiyasi ochildi!");
        setIsStartOpen(false);
        router.push(`/mentor/attendance/${res.data.sessionId}`);
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Sessiyani boshlab bo'lmadi");
    } finally {
      setIsLoading(false);
    }
  };

  const activeSessions = sessions.filter((s) => s.status === "active");
  const closedSessions = sessions.filter(
    (s) => s.status === "closed" && (groupFilter === "all" || s.groupId?._id === groupFilter)
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <QrCode className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            Davomat tizimi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            QR kod va 6 belgili aylanuvchi kod orqali dars davomatini boshqarish
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setIsManualOpen(true)} className="gap-2 min-h-[44px]">
            <PencilLine className="w-4 h-4" />
            Qo&apos;lda kiritish
          </Button>
          <Button variant="primary" onClick={() => setIsStartOpen(true)} className="gap-2 min-h-[44px]">
            <Plus className="w-4 h-4" />
            Yangi davomat ochish
          </Button>
        </div>
      </div>

      {/* Bo'limlar */}
      <div role="tablist" className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/60">
        {([
          ["lessons", "Darslar"],
          ["journal", "Jurnal"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "px-5 min-h-[40px] rounded-xl text-sm font-semibold transition-all cursor-pointer",
              tab === id
                ? "bg-white dark:bg-surface text-teal-700 dark:text-teal-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "journal" && (
        <div className="page-enter">
          <AttendanceJournal groups={groups} />
        </div>
      )}

      {tab === "lessons" && (
      <div className="space-y-6 page-enter">
      {/* Bugungi jadval */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" />
          Bugungi darslar
        </h2>
        {todaysGroups.length === 0 ? (
          <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 text-sm text-slate-500 dark:text-slate-400">
            {groups.some((g) => isValidSchedule(g.schedule))
              ? "Bugun jadval bo'yicha dars yo'q."
              : "Guruhlarga dars jadvali belgilanmagan. Guruhlar sahifasida jadvalni kiriting yoki Excel'dan import qiling."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todaysGroups.map((g) => {
              const id = g._id.toString();
              const existing = sessionsToday(id);
              const live = isLessonNow(g.schedule);
              return (
                <div
                  key={id}
                  className={cn(
                    "p-4 rounded-2xl bg-white dark:bg-surface border shadow-xs flex items-center gap-3",
                    live && !existing
                      ? "border-teal-500/60 ring-2 ring-teal-500/15"
                      : "border-slate-200/80 dark:border-slate-800/80"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{g.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {g.schedule?.startTime}–{g.schedule?.endTime}
                      {live && <span className="ml-1.5 font-bold text-teal-700 dark:text-teal-300">· hozir</span>}
                    </div>
                  </div>
                  {existing ? (
                    <Link href={`/mentor/attendance/${existing._id}`}>
                      <Button variant="secondary" size="sm" className="min-h-[44px]">
                        {existing.status === "active" ? "Ekranni ochish" : "Davomatni ko'rish"}
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant={live ? "primary" : "outline"}
                      size="sm"
                      isLoading={quickStartId === id}
                      onClick={() => handleQuickStart(id)}
                      className="gap-1.5 min-h-[44px]"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Davomat ochish
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Sessions Banner */}
      {activeSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Ayni damda faol sessiyalar
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSessions.map((s) => (
              <div
                key={s._id}
                className="p-5 rounded-2xl bg-teal-500/10 border-2 border-teal-500/40 shadow-xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge variant="teal">Jonli davomat</Badge>
                    <span className="font-mono text-xs text-teal-700 dark:text-teal-300 font-bold">
                      Kod: {s.currentCode}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {s.groupId?.name} ({s.groupId?.grade}-sinf)
                  </h2>

                  <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 mt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      {formatTimeUz(s.startTime)} da boshlandi
                    </span>
                    <span className="flex items-center gap-1 font-bold text-teal-700 dark:text-teal-300">
                      <Users className="w-3.5 h-3.5" />
                      {s.summary?.totalPresent || 0} nafar keldi
                    </span>
                  </div>
                </div>

                <Link href={`/mentor/attendance/${s._id}`}>
                  <Button variant="primary" className="w-full justify-center gap-2 min-h-[44px]">
                    <ExternalLink className="w-4 h-4" />
                    <span>Proyektor ekranini ochish</span>
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Sessions List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            O&apos;tgan darslar davomati ({closedSessions.length})
          </h2>
          <div className="sm:w-56">
            <Select
              aria-label="Guruh bo'yicha saralash"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="all">Barcha guruhlar</option>
              {groups.map((g) => (
                <option key={g._id.toString()} value={g._id.toString()}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {closedSessions.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
            Hali yakunlangan davomatlar mavjud emas
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {closedSessions.map((s) => (
              <div
                key={s._id}
                className="p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {formatDateUz(s.date)}
                    </span>
                    <Badge variant="default">Yakunlangan</Badge>
                  </div>

                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {s.groupId?.name} ({s.groupId?.grade}-sinf)
                  </h2>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-2">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {s.summary?.totalPresent || 0} kelgan
                    </span>
                    {s.summary?.totalLate ? (
                      <span className="text-amber-600 dark:text-amber-400">{s.summary.totalLate} kechikkan</span>
                    ) : null}
                    {s.summary?.totalAbsent ? (
                      <span className="text-rose-500">
                        {s.summary.totalAbsent} kelmagan
                      </span>
                    ) : null}
                  </div>
                </div>

                <Link
                  href={`/mentor/attendance/${s._id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline min-h-[44px]"
                >
                  <span>Kim keldi, kim kelmadi</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      </div>
      )}

      {/* Manual (no QR) session modal */}
      <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>Davomatni qo&apos;lda kiritish</DialogTitle>
            <DialogDescription>
              QR ochilmagan yoki o&apos;tib ketgan dars uchun. Keyingi sahifada kelganlarni belgilab chiqasiz.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateManual} className="space-y-4">
            <Field htmlFor="manual-group" label="O'quv guruhi" required>
              <Select id="manual-group" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} required>
                {groups.map((g) => (
                  <option key={g._id.toString()} value={g._id.toString()}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>

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

      {/* Start Session Modal */}
      <Dialog open={isStartOpen} onOpenChange={setIsStartOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>Yangi davomat sessiyasi ochish</DialogTitle>
            <DialogDescription>
              Dars o&apos;tilayotgan guruhni tanlang. Proyektor ekrani avtomatik ochiladi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleStartSession} className="space-y-4">
            <Field htmlFor="session-group" label="O'quv guruhi" required>
              <select
                id="session-group"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-bg text-slate-900 dark:text-slate-100 text-sm min-h-[44px]"
                required
              >
                {groups.map((g) => (
                  <option key={g._id.toString()} value={g._id.toString()}>
                    {g.name} ({g.grade}-sinf)
                  </option>
                ))}
              </select>
            </Field>

            <Field
              htmlFor="coins-reward"
              label="Har bir o'quvchiga beriladigan coin"
              required
              hint="Standart: 10 coin"
            >
              <Input
                id="coins-reward"
                type="number"
                min={1}
                max={50}
                value={coinsReward}
                onChange={(e) => setCoinsReward(Number(e.target.value))}
                required
              />
            </Field>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsStartOpen(false)}
                disabled={isLoading}
              >
                Bekor qilish
              </Button>
              <Button type="submit" variant="primary" isLoading={isLoading}>
                Boshlash va Proyektorni ochish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
