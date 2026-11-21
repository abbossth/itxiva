"use client";

import { useEffect, useState } from "react";
import { getRecentCheatsAction, type RecentCheat } from "@/actions/anti-cheat.actions";
import { formatDateTimeUz } from "@/lib/utils";

// Mentor: so'nggi anti-cheat qaydlari — test va jonli o'yin paytida boshqa oynaga o'tish, nusxalash, screenshot, bot-tezlik

export function RecentCheatsCard() {
  const [rows, setRows] = useState<RecentCheat[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void getRecentCheatsAction(30).then((r) => alive && r.success && setRows(r.data));
    return () => {
      alive = false;
    };
  }, []);
  if (!rows || rows.length === 0) return null;
  const shown = open ? rows : rows.slice(0, 5);
  return (
    <div className="mb-4 rounded-2xl border border-rose-200 bg-white p-4 dark:border-rose-500/30 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-900 dark:text-slate-100">🛡️ Anti-cheat: so&apos;nggi qaydlar</p>
        {rows.length > 5 && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="cursor-pointer text-xs font-bold text-rose-600 hover:underline dark:text-rose-300">
            {open ? "Kamroq" : `Hammasi (${rows.length})`}
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl bg-rose-500/5 px-3 py-2 text-xs">
            <span className="font-black text-slate-800 dark:text-slate-100">{r.studentName}</span>
            <span className="text-slate-500"> · {r.where} · {formatDateTimeUz(r.lastAt)}</span>
            <p className="mt-0.5 text-rose-700 dark:text-rose-300">{r.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
