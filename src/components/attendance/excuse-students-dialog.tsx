"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { bulkSetAttendanceStatusAction } from "@/actions/attendance.actions";
import { cn } from "@/lib/utils";

export interface ExcuseCandidate {
  id: string;
  fullName: string;
  login: string;
}

/**
 * Kelmaganlarni birdan "sababli" qilish: ro'yxatda hammasi belgilangan, keraksizlari olib tashlanadi.
 * Ochilganda holat yangidan boshlanishi uchun ota komponent uni faqat ochiq paytda chizadi.
 */
export function ExcuseStudentsDialog({
  sessionId,
  students,
  onClose,
  onDone,
}: {
  sessionId: string;
  students: ExcuseCandidate[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [saving, setSaving] = useState(false);
  const allSelected = selected.size === students.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSaving(true);
    try {
      const res = await bulkSetAttendanceStatusAction({ sessionId, studentIds: ids, status: "excused" });
      if (res.success) {
        toast.success(res.message || "Sababli deb belgilandi");
        onDone(ids);
        onClose();
      } else {
        toast.error(res.message || "Belgilab bo'lmadi");
      }
    } catch {
      toast.error("Belgilab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Kelmaganlarni sababli qilish" maxWidth="md">
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Belgilanganlar &quot;Sababli&quot; bo&apos;ladi: coin olinmaydi va davomat foiziga ta&apos;sir qilmaydi. Keyin kelib QR o&apos;tsa —
          &quot;Kelgan&quot; bo&apos;ladi.
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {selected.size} / {students.length} tanlandi
          </span>
          <button
            type="button"
            onClick={() => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)))}
            className="min-h-[36px] rounded-lg px-2 font-bold text-teal-700 hover:bg-teal-500/10 dark:text-teal-300 cursor-pointer"
          >
            {allSelected ? "Hammasini olib tashlash" : "Hammasini tanlash"}
          </button>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {students.map((st) => {
            const on = selected.has(st.id);
            return (
              <li key={st.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(st.id)}
                  className="flex w-full min-h-[52px] items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-600"
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <Avatar name={st.fullName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">{st.fullName}</span>
                    <span className="block text-[11px] font-mono text-slate-500 dark:text-slate-400">@{st.login}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={submit} isLoading={saving} disabled={selected.size === 0}>
            {selected.size > 0 ? `${selected.size} ta o'quvchini sababli qilish` : "O'quvchi tanlang"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
