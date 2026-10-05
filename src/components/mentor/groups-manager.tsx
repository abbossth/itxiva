"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Users, ArrowRight, Trash2, GraduationCap, School } from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createGroupAction, deleteGroupAction } from "@/actions/group.actions";

interface GroupsManagerProps {
  initialGroups: IGroupData[];
}

export function GroupsManager({ initialGroups }: GroupsManagerProps) {
  const [groups, setGroups] = useState<IGroupData[]>(initialGroups);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<IGroupData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number>(8);
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { toast } = useToast();

  const totalStudents = groups.reduce((acc, g) => acc + (g.studentCount || 0), 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await createGroupAction({ name, grade, academicYear, isActive: true });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Guruhlar boshqaruvi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Muhammad al-Xorazmiy nomidagi ixtisoslashtirilgan maktab sinflari
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

      {/* "Bugun" Summary Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <School className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {groups.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Faol o&apos;quv guruhlari
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {totalStudents}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Jami o&apos;quvchilar soni
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              2026-2027
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Joriy o&apos;quv yili
            </div>
          </div>
        </div>
      </div>

      {/* Grid of groups */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group._id.toString()}
            className="group relative flex flex-col justify-between p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] shadow-xs hover:shadow-md hover:border-teal-500/40 transition-all"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <Badge variant="teal">{group.grade}-sinf</Badge>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                  {group.academicYear}
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                {group.name} guruhi
              </h3>

              <div className="flex items-center gap-2 mt-3 text-xs text-slate-600 dark:text-slate-300">
                <Users className="w-4 h-4 text-slate-400" />
                <span>
                  <strong>{group.studentCount || 0}</strong> nafar o&apos;quvchi
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 mt-5 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setGroupToDelete(group)}
                className="p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
                aria-label={`${group.name} guruhini o'chirish`}
                title="Guruhni o'chirish"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <Link
                href={`/mentor/groups/${group._id.toString()}`}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 hover:underline min-h-[44px] px-2 py-2"
              >
                O&apos;quvchilar va boshqaruv
                <ArrowRight className="w-4 h-4" />
              </Link>
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

            <Field id="group-name" label="Guruh nomi" required hint="Masalan: 8-A, 8-B, 9-A, 11-A">
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="masalan: 8-A"
                required
              />
            </Field>

            <Field id="group-grade" label="Sinf darajasi" required>
              <div className="flex items-center gap-4 pt-1">
                {[8, 9, 11].map((g) => (
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

            <Field id="academic-year" label="O'quv yili" required>
              <Input
                id="academic-year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026-2027"
                required
              />
            </Field>

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
