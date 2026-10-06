"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  UserPlus,
  KeyRound,
  ArrowRightLeft,
  Trash2,
  Search,
  Users,
  Clock,
} from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { IUserData } from "@/lib/db/models/user.model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { CoinBadge } from "@/components/ui/coin-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StudentImportModal } from "@/components/mentor/student-import-modal";
import { ResetPasswordModal } from "@/components/mentor/reset-password-modal";
import { CredentialsExport } from "@/components/mentor/credentials-export";
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

  // Delete modal state
  const [studentToDelete, setStudentToDelete] = useState<IUserData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();

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
        toast.success(`${studentToMove.fullName} boshqa guruhga muvaffaqiyatli ko'chirildi`);
        setStudentToMove(null);
      } else {
        toast.error(res.message || "Ko'chirishda xatolik");
      }
    } catch {
      toast.error("O'quvchini ko'chirib bo'lmadi");
    } finally {
      setIsMoving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!studentToDelete) return;
    try {
      setIsDeleting(true);
      const res = await deleteStudentAction(studentToDelete._id.toString());
      if (res.success) {
        setStudents(students.filter((s) => s._id.toString() !== studentToDelete._id.toString()));
        toast.success(`${studentToDelete.fullName} tizimdan o'chirildi`);
        setStudentToDelete(null);
      } else {
        toast.error(res.message || "O'chirishda xatolik yuz berdi");
      }
    } catch {
      toast.error("O'quvchini o'chirib bo'lmadi");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top back button */}
      <div>
        <Link
          href="/mentor/groups"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Guruhlar ro&apos;yxatiga qaytish
        </Link>
      </div>

      {/* Group Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="teal">{group.grade}-sinf</Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {group.academicYear}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {group.name} guruhi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            Jami {students.length} nafar o&apos;quvchi ro&apos;yxatga olingan
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsImportOpen(true)}
          className="gap-2 shrink-0 font-semibold min-h-[44px]"
        >
          <UserPlus className="w-4 h-4" />
          O&apos;quvchilarni import qilish
        </Button>
      </div>

      {/* Search Input Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism yoki login bo'yicha qidirish..."
            className="pl-10"
          />
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {search ? `${filtered.length} ta natija topildi` : `Jami ${students.length} ta o'quvchi`}
        </div>
      </div>

      {/* === DESKTOP TABLE VIEW (md and up) === */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="p-4 font-bold w-12">#</th>
              <th className="p-4 font-bold">O&apos;quvchi</th>
              <th className="p-4 font-bold">Login</th>
              <th className="p-4 font-bold text-center">Coinlar</th>
              <th className="p-4 font-bold">Oxirgi kirish</th>
              <th className="p-4 font-bold text-right">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-500 dark:text-slate-400">
                  O&apos;quvchilar topilmadi
                </td>
              </tr>
            ) : (
              filtered.map((s, idx) => (
                <tr
                  key={s._id.toString()}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{idx + 1}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.fullName} size="sm" />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {s.fullName}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-teal-600 dark:text-teal-400 text-xs sm:text-sm">
                    @{s.login}
                  </td>
                  <td className="p-4 text-center">
                    <CoinBadge amount={s.totalCoins || 0} size="sm" animate={false} />
                  </td>
                  <td className="p-4 text-slate-500 dark:text-slate-400 text-xs">
                    {s.lastLoginAt ? formatDateUz(s.lastLoginAt) : "Hali kirmagan"}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentForReset(s)}
                        className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer flex items-center justify-center"
                        aria-label={`${s.fullName} parolini tiklash`}
                        title="Parolni tiklash"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentToMove(s)}
                        className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors cursor-pointer flex items-center justify-center"
                        aria-label={`${s.fullName} ni boshqa guruhga ko'chirish`}
                        title="Boshqa guruhga ko'chirish"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentToDelete(s)}
                        className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer flex items-center justify-center"
                        aria-label={`${s.fullName} ni tizimdan o'chirish`}
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

      {/* === MOBILE CARD VIEW (< md, fixes K1) === */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
            O&apos;quvchilar topilmadi
          </div>
        ) : (
          filtered.map((s, idx) => (
            <div
              key={s._id.toString()}
              className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3"
            >
              {/* Card top: Avatar, Name, Login, Index */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={s.fullName} size="md" />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {s.fullName}
                    </div>
                    <div className="text-xs font-mono text-teal-600 dark:text-teal-400">
                      @{s.login}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  #{idx + 1}
                </span>
              </div>

              {/* Card middle: Coins & Last Login */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                <div className="flex items-center gap-1.5">
                  <CoinBadge amount={s.totalCoins || 0} size="sm" animate={false} />
                </div>
                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{s.lastLoginAt ? formatDateUz(s.lastLoginAt) : "Hali kirmagan"}</span>
                </div>
              </div>

              {/* Card bottom: 3 clear action buttons (44px min touch target) */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setSelectedStudentForReset(s)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/60 min-h-[44px] cursor-pointer active:scale-95 transition-transform"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span>Parol</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStudentToMove(s)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-900/60 min-h-[44px] cursor-pointer active:scale-95 transition-transform"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                  <span>Ko&apos;chirish</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStudentToDelete(s)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 min-h-[44px] cursor-pointer active:scale-95 transition-transform"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>O&apos;chirish</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Move Student Modal */}
      <Dialog open={Boolean(studentToMove)} onOpenChange={(open) => !open && setStudentToMove(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>O&apos;quvchini ko&apos;chirish</DialogTitle>
            <DialogDescription>
              {studentToMove?.fullName} (@{studentToMove?.login}) ni boshqa guruhga o&apos;tkazish
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field htmlFor="target-group" label="Yangi guruhni tanlang" required>
              <select
                id="target-group"
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-bg text-slate-900 dark:text-slate-100 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500 min-h-[44px]"
              >
                {allGroups
                  .filter((g) => g._id.toString() !== group._id.toString())
                  .map((g) => (
                    <option key={g._id.toString()} value={g._id.toString()}>
                      {g.name} guruhi ({g.grade}-sinf)
                    </option>
                  ))}
              </select>
            </Field>

            <DialogFooter className="pt-2">
              <Button
                variant="secondary"
                onClick={() => setStudentToMove(null)}
                disabled={isMoving}
              >
                Bekor qilish
              </Button>
              <Button
                variant="primary"
                onClick={handleMove}
                isLoading={isMoving}
              >
                Ko&apos;chirish
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog for Deleting Student */}
      <ConfirmDialog
        isOpen={Boolean(studentToDelete)}
        onClose={() => setStudentToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="O'quvchini tizimdan o'chirish"
        danger
        confirmText="Ha, o'chirish"
        isLoading={isDeleting}
        description={
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p>
              Haqiqatan ham <strong>{studentToDelete?.fullName}</strong> (@{studentToDelete?.login}) o&apos;quvchisini tizimdan butunlay o&apos;chirmoqchimisiz?
            </p>
            <p className="text-rose-600 dark:text-rose-400 font-semibold">
              Uning barcha topshirgan imtihonlari va to&apos;plagan tangalari tiklab bo&apos;lmaydi.
            </p>
          </div>
        }
      />

      {/* Password Reset Modal */}
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

      {/* Student Import Modal */}
      <StudentImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        groupId={group._id.toString()}
        groupName={group.name}
      />

      <CredentialsExport groupId={group._id.toString()} groupName={group.name} />
    </div>
  );
}
