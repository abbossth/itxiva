/** Yoqish/o'chirish tugmasi (switch) */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none min-h-[36px]">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 transition-colors peer-checked:bg-teal-600 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span>
    </label>
  );
}
