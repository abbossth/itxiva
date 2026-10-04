"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, KeyRound, ArrowRightLeft, Trash2, Search, Coins, Users } from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { IUserData } from "@/lib/db/models/user.model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { StudentImportModal } from "@/components/mentor/student-import-modal";
import { ResetPasswordModal } from "@/components/mentor/reset-password-modal";
import { moveStudentAction, deleteStudentAction } from "@/actions/student.actions";
import { formatDateUz } from "@/lib/utils";

interface GroupStudentsViewProps {
  group: IGroupData;
  initialStudents: IUserData[];
  allGroups: IGroupData[];
}

export function GroupStudentsView({
  group,
  initialStudents,
  allGroups,
}: GroupStudentsViewProps) {
  const [students, setStudents] = useState<IUserData[]>(initialStudents);
  const [search, setSearch] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedStudentForReset, setSelectedStudentForReset] = useState<IUserData | null>(null);

  // Move modal state
  const [studentToMove, setStudentToMove] = useState<IUserData | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string>(
    allGroups.find((g) => g._id.toString() !== group._id.toString())?._id.toString() || ""
  );
  const [isMoving, setIsMoving] = useState(false);

  const filtered = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.login.toLowerCase().includes(search.toLowerCase())
  );

  const handleMove = async () => {
    if (!studentToMove || !targetGroupId) return;
    try {
      setIsMoving(true);
      const res = await moveStudentAction({
        userId: studentToMove._id.toString(),
        newGroupId: targetGroupId,
      });
      if (res.success) {
        setStudents(students.filter((s) => s._id.toString() !== studentToMove._id.toString()));
        setStudentToMove(null);
      } else {
        alert(res.message);
      }
    } finally {
      setIsMoving(false);
    }
  };

  const handleDelete = async (student: IUserData) => {
    if (
      !confirm(
        `Haqiqatan ham "${student.fullName}" (@${student.login}) o'quvchisini tizimdan o'chirmoqchimisiz?`
      )
    )
      return;

    const res = await deleteStudentAction(student._id.toString());
    if (res.success) {
      setStudents(students.filter((s) => s._id.toString() !== student._id.toString()));
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Back button */}
      <div>
        <Link
          href="/mentor/groups"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Guruhlar ro&apos;yxatiga qaytish
        </Link>
      </div>

      {/* Group Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              {group.grade}-sinf
            </span>
            <span className="text-xs text-slate-400">{group.academicYear}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
            {group.name} guruhi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            Jami {students.length} nafar o&apos;quvchi ro&apos;yxatga olingan
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsImportOpen(true)}
          className="gap-2 shrink-0 font-semibold"
        >
          <UserPlus className="w-4 h-4" />
          O&apos;quvchilarni import qilish
        </Button>
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism yoki login bo'yicha qidirish..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32]">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="p-3.5 sm:p-4 font-bold">#</th>
              <th className="p-3.5 sm:p-4 font-bold">Ism va Familiya</th>
              <th className="p-3.5 sm:p-4 font-bold">Login</th>
              <th className="p-3.5 sm:p-4 font-bold text-center">Coinlar</th>
              <th className="p-3.5 sm:p-4 font-bold hidden md:table-cell">Oxirgi kirish</th>
              <th className="p-3.5 sm:p-4 font-bold text-right">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  O&apos;quvchilar topilmadi
                </td>
              </tr>
            ) : (
              filtered.map((s, idx) => (
                <tr key={s._id.toString()} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 sm:p-4 text-slate-400 font-mono text-xs">{idx + 1}</td>
                  <td className="p-3.5 sm:p-4 font-semibold text-slate-900 dark:text-slate-100">
                    {s.fullName}
                  </td>
                  <td className="p-3.5 sm:p-4 font-mono text-teal-600 dark:text-teal-400 text-xs sm:text-sm">
                    @{s.login}
                  </td>
                  <td className="p-3.5 sm:p-4 text-center font-bold text-amber-500">
                    <span className="inline-flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 fill-amber-500" />
                      {s.totalCoins || 0}
                    </span>
                  </td>
                  <td className="p-3.5 sm:p-4 text-slate-400 text-xs hidden md:table-cell">
                    {s.lastLoginAt ? formatDateUz(s.lastLoginAt) : "Hali kirmagan"}
                  </td>
                  <td className="p-3.5 sm:p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentForReset(s)}
                        className="p-2 min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer"
                        title="Parolni tiklash"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentToMove(s)}
                        className="p-2 min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors cursor-pointer"
                        title="Boshqa guruhga ko'chirish"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s)}
                        className="p-2 min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="O'quvchini o'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Import Modal */}
      <StudentImportModal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          // Refresh list by reloading page
          window.location.reload();
        }}
        groupId={group._id.toString()}
        groupName={group.name}
      />

      {/* Reset Password Modal */}
      <ResetPasswordModal
        isOpen={Boolean(selectedStudentForReset)}
        onClose={() => setSelectedStudentForReset(null)}
        student={
          selectedStudentForReset
            ? {
                _id: selectedStudentForReset._id.toString(),
                fullName: selectedStudentForReset.fullName,
                login: selectedStudentForReset.login,
              }
            : null
        }
      />

      {/* Move Student Modal */}
      <Dialog
        isOpen={Boolean(studentToMove)}
        onClose={() => setStudentToMove(null)}
        title="O'quvchini boshqa guruhga ko'chirish"
        description={`${studentToMove?.fullName} ni boshqa sinf yoki guruhga o'tkazing`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Yangi guruhni tanlang:
            </label>
            <select
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm"
            >
              {allGroups
                .filter((g) => g._id.toString() !== group._id.toString())
                .map((g) => (
                  <option key={g._id.toString()} value={g._id.toString()}>
                    {g.name} ({g.grade}-sinf)
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setStudentToMove(null)}>
              Bekor qilish
            </Button>
            <Button variant="primary" onClick={handleMove} isLoading={isMoving}>
              Ko&apos;chirish
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
