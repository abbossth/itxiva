"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Users, ArrowRight, Trash2 } from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createGroupAction, deleteGroupAction } from "@/actions/group.actions";

interface GroupsManagerProps {
  initialGroups: IGroupData[];
}

export function GroupsManager({ initialGroups }: GroupsManagerProps) {
  const [groups, setGroups] = useState<IGroupData[]>(initialGroups);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number>(8);
  const [academicYear, setAcademicYear] = useState("2025-2026");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      } else {
        setErrorMsg(res.message || "Xatolik yuz berdi");
      }
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Haqiqatan ham "${name}" guruhini o'chirmoqchimisiz?`)) return;
    const res = await deleteGroupAction(id);
    if (res.success) {
      setGroups(groups.filter((g) => g._id.toString() !== id));
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Guruhlar boshqaruvi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Jami {groups.length} ta o&apos;quv guruhi
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Yangi guruh qo&apos;shish
        </Button>
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
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  {group.grade}-sinf
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
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

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => handleDelete(group._id.toString(), group.name)}
                className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                title="Guruhni o'chirish"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <Link
                href={`/mentor/groups/${group._id.toString()}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline min-h-[36px]"
              >
                O&apos;quvchilar va boshqaruv
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Create Group Modal */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Yangi o'quv guruhi yaratish"
        description="Guruh nomi va sinf darajasini belgilang"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Guruh nomi (masalan: 8-A, 8-B, 9-A, 11-A)
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="masalan: 8-A"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Sinf darajasi
            </label>
            <div className="flex items-center gap-3">
              {[8, 9, 11].map((g) => (
                <label
                  key={g}
                  className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="grade"
                    value={g}
                    checked={grade === g}
                    onChange={() => setGrade(g)}
                    className="accent-teal-600 w-4 h-4"
                  />
                  <span>{g}-sinf</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              O&apos;quv yili
            </label>
            <Input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2025-2026"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
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
          </div>
        </form>
      </Dialog>
    </div>
  );
}
