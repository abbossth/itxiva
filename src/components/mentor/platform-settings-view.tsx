"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Check, Palette, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { updateAppSettingsAction } from "@/actions/settings.actions";
import { ACCENTS } from "@/lib/theme-accents";
import type { AppSettingsData } from "@/lib/settings";
import { cn } from "@/lib/utils";

const card = "p-4 sm:p-6 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4";

export function PlatformSettingsView({ settings, yearOptions }: { settings: AppSettingsData; yearOptions: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [academicYear, setAcademicYear] = useState(settings.academicYear);
  const [quarter, setQuarter] = useState(settings.quarter);
  const [accent, setAccent] = useState(settings.accent);
  const [isSaving, setIsSaving] = useState(false);

  const dirty = academicYear !== settings.academicYear || quarter !== settings.quarter || accent !== settings.accent;

  const save = async () => {
    try {
      setIsSaving(true);
      const res = await updateAppSettingsAction({ academicYear, quarter, accent });
      if (res.success) {
        toast.success(res.message || "Sozlamalar saqlandi");
        router.refresh();
      } else {
        toast.error(res.message || "Saqlab bo'lmadi");
      }
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl pb-12">
      <PageHeader
        icon={SlidersHorizontal}
        title="Platforma sozlamalari"
        subtitle="Bu sozlamalar siz va barcha o'quvchilar uchun amal qiladi"
      />

      <section className={card}>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Joriy o&apos;quv yili va chorak
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Darslar ro&apos;yxati (sizda ham, o&apos;quvchilarda ham) shu chorakda ochiladi. Yangi dars, imtihon va guruh ham shu qiymatlar
            bilan yaratiladi. Kerak bo&apos;lsa, har bir sahifada boshqa chorakni tanlash mumkin.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="settings-year" label="O'quv yili">
            <Select id="settings-year" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chorak">
            <SegmentedControl
              ariaLabel="Joriy chorak"
              value={quarter}
              onChange={setQuarter}
              options={[1, 2, 3, 4].map((q) => ({ value: q, label: `${q}-chorak` }))}
            />
          </Field>
        </div>
      </section>

      <section className={card}>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Palette className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Asosiy rang
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tugmalar, havolalar va belgilar shu rangda ko&apos;rinadi. Yorug&apos; va tungi rejimda ham ishlaydi.
          </p>
        </div>

        <div role="radiogroup" aria-label="Asosiy rang" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ACCENTS.map((a) => {
            const selected = accent === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAccent(a.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border text-left min-h-[52px] cursor-pointer transition-colors",
                  selected
                    ? "border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800/60"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: a.swatch }}
                >
                  {selected && <Check className="w-4 h-4" />}
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{a.label}</span>
              </button>
            );
          })}
        </div>

        {/* Saqlashdan oldin tanlangan rang qanday ko'rinishini ko'rsatadi */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <span>Namuna:</span>
          {(() => {
            const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
            return (
              <>
                <span className="px-3 py-1.5 rounded-lg font-semibold text-white" style={{ backgroundColor: a.swatch }}>
                  Tugma
                </span>
                <span className="font-semibold underline" style={{ color: a.swatch }}>
                  Havola
                </span>
              </>
            );
          })()}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} isLoading={isSaving} disabled={!dirty}>
          Saqlash
        </Button>
        {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Saqlanmagan o&apos;zgarishlar bor</span>}
      </div>
    </div>
  );
}
