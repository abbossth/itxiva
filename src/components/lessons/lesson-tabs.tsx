"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, BookOpen, ClipboardCheck, HelpCircle, Link2, Paperclip, Settings, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dars sahifasidagi bo'limlar (Dars / Materiallar / Uyga vazifa / Test ...) — bitta uzun sahifa o'rniga tablar.
 * Tanlangan tab manzilda `?tab=` bo'lib turadi: havola bilan aynan kerakli bo'limni ochish mumkin
 * (masalan, bildirishnomadagi "Vazifani ochish" → `?tab=homework`). Eski `#homework` havolalari ham ishlaydi.
 * Yashirin tablar ham sahifada qoladi — yozilgan javob yoki forma tab almashganda yo'qolmaydi.
 */

export type LessonTabIcon = "lesson" | "materials" | "homework" | "quiz" | "results" | "groups" | "profile" | "settings";

const ICONS: Record<LessonTabIcon, LucideIcon> = {
  lesson: BookOpen,
  materials: Paperclip,
  homework: ClipboardCheck,
  quiz: HelpCircle,
  results: BarChart3,
  groups: Link2,
  profile: User,
  settings: Settings,
};

export interface LessonTabDef {
  id: string;
  label: string;
  icon: LessonTabIcon;
  /** Tab yonidagi qisqa belgi: soni yoki holati */
  meta?: string;
  /** attention — e'tibor kerak (topshirilmagan, tekshirilmagan); done — bajarilgan; muted — o'chiq */
  tone?: "default" | "attention" | "done" | "muted";
  /** Tahrirlashda: shu bo'limda saqlanmagan o'zgarish bor */
  dirty?: boolean;
}

const ActiveTabContext = createContext<string | null>(null);

const TAB_EVENT = "lesson-tab";

/** Manzilni tanlangan tabga moslash (sahifa qayta yuklanmaydi) — havolani nusxalasa, aynan shu tab ochiladi */
function writeTabToUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", id);
  url.hash = "";
  window.history.replaceState(null, "", url);
}

/** Tabni koddan tanlash (masalan, forma xatosi boshqa tabda bo'lsa) */
export function selectLessonTab(id: string) {
  window.dispatchEvent(new CustomEvent<string>(TAB_EVENT, { detail: id }));
}

export function LessonTabs({
  tabs,
  defaultTab,
  children,
  className,
  ariaLabel = "Dars bo'limlari",
}: {
  tabs: LessonTabDef[];
  defaultTab?: string;
  children: React.ReactNode;
  className?: string;
  /** Tablar ro'yxati nomi (ekran o'quvchilar uchun); boshqa sahifalarda ham ishlatiladi, masalan profil */
  ariaLabel?: string;
}) {
  // Birinchi ochilishda — manzildagi ?tab= (server ham aynan shuni chizadi), keyin — bosilgan tab
  const searchParams = useSearchParams();
  const [chosen, setChosen] = useState<string | null>(null);
  const has = (id: string | null | undefined): id is string => Boolean(id) && tabs.some((t) => t.id === id);
  const requested = searchParams.get("tab");
  const active = has(chosen) ? chosen : has(requested) ? requested : has(defaultTab) ? defaultTab : tabs[0]?.id ?? "";
  const listRef = useRef<HTMLDivElement>(null);

  const ids = tabs.map((t) => t.id).join(",");
  useEffect(() => {
    const show = (id: string) => {
      if (!ids.split(",").includes(id)) return;
      setChosen(id);
      writeTabToUrl(id);
    };
    const onSelect = (e: Event) => show((e as CustomEvent<string>).detail);
    window.addEventListener(TAB_EVENT, onSelect);
    // Eski havolalar (#homework) — mos tabga o'tkaziladi; tab bo'lmagan #id (masalan, #telegram) — shu bo'limga aylantiriladi
    const hash = window.location.hash.slice(1);
    const timer = hash
      ? window.setTimeout(() => {
          if (ids.split(",").includes(hash)) show(hash);
          else document.getElementById(hash)?.scrollIntoView({ block: "start" });
        }, 0)
      : undefined;
    return () => {
      window.removeEventListener(TAB_EVENT, onSelect);
      window.clearTimeout(timer);
    };
  }, [ids]);

  const choose = (id: string) => {
    if (id === active) return;
    setChosen(id);
    writeTabToUrl(id);
    // Tab paneli ko'rinmay qolgan bo'lsa (sahifa pastga aylantirilgan), tab qatoriga qaytiladi
    const bar = listRef.current;
    if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: "start" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    choose(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  };

  return (
    <ActiveTabContext.Provider value={active}>
      <div className={cn("space-y-4", className)}>
        {tabs.length > 1 && (
          <div
            ref={listRef}
            className="sticky top-16 z-20 -mx-4 sm:mx-0 px-4 sm:px-1.5 py-1.5 sm:rounded-2xl bg-white/90 dark:bg-bg/90 backdrop-blur-md border-y sm:border border-slate-200/80 dark:border-slate-800/80 scroll-mt-16"
          >
            <div
              role="tablist"
              aria-label={ariaLabel}
              onKeyDown={onKeyDown}
              className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((tab) => {
                const Icon = ICONS[tab.icon];
                const isActive = tab.id === active;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    data-tab={tab.id}
                    id={`lesson-tab-${tab.id}`}
                    aria-selected={isActive}
                    aria-controls={`lesson-panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => choose(tab.id)}
                    className={cn(
                      "relative flex shrink-0 items-center gap-2 px-3 sm:px-4 min-h-[44px] rounded-xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer",
                      "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500",
                      isActive
                        ? "bg-teal-500/10 text-teal-700 dark:text-teal-300"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400")} />
                    <span>{tab.label}</span>
                    {tab.meta && (
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums",
                          tab.tone === "attention"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : tab.tone === "done"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : tab.tone === "muted"
                            ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            : "bg-slate-200/70 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300"
                        )}
                      >
                        {tab.meta}
                      </span>
                    )}
                    {tab.dirty && (
                      <span className="h-2 w-2 rounded-full bg-amber-500" title="Saqlanmagan o'zgarish bor" aria-label="saqlanmagan o'zgarish" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {children}
      </div>
    </ActiveTabContext.Provider>
  );
}

export function LessonTabPanel({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const active = useContext(ActiveTabContext);
  return (
    <div
      role="tabpanel"
      id={`lesson-panel-${id}`}
      aria-labelledby={`lesson-tab-${id}`}
      hidden={active !== id}
      className={cn("animate-in fade-in", className)}
    >
      {children}
    </div>
  );
}
