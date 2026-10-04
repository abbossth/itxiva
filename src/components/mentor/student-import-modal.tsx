"use client";

import { useState } from "react";
import { Download, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { importStudentsAction, ImportedStudentResult } from "@/actions/student.actions";

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}

export function StudentImportModal({
  isOpen,
  onClose,
  groupId,
  groupName,
}: StudentImportModalProps) {
  const [rawText, setRawText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<ImportedStudentResult[] | null>(null);
  const [copied, setCopied] = useState(false);

  const handleImport = async () => {
    if (!rawText.trim()) {
      setErrorMsg("O'quvchilar ro'yxatini kiriting");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await importStudentsAction({ groupId, rawText });

      if (res.success && res.credentials) {
        setCredentials(res.credentials);
        setRawText("");
      } else {
        setErrorMsg(res.message || "Importda xatolik yuz berdi");
      }
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!credentials) return;
    const header = "FIO,Login,Parol,Guruh\n";
    const rows = credentials
      .map(
        (c) =>
          `"${c.fullName.replace(/"/g, '""')}","${c.login}","${c.password}","${groupName}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${groupName}_oquvchilar_login_parol.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyAll = () => {
    if (!credentials) return;
    const text = credentials
      .map((c) => `${c.fullName}\t${c.login}\t${c.password}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseModal = () => {
    setCredentials(null);
    setRawText("");
    setErrorMsg(null);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleCloseModal}
      title={`${groupName} guruhiga o'quvchilarni import qilish`}
      description="Google Sheets yoki jadvaldan o'quvchilar ism-familiyasini nusxalab joylashtiring"
      maxWidth="lg"
    >
      {!credentials ? (
        <div className="space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs sm:text-sm rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Ism-familiyalar ro&apos;yxati (har bir qatorda bittadan):
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Alisher Valiyev&#10;Madina Karimova&#10;Jasur Bekmurodov"
              rows={8}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Google Sheets ustunidan to&apos;g&apos;ridan-to&apos;g&apos;ri nusxa olib tashlashingiz mumkin.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={handleCloseModal} disabled={isLoading}>
              Bekor qilish
            </Button>
            <Button variant="primary" onClick={handleImport} isLoading={isLoading}>
              Import qilish
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <strong className="block font-bold mb-0.5">Muhim: Parollar faqat bir marta ko&apos;rsatiladi!</strong>
              O&apos;quvchilar login va parollarini saqlab qolish uchun quyidagi CSV faylni yuklab oling yoki nusxalang.
            </div>
          </div>

          {/* Table of created credentials */}
          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 sticky top-0">
                <tr>
                  <th className="p-2.5 font-bold">FIO</th>
                  <th className="p-2.5 font-bold">Login</th>
                  <th className="p-2.5 font-bold">Parol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                {credentials.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 font-medium">{c.fullName}</td>
                    <td className="p-2.5 font-mono text-teal-600 dark:text-teal-400">{c.login}</td>
                    <td className="p-2.5 font-mono font-bold text-amber-600 dark:text-amber-400">{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1.5">
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Nusxalandi!" : "Hammasini nusxalash"}
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="gold" size="sm" onClick={handleDownloadCsv} className="gap-1.5">
                <Download className="w-4 h-4" />
                CSV yuklab olish
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCloseModal}>
                Yopish
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
