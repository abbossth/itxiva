"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Jadval ustunlarini saralash va filtrlash: ustun sarlavhasi bosilganda kichik menyu ochiladi.
// Har jadval o'z ko'rinishini saqlaydi — faqat sarlavhadagi tugma va qatorlar ro'yxati shu hookdan olinadi.

export type ColValue = string | number | null | undefined;
type FilterKind = "text" | "options" | "range";

export interface ColumnDef<R> {
  key: string;
  label: string;
  /** Saralash va filtr shu qiymat bo'yicha (null — oxirida) */
  value: (row: R) => ColValue;
  /** Filtr turi; berilmasa — qiymatlarga qarab o'zi tanlanadi; false — filtrsiz */
  filter?: FilterKind | false;
  /** Variantlar ro'yxatida qiymat qanday yozilsin */
  optionLabel?: (value: ColValue) => string;
}

interface ColFilter {
  text?: string;
  /** Tanlangan variantlar (bo'sh emas — faqat shular ko'rsatiladi) */
  options?: string[];
  min?: number | null;
  max?: number | null;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

const optionKey = (v: ColValue) => (v === null || v === undefined || v === "" ? "∅" : String(v));

function matches(v: ColValue, f: ColFilter): boolean {
  if (f.text) {
    if (v === null || v === undefined) return false;
    if (!String(v).toLocaleLowerCase("uz").includes(f.text.toLocaleLowerCase("uz"))) return false;
  }
  if (f.options && f.options.length > 0 && !f.options.includes(optionKey(v))) return false;
  if (f.min !== null && f.min !== undefined) {
    if (typeof v !== "number" || v < f.min) return false;
  }
  if (f.max !== null && f.max !== undefined) {
    if (typeof v !== "number" || v > f.max) return false;
  }
  return true;
}

const isActive = (f?: ColFilter) =>
  Boolean(f && (f.text || (f.options && f.options.length > 0) || (f.min !== null && f.min !== undefined) || (f.max !== null && f.max !== undefined)));

export function useTableControls<R>(rows: R[], columns: ColumnDef<R>[], initialSort: SortState = null) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [filters, setFilters] = useState<Record<string, ColFilter>>({});
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  // Filtr turi: raqamlar — oraliq, kam xil qiymat — variantlar, qolgani — matn qidiruvi
  const kinds = useMemo(() => {
    const out: Record<string, FilterKind | false> = {};
    for (const c of columns) {
      if (c.filter !== undefined) {
        out[c.key] = c.filter;
        continue;
      }
      const values = rows.map(c.value).filter((v) => v !== null && v !== undefined && v !== "");
      const distinct = new Set(values.map(String)).size;
      out[c.key] = values.length > 0 && values.every((v) => typeof v === "number") ? (distinct <= 8 ? "options" : "range") : distinct <= 12 ? "options" : "text";
    }
    return out;
  }, [columns, rows]);

  const visible = useMemo(() => {
    const active = Object.entries(filters).filter(([, f]) => isActive(f));
    let list = active.length
      ? rows.filter((r) => active.every(([key, f]) => {
          const col = byKey.get(key);
          return col ? matches(col.value(r), f) : true;
        }))
      : [...rows];
    const col = sort ? byKey.get(sort.key) : null;
    if (sort && col) {
      const dir = sort.dir === "asc" ? 1 : -1;
      list = list
        .map((r, i) => ({ r, i, v: col.value(r) }))
        .sort((a, b) => {
          const an = a.v === null || a.v === undefined || a.v === "";
          const bn = b.v === null || b.v === undefined || b.v === "";
          // Qiymati yo'qlar har doim oxirida
          if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
          const cmp = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), "uz", { numeric: true });
          return dir * cmp || a.i - b.i;
        })
        .map((x) => x.r);
    }
    return list;
  }, [rows, filters, sort, byKey]);

  /** Variantlar ro'yxati (qiymat → nechta qatorda) */
  const optionsFor = (key: string) => {
    const col = byKey.get(key);
    if (!col) return [];
    const counts = new Map<string, { label: string; count: number; raw: ColValue }>();
    for (const r of rows) {
      const v = col.value(r);
      const k = optionKey(v);
      const prev = counts.get(k);
      if (prev) prev.count++;
      else counts.set(k, { label: v === null || v === undefined || v === "" ? "— (bo'sh)" : col.optionLabel ? col.optionLabel(v) : String(v), count: 1, raw: v });
    }
    return [...counts.entries()]
      .map(([k, x]) => ({ key: k, ...x }))
      .sort((a, b) =>
        typeof a.raw === "number" && typeof b.raw === "number" ? a.raw - b.raw : a.label.localeCompare(b.label, "uz", { numeric: true })
      );
  };

  return {
    rows: visible,
    total: rows.length,
    sort,
    setSort,
    filters,
    setFilter: (key: string, f: ColFilter | null) =>
      setFilters((prev) => {
        const next = { ...prev };
        if (f && isActive(f)) next[key] = f;
        else delete next[key];
        return next;
      }),
    clear: () => {
      setFilters({});
      setSort(initialSort);
    },
    activeFilters: Object.values(filters).filter(isActive).length,
    kindOf: (key: string) => kinds[key] ?? false,
    optionsFor,
    label: (key: string) => byKey.get(key)?.label ?? key,
  };
}


