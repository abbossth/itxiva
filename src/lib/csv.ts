import { triggerDownload } from "@/lib/xlsx-client";

type Cell = string | number | null | undefined;

/** Excel to'g'ri ochishi uchun UTF-8 BOM va ";" ajratgich bilan CSV yuklab beradi */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  const escape = (v: Cell) => {
    const text = v === null || v === undefined ? "" : String(v);
    // Formulaga aylanib ketmasligi uchun =, +, -, @ bilan boshlanadigan matn oldiga apostrof qo'yiladi
    const safe = typeof v === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\n");
  triggerDownload(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }), filename);
}
