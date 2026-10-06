"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EVEN_DAYS, ODD_DAYS, UZ_WEEKDAYS_SHORT, GroupSchedule } from "@/lib/schedule";

interface ScheduleFieldsProps {
  idPrefix: string;
  value: GroupSchedule;
  onChange: (value: GroupSchedule) => void;
}

const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().every((d, i) => d === b[i]);

export function ScheduleFields({ idPrefix, value, onChange }: ScheduleFieldsProps) {
  const toggleDay = (day: number) => {
    const days = value.days.includes(day)
      ? value.days.filter((d) => d !== day)
      : [...value.days, day].sort((a, b) => a - b);
    onChange({ ...value, days });
  };

  const presets = [
    { label: "Toq kunlar", days: ODD_DAYS },
    { label: "Juft kunlar", days: EVEN_DAYS },
  ];

  return (
    <div className="space-y-3">
      <Field htmlFor={`${idPrefix}-days`} label="Dars kunlari" required hint="Haftada 3 kun, har biri 1 soat 30 daqiqa">
        <div id={`${idPrefix}-days`} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange({ ...value, days: p.days })}
                className={cn(
                  "px-3 min-h-[36px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer",
                  sameDays(value.days, p.days)
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-500/60"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {UZ_WEEKDAYS_SHORT.map((label, i) => {
              const day = i + 1;
              const active = value.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "min-w-[44px] min-h-[44px] px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer",
                    active
                      ? "bg-teal-500/15 border-teal-500/60 text-teal-700 dark:text-teal-300"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field htmlFor={`${idPrefix}-start`} label="Boshlanishi" required>
          <Input
            id={`${idPrefix}-start`}
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            required
          />
        </Field>
        <Field htmlFor={`${idPrefix}-end`} label="Tugashi" required>
          <Input
            id={`${idPrefix}-end`}
            type="time"
            value={value.endTime}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
            required
          />
        </Field>
      </div>
    </div>
  );
}
