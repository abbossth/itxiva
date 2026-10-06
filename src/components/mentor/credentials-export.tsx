"use client";

import { useState } from "react";
import { FileSpreadsheet, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { exportGroupCredentialsAction } from "@/actions/student.actions";
import { downloadXlsx } from "@/lib/xlsx-client";
import { formatDateTimeUz } from "@/lib/utils";

/**
 * Sahifa pastidagi ko'zga tashlanmaydigan tugma: mentor parolini tasdiqlagach
 * guruh o'quvchilarining login/parollari Excel fayl bo'lib yuklanadi.
 */
export function CredentialsExport({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const close = () => {
    setIsOpen(false);
    setPassword("");
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await exportGroupCredentialsAction({ groupId, mentorPassword: password });
      if (!res.success || !res.rows) {
        setErrorMsg(res.message || "Yuklab bo'lmadi");
        return;
      }
      await downloadXlsx({
        filename: `${res.groupName || groupName}_login_parollar.xlsx`,
        sheetName: res.groupName || groupName,
        columns: [
          { header: "#", key: "n", width: 5 },
          { header: "FIO", key: "fullName", width: 38 },
          { header: "Login", key: "login", width: 26 },
          { header: "Parol", key: "password", width: 16 },
          { header: "Parol holati", key: "passwordStatus", width: 48 },
          { header: "Oxirgi kirish", key: "lastLoginAt", width: 20 },
          { header: "Guruh", key: "group", width: 16 },
        ],
        rows: res.rows.map((r, i) => ({
          n: i + 1,
          fullName: r.fullName,
          login: r.login,
          password: r.password ?? "—",
          passwordStatus: r.passwordStatus,
          lastLoginAt: r.lastLoginAt ? formatDateTimeUz(r.lastLoginAt) : "Hali kirmagan",
          group: res.groupName || groupName,
        })),
      });
      toast.success("Fayl yuklab olindi");
      close();
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex justify-center pt-10">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Login va parollarni Excelga yuklab olish"
          title="Login va parollarni yuklab olish"
          className="h-11 w-44 rounded-xl opacity-0 hover:opacity-60 focus-visible:opacity-100 transition-opacity cursor-pointer flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Login va parollar
        </button>
      </div>

      <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="space-y-1 mb-4">
            <DialogTitle>Login va parollarni yuklab olish</DialogTitle>
            <DialogDescription>
              {groupName} guruhi o&apos;quvchilari ro&apos;yxati Excel fayl bo&apos;lib yuklanadi. Davom etish uchun o&apos;z
              parolingizni kiriting.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Faylda faqat hali o&apos;zgartirilmagan vaqtinchalik parollar ko&apos;rinadi. O&apos;quvchi o&apos;zi qo&apos;ygan
                parol tizimda saqlanmaydi — unutgan bo&apos;lsa &quot;Parolni tiklash&quot; tugmasidan foydalaning.
              </span>
            </div>

            <Field htmlFor="export-mentor-password" label="Mentor paroli" required error={errorMsg || undefined}>
              <Input
                id="export-mentor-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </Field>

            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={close} disabled={isLoading}>
                Bekor qilish
              </Button>
              <Button type="submit" variant="primary" isLoading={isLoading} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Yuklab olish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
