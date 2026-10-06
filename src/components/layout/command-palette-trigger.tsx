"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";

const OPEN_EVENT = "itxiva:open-palette";

// Palitraning o'zi faqat birinchi marta ochilganda yuklanadi
const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette), { ssr: false });

/** Sarlavhadagi qidiruv tugmasi: palitrani ochadi */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label="Qidirish (Ctrl+K)"
      aria-keyshortcuts="Control+K Meta+K"
      className="flex items-center gap-2 min-h-[44px] sm:min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface px-3 text-xs text-slate-500 dark:text-slate-400 hover:border-teal-500/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
    >
      <Search className="w-4 h-4 shrink-0" />
      <span className="hidden lg:inline">Qidirish</span>
      <kbd className="hidden lg:inline rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
        Ctrl K
      </kbd>
    </button>
  );
}

/** Ctrl+K / ⌘K ni tinglaydi va palitrani ko'rsatadi */
export function CommandPaletteTrigger({ role }: { role: "mentor" | "student" }) {
  const [open, setOpen] = useState(false);
  // Bir marta ochilgandan keyin komponent xotirada qoladi — qayta ochilishi bir zumda
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const show = () => {
      setLoaded(true);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLoaded(true);
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  if (!loaded) return null;
  return <CommandPalette role={role} open={open} onClose={() => setOpen(false)} />;
}
