"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, Trash2, CalendarClock, Pencil, Play, QrCode, Percent } from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createGroupAction, deleteGroupAction, updateGroupAction } from "@/actions/group.actions";
import { startAttendanceSessionAction, type GroupsAttendanceOverview } from "@/actions/attendance.actions";
import { ScheduleFields } from "@/components/mentor/schedule-fields";
import { formatSchedule, getTashkentParts, hasLessonOn, isLessonNow, isValidSchedule, GroupSchedule, ODD_DAYS } from "@/lib/schedule";
import { cn } from "@/lib/utils";

const DEFAULT_SCHEDULE: GroupSchedule = { days: ODD_DAYS, startTime: "15:00", endTime: "16:30" };

interface GroupsManagerProps {
  initialGroups: IGroupData[];
  attendance: GroupsAttendanceOverview;
}

function percentClass(percent: number) {
  if (percent >= 85) return "text-emerald-700 dark:text-emerald-400";
  if (percent >= 60) return "text-amber-700 dark:text-amber-400";
  return "text-rose-700 dark:text-rose-400";
}

export function GroupsManager({ initialGroups, attendance }: GroupsManagerProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<IGroupData[]>(initialGroups);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<IGroupData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number>(8);
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [schedule, setSchedule] = useState<GroupSchedule>(DEFAULT_SCHEDULE);

  // Jadvalni tahrirlash oynasi
  const [groupToEdit, setGroupToEdit] = useState<IGroupData | null>(null);
  const [editName, setEditName] = useState("");
  const [editSchedule, setEditSchedule] = useState<GroupSchedule>(DEFAULT_SCHEDULE);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { toast } = useToast();

  const totalStudents = groups.reduce((acc, g) => acc + (g.studentCount || 0), 0);

  // Bugun jadval bo'yicha darsi bor guruhlar, boshlanish vaqti tartibida
  const todaysGroups = groups
    .filter((g) => hasLessonOn(g.schedule))
    .sort((a, b) => (a.schedule?.startTime ?? "").localeCompare(b.schedule?.startTime ?? ""));
  // Bugungi tasmada ko'rinmaydigan ochiq sessiyalar (jadvaldan tashqari ochilgan)
  const todayIds = new Set(todaysGroups.map((g) => g._id.toString()));
  const otherActive = attendance.active.filter((s) => !todayIds.has(s.groupId));
  const [startingId, setStartingId] = useState<string | null>(null);

  const handleQuickStart = async (groupId: string) => {
    try {
      setStartingId(groupId);
      const res = await startAttendanceSessionAction(groupId);
      if (res.success && res.data?.sessionId) {
        toast.success("Davomat sessiyasi ochildi!");
        router.push(`/mentor/attendance/${res.data.sessionId}`);
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
        setStartingId(null);
      }
    } catch {
      toast.error("Sessiyani boshlab bo'lmadi");
      setStartingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setErrorMsg(null);
      if (!isValidSchedule(schedule)) {
        setErrorMsg("Dars kunlari va vaqtini to'g'ri belgilang");
        return;
      }
      const res = await createGroupAction({ name, grade, academicYear, isActive: true, schedule });
      if (res.success && res.data) {
        setGroups([...groups, res.data as IGroupData]);
        setIsCreateOpen(false);
        setName("");
        toast.success(`"${name}" guruhi muvaffaqiyatli yaratildi!`);
      } else {
        setErrorMsg(res.message || "Xatolik yuz berdi");
      }
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
    } finally {
      setIsLoading(false);
    }
  };

  const openEdit = (group: IGroupData) => {
    setGroupToEdit(group);
    setEditName(group.name);
    setEditSchedule(isValidSchedule(group.schedule) ? group.schedule : DEFAULT_SCHEDULE);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupToEdit) return;
    if (!isValidSchedule(editSchedule)) {
      toast.error("Dars kunlari va vaqtini to'g'ri belgilang");
      return;
    }
    try {
      setIsSavingEdit(true);
      const id = groupToEdit._id.toString();
      const res = await updateGroupAction(id, { name: editName.trim(), schedule: editSchedule });
      if (res.success && res.data) {
        setGroups(groups.map((g) => (g._id.toString() === id ? (res.data as IGroupData) : g)));
        toast.success("Guruh ma'lumotlari saqlandi");
        setGroupToEdit(null);
      } else {
        toast.error(res.message || "Saqlashda xatolik");
      }
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;
    try {
      setIsDeleting(true);
      const id = groupToDelete._id.toString();
      const res = await deleteGroupAction(id);
      if (res.success) {
        setGroups(groups.filter((g) => g._id.toString() !== id));
        toast.success(`"${groupToDelete.name}" guruhi o'chirildi`);
        setGroupToDelete(null);
      } else {
        toast.error(res.message || "Guruhni o'chirishda xatolik");
      }
    } catch {
      toast.error("Guruhni o'chirib bo'lmadi");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Guruhlar
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {groups.length} ta guruh · {totalStudents} nafar o&apos;quvchi · davomat har bir guruh ichida
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Yangi guruh qo&apos;shish
        </Button>
      </div>

      {/* Bugungi darslar: davomat shu yerdan bir bosishda boshlanadi */}
      {(todaysGroups.length > 0 || otherActive.length > 0) && (
        <section aria-labelledby="today-heading" className="space-y-3">
          <h2 id="today-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            Bugungi darslar
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {todaysGroups.map((g) => {
              const id = g._id.toString();
              const session = attendance.today[id] ?? attendance.active.find((s) => s.groupId === id);
              const isActive = attendance.active.some((s) => s.groupId === id);
              const live = isLessonNow(g.schedule);
              return (
                <div
                  key={id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-white dark:bg-surface px-4 py-3 shadow-xs",
                    isActive
                      ? "border-teal-500/60 bg-teal-50 dark:bg-teal-500/10"
                      : live && !session
                        ? "border-teal-500/60 ring-2 ring-teal-500/15"
                        : "border-slate-200/80 dark:border-slate-800/80"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/mentor/groups/${id}/attendance`}
                      className="block truncate font-bold text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300"
                    >
                      {g.name}
                    </Link>
                    <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                      {g.schedule?.startTime}–{g.schedule?.endTime}
                      {isActive ? (
                        <span className="ml-1.5 font-sans font-bold text-teal-700 dark:text-teal-300">· davomat ochiq</span>
                      ) : live ? (
                        <span className="ml-1.5 font-sans font-bold text-teal-700 dark:text-teal-300">· hozir</span>
                      ) : session ? (
                        <span className="ml-1.5 font-sans font-semibold text-emerald-700 dark:text-emerald-400">· davomat olingan</span>
                      ) : null}
                    </div>
                  </div>
                  {session ? (
                    <Link
                      href={`/mentor/attendance/${session._id}`}
                      className={buttonVariants({ variant: isActive ? "primary" : "secondary", size: "sm", className: "min-h-[44px] shrink-0" })}
                    >
                      {isActive ? "Davom ettirish" : "Ko'rish"}
                    </Link>
                  ) : live ? (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={startingId === id}
                      disabled={startingId !== null}
                      onClick={() => handleQuickStart(id)}
                      className="gap-1.5 min-h-[44px] shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Davomatni boshlash
                    </Button>
                  ) : (
                    // Davomat faqat dars vaqtida ochiladi
                    <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {g.schedule && getTashkentParts().minutes < Number(g.schedule.startTime.slice(0, 2)) * 60 + Number(g.schedule.startTime.slice(3))
                        ? "Hali boshlanmagan"
                        : "Dars tugagan"}
                    </span>
                  )}
                </div>
              );
            })}
            {otherActive.map((s) => (
              <div key={s._id} className="flex items-center gap-3 rounded-2xl border border-teal-500/60 bg-teal-50 dark:bg-teal-500/10 p-4 shadow-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-slate-900 dark:text-slate-100">{s.groupName}</div>
                  <div className="text-xs font-bold text-teal-700 dark:text-teal-300">Davomat ochiq · {s.present} nafar keldi</div>
                </div>
                <Link
                  href={`/mentor/attendance/${s._id}`}
                  className={buttonVariants({ variant: "primary", size: "sm", className: "min-h-[44px] shrink-0" })}
                >
                  Davom ettirish
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {groups.length > 0 && (
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Barcha guruhlar
        </h2>
      )}

      {/* Grid of groups */}
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group._id.toString()}
            className="group relative flex flex-col justify-between p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs hover:shadow-md hover:border-teal-500/40 transition-all"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <Badge variant="teal">{group.grade}-sinf</Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {group.academicYear}
                </span>
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                <Link
                  href={`/mentor/groups/${group._id.toString()}`}
                  className="hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                >
                  {group.name} guruhi
                </Link>
              </h3>

              <div className="flex items-center gap-2 mt-2 text-xs text-slate-600 dark:text-slate-300">
                <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>
                  <strong>{group.studentCount || 0}</strong> nafar o&apos;quvchi
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2 text-xs text-slate-600 dark:text-slate-300">
                <CalendarClock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className={isValidSchedule(group.schedule) ? "font-semibold" : "text-amber-600 dark:text-amber-400"}>
                  {formatSchedule(group.schedule)}
                </span>
              </div>

              {(() => {
                const percent = attendance.monthPercent[group._id.toString()];
                return (
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-600 dark:text-slate-300">
                    <Percent className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>
                      Shu oy davomati:{" "}
                      {typeof percent === "number" ? (
                        <strong className={cn("font-mono tabular-nums", percentClass(percent))}>{percent}%</strong>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">hali olinmagan</span>
                      )}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center">
              <button
                type="button"
                onClick={() => openEdit(group)}
                className="p-2.5 min-h-[44px] min-w-[44px] text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
                aria-label={`${group.name} guruhini tahrirlash`}
                title="Nom va jadvalni tahrirlash"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setGroupToDelete(group)}
                className="p-2.5 min-h-[44px] min-w-[44px] text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
                aria-label={`${group.name} guruhini o'chirish`}
                title="Guruhni o'chirish"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/mentor/groups/${group._id.toString()}`}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-[44px]" })}
                >
                  <Users className="w-4 h-4" />
                  O&apos;quvchilar
                </Link>
                <Link
                  href={`/mentor/groups/${group._id.toString()}/attendance`}
                  className={buttonVariants({ variant: "primary", size: "sm", className: "min-h-[44px]" })}
                >
                  <QrCode className="w-4 h-4" />
                  Davomat
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Group Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>Yangi o&apos;quv guruhi yaratish</DialogTitle>
            <DialogDescription>
              Guruh nomi va sinf darajasini belgilang
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {errorMsg && (
              <div className="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                {errorMsg}
              </div>
            )}

            <Field htmlFor="group-name" label="Guruh nomi" required hint="Masalan: XSH-25I0802">
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="masalan: XSH-25I0802"
                required
              />
            </Field>

            <Field htmlFor="group-grade" label="Sinf darajasi" required>
              <div className="flex items-center gap-4 pt-1">
                {[8, 9, 10, 11].map((g) => (
                  <label
                    key={g}
                    className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer min-h-[44px]"
                  >
                    <input
                      type="radio"
                      name="grade"
                      value={g}
                      checked={grade === g}
                      onChange={() => setGrade(g)}
                      className="accent-teal-600 w-4 h-4"
                    />
                    <span className="font-semibold">{g}-sinf</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field htmlFor="academic-year" label="O'quv yili" required>
              <Input
                id="academic-year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026-2027"
                required
              />
            </Field>

            <ScheduleFields idPrefix="create-schedule" value={schedule} onChange={setSchedule} />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCreateOpen(false)}
                disabled={isLoading}
              >
                Bekor qilish
              </Button>
              <Button type="submit" variant="primary" isLoading={isLoading}>
                Yaratish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Group (name + schedule) Modal */}
      <Dialog open={Boolean(groupToEdit)} onOpenChange={(open) => !open && setGroupToEdit(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>Guruhni tahrirlash</DialogTitle>
            <DialogDescription>Guruh nomi va dars jadvalini o&apos;zgartiring</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4">
            <Field htmlFor="edit-group-name" label="Guruh nomi" required>
              <Input
                id="edit-group-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </Field>

            <ScheduleFields idPrefix="edit-schedule" value={editSchedule} onChange={setEditSchedule} />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setGroupToEdit(null)}
                disabled={isSavingEdit}
              >
                Bekor qilish
              </Button>
              <Button type="submit" variant="primary" isLoading={isSavingEdit}>
                Saqlash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Safety Confirm Dialog for Deleting Group */}
      <ConfirmDialog
        isOpen={Boolean(groupToDelete)}
        onClose={() => setGroupToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Guruhni o'chirish"
        danger
        confirmText="Ha, butunlay o'chirish"
        confirmMatchString={groupToDelete?.name}
        isLoading={isDeleting}
        description={
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p>
              Haqiqatan ham <strong>&quot;{groupToDelete?.name}&quot;</strong> guruhini o&apos;chirmoqchimisiz?
            </p>
            <p className="text-rose-600 dark:text-rose-400 font-semibold">
              DIQQAT: Guruhdagi barcha o&apos;quvchilar va ularning natijalari bekor qilinishi mumkin.
            </p>
          </div>
        }
      />
    </div>
  );
}
