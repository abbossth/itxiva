"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { bulkSetAttendanceStatusAction } from "@/actions/attendance.actions";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface ExcuseCandidate {
  id: string;
  fullName: string;
  login: string;
}

const REASONS = ["Kasal", "Oilaviy sabab", "Musobaqa yoki tadbir", "Shifokor qabulida"] as const;
const OTHER = "Boshqa";
const REASON_MIN = 3;
/** Tasdiqlash bosqichida tugma shuncha soniyadan keyin faollashadi (shoshilib bosilmasin) */
const CONFIRM_DELAY_S = 3;

/**
 * Kelmaganlarni "sababli" qilish — ataylab qiyinroq: o'quvchi o'zi tanlanadi (hech kim oldindan belgilanmagan,
 * qatordagi tugmadan ochilsa — faqat o'sha o'quvchi), sabab majburiy va ikkinchi bosqichda kim va qaysi sabab bilan
 * belgilanayotgani ko'rsatilib, tasdiqlash tugmasi bir necha soniyadan keyin faollashadi.
 * (Avval bosib ushlab turish bor edi — oddiy bosishda hech narsa bo'lmagani va telefonda uzilib qolgani uchun almashtirildi.)
 * Ochilganda holat yangidan boshlanishi uchun ota komponent uni faqat ochiq paytda chizadi.
 */
export function ExcuseStudentsDialog({
  sessionId,
  students,
  initialSelected = [],
  onClose,
  onDone,
}: {
  sessionId: string;
  students: ExcuseCandidate[];
  /** Oldindan belgilanganlar (masalan, ro'yxatdagi bitta o'quvchi) */
  initialSelected?: string[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [reasonChoice, setReasonChoice] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [saving, setSaving] = useState(false);
  // Ikkinchi bosqich: qolgan soniyalar (null — hali birinchi bosqichda)
  const [confirmIn, setConfirmIn] = useState<number | null>(null);
  const single = initialSelected.length === 1 ? students.find((s) => s.id === initialSelected[0]) : undefined;
  const list = single ? [single] : students;

  const reason = reasonChoice === OTHER ? otherText.trim() : reasonChoice ?? "";
  const reasonOk = reason.length >= REASON_MIN;
  const ready = selected.size > 0 && reasonOk && !saving;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    const ids = [...selected];
    if (ids.length === 0 || !reasonOk) return;
    setSaving(true);
    try {
      const res = await bulkSetAttendanceStatusAction({ sessionId, studentIds: ids, status: "excused", notes: reason });
      if (res.success) {
        toast.success(res.message || "Sababli deb belgilandi");
        onDone(ids);
        onClose();
      } else {
        toast.error(res.message || "Belgilab bo'lmadi");
        setConfirmIn(null);
      }
    } catch {
      toast.error("Belgilab bo'lmadi");
      setConfirmIn(null);
    } finally {
      setSaving(false);
    }
  };

  const hint = selected.size === 0 ? "Avval o'quvchini tanlang" : !reasonOk ? "Sababini tanlang yoki yozing" : null;

  // Tasdiqlash tugmasi sanog'i
  useEffect(() => {
    if (confirmIn === null || confirmIn <= 0) return;
    const t = setTimeout(() => setConfirmIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [confirmIn]);

  const names = students.filter((s) => selected.has(s.id)).map((s) => s.fullName);

  return (
    <Modal
      isOpen
      onClose={() => !saving && onClose()}
      title={single ? `${single.fullName} — sababli qilish` : "Kelmaganlarni sababli qilish"}
      maxWidth="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          &quot;Sababli&quot; deb belgilangan o&apos;quvchidan jarima olinmaydi va bu davomat foiziga ta&apos;sir qilmaydi. Faqat sababi aniq
          bo&apos;lsa belgilang — sabab davomat tarixida saqlanadi. Keyin kelib QR o&apos;tsa, &quot;Kelgan&quot; bo&apos;ladi.
        </p>

        {!single && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">1. Kimlar?</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                {selected.size} / {students.length} tanlandi
              </span>
            </div>
            <ul className="max-h-[36vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((st) => {
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
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">{single ? "Sababi" : "2. Sababi"}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kelmaganlik sababi">
            {[...REASONS, OTHER].map((r) => {
              const on = reasonChoice === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setReasonChoice(r)}
                  className={cn(
                    "min-h-[40px] rounded-xl border px-3 text-sm font-semibold transition-colors cursor-pointer",
                    on
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
                  )}
                >
                  {r}
                </button>
              );
            })}
          </div>
          {reasonChoice === OTHER && (
            <input
              autoFocus
              value={otherText}
              onChange={(e) => setOtherText(e.target.value.slice(0, 200))}
              placeholder="Masalan: ota-onasi qo'ng'iroq qilib aytdi"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          )}
        </div>

        {confirmIn === null ? (
          <>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Bekor qilish
              </Button>
              <Button
                onClick={() => {
                  haptic([30]);
                  setConfirmIn(CONFIRM_DELAY_S);
                }}
                disabled={!ready}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <ShieldCheck className="h-4 w-4" />
                {selected.size > 1 ? `${selected.size} ta o'quvchini sababli qilish` : "Sababli qilish"}
              </Button>
            </div>
            {hint && (
              <p className="text-right text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
                {hint}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3 rounded-2xl border border-blue-500/40 bg-blue-50 p-4 dark:bg-blue-500/10" aria-live="polite">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Tasdiqlaysizmi?</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <strong>{names.length > 3 ? `${names.slice(0, 3).join(", ")} va yana ${names.length - 3} kishi` : names.join(", ")}</strong>{" "}
              &laquo;{reason}&raquo; sababi bilan &quot;Sababli&quot; deb belgilanadi — jarima olinmaydi.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setConfirmIn(null)} disabled={saving} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Orqaga
              </Button>
              <Button onClick={submit} isLoading={saving} disabled={confirmIn > 0 || saving} className="min-w-[180px] gap-2 bg-blue-600 hover:bg-blue-700">
                <Check className="h-4 w-4" />
                {confirmIn > 0 ? `Tasdiqlash (${confirmIn})` : "Ha, tasdiqlayman"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
