"use client";

import { useState } from "react";
import { KeyRound, Copy, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resetPasswordAction } from "@/actions/student.actions";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: {
    _id: string;
    fullName: string;
    login: string;
  } | null;
}

export function ResetPasswordModal({
  isOpen,
  onClose,
  student,
}: ResetPasswordModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!student) return null;

  const handleReset = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await resetPasswordAction(student._id);

      if (res.success && res.newPassword) {
        setNewPassword(res.newPassword);
      } else {
        setErrorMsg(res.message || "Parolni tiklashda xatolik yuz berdi");
      }
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!newPassword) return;
    navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setNewPassword(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={`${student.fullName} — parolni tiklash`}
      description="Yangi tasodifiy parol generatsiya qilinadi"
    >
      {!newPassword ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Haqiqatan ham <strong className="text-slate-900 dark:text-slate-100">{student.fullName}</strong> (@{student.login}) o&apos;quvchisining parolini tiklamoqchimisiz?
          </p>

          {errorMsg && (
            <div className="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
              Bekor qilish
            </Button>
            <Button variant="danger" onClick={handleReset} isLoading={isLoading}>
              <KeyRound className="w-4 h-4 mr-1.5" />
              Yangi parol berish
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-center space-y-2">
            <span className="text-xs text-teal-700 dark:text-teal-300 font-medium">
              Yangi parol yaratildi:
            </span>
            <div className="text-2xl font-mono font-bold text-teal-900 dark:text-teal-100 tracking-wider">
              {newPassword}
            </div>
            <p className="text-[11px] text-teal-600 dark:text-teal-400">
              Login: <strong>{student.login}</strong>. Ushbu parolni o&apos;quvchiga bering.
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Nusxalandi!" : "Paroldan nusxa olish"}
            </Button>
            <Button variant="primary" size="sm" onClick={handleClose}>
              Tushundim
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
