"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, LogOut, Moon, Plus, Search, Sun, type LucideIcon } from "lucide-react";
import { MENTOR_LINKS, STUDENT_LINKS } from "./nav-links";
import { logoutAction } from "@/actions/auth.actions";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  group: "Sahifalar" | "Amallar";
  icon: LucideIcon;
  /** Qidiruvda hisobga olinadigan qo'shimcha so'zlar */
  keywords?: string;
  run: () => void;
}

const MENTOR_ACTIONS: { href: string; label: string; keywords: string }[] = [
  { href: "/mentor/lessons/new", label: "Yangi dars yaratish", keywords: "dars qoshish lesson" },
  { href: "/mentor/attendance", label: "Davomat ochish", keywords: "qr kod sessiya" },
  { href: "/mentor/shop", label: "Do'konga mahsulot qo'shish", keywords: "mahsulot sovga" },
];

const STUDENT_ACTIONS: { href: string; label: string; keywords: string }[] = [
  { href: "/attendance", label: "Davomatdan o'tish", keywords: "qr kod" },
  { href: "/shop/orders", label: "Buyurtmalarim", keywords: "dokon xarid" },
];

/** O'zbekcha apostrof variantlari va registrni hisobga olmay solishtirish uchun */
const normalize = (v: string) => v.toLowerCase().replace(/[`'ʻʼ‘’]/g, "");

export function CommandPalette({
  role,
  open,
  onClose,
}: {
  role: "mentor" | "student";
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const links = role === "mentor" ? MENTOR_LINKS : STUDENT_LINKS;
    const actions = role === "mentor" ? MENTOR_ACTIONS : STUDENT_ACTIONS;
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    return [
      ...links.map((l) => ({ id: l.href, label: l.label, group: "Sahifalar" as const, icon: l.icon, keywords: l.shortLabel, run: go(l.href) })),
      ...actions.map((a) => ({ id: `a:${a.href}`, label: a.label, group: "Amallar" as const, icon: Plus, keywords: a.keywords, run: go(a.href) })),
      {
        id: "theme",
        label: isDark ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish",
        group: "Amallar" as const,
        icon: isDark ? Sun : Moon,
        keywords: "tema rang dark light tungi",
        run: () => {
          const next = isDark ? "light" : "dark";
          localStorage.setItem("theme", next);
          document.documentElement.classList.toggle("dark", next === "dark");
          window.dispatchEvent(new Event("itxiva:theme"));
        },
      },
      { id: "logout", label: "Tizimdan chiqish", group: "Amallar" as const, icon: LogOut, keywords: "chiqish logout", run: () => void logoutAction() },
    ];
    // `open` — har ochilganda joriy tema bo'yicha yorliq yangilanadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, router, open]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return commands;
    return commands.filter((c) => normalize(`${c.label} ${c.keywords ?? ""}`).includes(q));
  }, [commands, query]);

  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const close = () => {
    setQuery("");
    setActive(0);
    onClose();
  };

  const execute = (command?: Command) => {
    if (!command) return;
    close();
    command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(results[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Qidiruv va buyruqlar">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs palette-backdrop" onClick={close} aria-hidden />
      <div
        className="palette-panel relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-4">
          <Search className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[activeIndex] ? `palette-${activeIndex}` : undefined}
            aria-label="Sahifa yoki amalni qidirish"
            placeholder="Sahifa yoki amalni qidiring..."
            autoComplete="off"
            spellCheck={false}
            className="h-14 w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 outline-hidden"
          />
          <kbd className="shrink-0 rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">Esc</kbd>
        </div>

        <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Hech narsa topilmadi</li>
          )}
          {results.map((c, i) => {
            const Icon = c.icon;
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {header && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {header}
                  </div>
                )}
                <div
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => execute(c)}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-3 text-sm",
                    i === activeIndex
                      ? "bg-teal-500/10 text-teal-800 dark:text-teal-200"
                      : "text-slate-700 dark:text-slate-300"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {i === activeIndex && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 opacity-70" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