/**
 * Ustun sarlavhasi: bosilganda menyu — o'sish/kamayish bo'yicha saralash va filtr.
 * Saralangan ustunda strelka, filtr qo'yilganda — belgi.
 */
export function ColumnHeader({
  table,
  column,
  children,
  align = "left",
  className,
}: {
  table: { sort: SortState; setSort: (s: SortState) => void; filters: Record<string, ColFilter>; setFilter: (k: string, f: ColFilter | null) => void; kindOf: (k: string) => FilterKind | false; optionsFor: (k: string) => { key: string; label: string; count: number }[] };
  column: string;
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const sorted = table.sort?.key === column ? table.sort.dir : null;
  const filtered = isActive(table.filters[column]);
  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "group/col inline-flex min-h-[32px] max-w-full items-center gap-1 rounded-md px-1 -mx-1 [text-transform:inherit] [letter-spacing:inherit] [font-weight:inherit] cursor-pointer transition-colors",
          "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100",
          (sorted || filtered) && "text-teal-700 dark:text-teal-300",
          align === "center" && "justify-center",
          className
        )}
      >
        <span className="truncate">{children}</span>
        <SortIcon className={cn("h-3 w-3 shrink-0", sorted ? "opacity-100" : "opacity-0 group-hover/col:opacity-60")} />
        {filtered && <Filter className="h-3 w-3 shrink-0 fill-current" aria-label="filtr qo'yilgan" />}
      </button>
      {open && <ColumnMenu table={table} column={column} anchor={btnRef} onClose={() => setOpen(false)} />}
    </>
  );
}

function ColumnMenu({
  table,
  column,
  anchor,
  onClose,
}: {
  table: Parameters<typeof ColumnHeader>[0]["table"];
  column: string;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const kind = table.kindOf(column);
  const current = table.filters[column] ?? {};
  const sorted = table.sort?.key === column ? table.sort.dir : null;

  // Menyu tugma ostida, ekrandan chiqmasin; tashqariga bosish, Escape, aylantirish — yopadi
  useEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = 240;
      setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 60), left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    };
    place();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (!pos) return null;

  const sortBtn = (dir: "asc" | "desc", label: string, Icon: typeof ArrowUp) => (
    <button
      type="button"
      onClick={() => {
        table.setSort(sorted === dir ? null : { key: column, dir });
        onClose();
      }}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
        sorted === dir ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Saralash va filtr"
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[60] w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-left normal-case tracking-normal shadow-xl shadow-slate-900/15 animate-in fade-in"
    >
      <div className="flex gap-1.5">
        {sortBtn("asc", "O'sish", ArrowUp)}
        {sortBtn("desc", "Kamayish", ArrowDown)}
      </div>

      {kind && (
        <div className="mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
          {kind === "text" && (
            <input
              autoFocus
              value={current.text ?? ""}
              onChange={(e) => table.setFilter(column, { ...current, text: e.target.value })}
              placeholder="Qidirish..."
              aria-label="Ustun bo'yicha qidirish"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-500 focus:outline-hidden"
            />
          )}
          {kind === "range" && (
            <div className="flex items-center gap-1.5">
              {(["min", "max"] as const).map((k) => (
                <input
                  key={k}
                  type="number"
                  inputMode="decimal"
                  autoFocus={k === "min"}
                  value={current[k] ?? ""}
                  onChange={(e) => table.setFilter(column, { ...current, [k]: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder={k === "min" ? "dan" : "gacha"}
                  aria-label={k === "min" ? "Eng kam qiymat" : "Eng ko'p qiymat"}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-500 focus:outline-hidden"
                />
              ))}
            </div>
          )}
          {kind === "options" && (
            <ul className="max-h-56 overflow-y-auto">
              {table.optionsFor(column).map((o) => {
                const on = (current.options ?? []).includes(o.key);
                return (
                  <li key={o.key}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => {
                        const list = current.options ?? [];
                        table.setFilter(column, { ...current, options: on ? list.filter((x) => x !== o.key) : [...list, o.key] });
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-600"
                        )}
                      >
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">{o.label}</span>
                      <span className="text-[11px] tabular-nums text-slate-400">{o.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {isActive(current) && (
            <button
              type="button"
              onClick={() => table.setFilter(column, null)}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              <X className="h-3 w-3" /> Filtrni olib tashlash
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}

/** Filtr qo'yilganda jadval tepasida: nechta qator ko'rinyapti va hammasini tozalash */
export function TableFilterBar({ table, className }: { table: { rows: unknown[]; total: number; activeFilters: number; clear: () => void }; className?: string }) {
  if (table.activeFilters === 0) return null;
  return (
    <div className={cn("flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300", className)}>
      <Filter className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
      <span>
        <b className="tabular-nums">{table.rows.length}</b> / {table.total} qator
      </span>
      <button type="button" onClick={table.clear} className="font-semibold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer">
        Tozalash
      </button>
    </div>
  );
}

export interface SortableColumn {
  key: string;
  label: string;
  /** Sarlavha (berilmasa — label) */
  header?: React.ReactNode;
  thClassName?: string;
  tdClassName?: string;
  align?: "left" | "center" | "right";
  /** false — saralash/filtrsiz (masalan, "Amallar") */
  controls?: boolean;
  filter?: FilterKind | false;
}

export interface SortableRow {
  key: string;
  /** Saralash/filtr uchun qiymatlar (ustun kaliti bo'yicha) */
  values: Record<string, ColValue>;
  /** Har ustunning katagi (serverda chizilgan bo'lishi mumkin) */
  cells: React.ReactNode[];
  className?: string;
}

/**
 * Server sahifalar uchun tayyor jadval: kataklar serverda chiziladi, saralash va filtr — brauzerda qiymatlar bo'yicha.
 */
export function SortableTable({
  columns,
  rows,
  tableClassName,
  theadClassName,
  headRowClassName,
  tbodyClassName,
  filterBarClassName,
  empty,
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  tableClassName?: string;
  theadClassName?: string;
  headRowClassName?: string;
  tbodyClassName?: string;
  filterBarClassName?: string;
  empty?: React.ReactNode;
}) {
  const defs = useMemo<ColumnDef<SortableRow>[]>(
    () => columns.filter((c) => c.controls !== false).map((c) => ({ key: c.key, label: c.label, value: (r) => r.values[c.key], filter: c.filter })),
    [columns]
  );
  const table = useTableControls(rows, defs);
  return (
    <>
      <TableFilterBar table={table} className={filterBarClassName} />
      <table className={tableClassName}>
        <thead className={theadClassName}>
          <tr className={headRowClassName}>
            {columns.map((c) => (
              <th key={c.key} className={c.thClassName}>
                {c.controls === false ? (
                  c.header ?? c.label
                ) : (
                  <ColumnHeader table={table} column={c.key} align={c.align}>
                    {c.header ?? c.label}
                  </ColumnHeader>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tbodyClassName}>
          {table.rows.length === 0 && empty ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            table.rows.map((r) => (
              <tr key={r.key} className={r.className}>
                {r.cells.map((cell, i) => (
                  <td key={columns[i]?.key ?? i} className={columns[i]?.tdClassName}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
