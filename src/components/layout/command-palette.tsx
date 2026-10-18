"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CornerDownLeft,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  Moon,
  Plus,
  Search,
  ShoppingBag,
  Sun,
  Target,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { navLinksFor, sectionsFor } from "./nav-links";
import { cachedSearchIndex, loadSearchIndex } from "./search-index";
import { logoutAction } from "@/actions/auth.actions";
import { highlightRanges, queryTokens, rankItems, type SearchItem, type SearchKind } from "@/lib/search";
import { cn } from "@/lib/utils";

type GroupId = SearchKind | "page" | "action" | "recent";

interface Entry {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string;
  group: GroupId;
  icon: LucideIcon;
  run: () => void;
}

const GROUP_LABELS: Record<GroupId, string> = {
  recent: "So'nggi darslar",
  student: "O'quvchilar",
  group: "Guruhlar",
  lesson: "Darslar",
  material: "Materiallar",
  exam: "Imtihonlar",
  quest: "Topshiriqlar",
  product: "Do'kon",
  page: "Sahifalar",
  action: "Amallar",
};

const KIND_ICONS: Record<SearchKind, LucideIcon> = {
  lesson: BookOpen,
  material: FileText,
  exam: GraduationCap,
  quest: Target,
  product: ShoppingBag,
  student: UserRound,
  group: Users,
};

// Har tur uchun alohida rang — ro'yxatda nima ekanini bir qarashda ajratish uchun
const ICON_TONES: Record<GroupId, string> = {
  recent: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  lesson: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  material: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  exam: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  quest: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  product: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  student: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  group: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  page: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  action: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

const MENTOR_ACTIONS: { href: string; label: string; keywords: string }[] = [
  { href: "/mentor/lessons/new", label: "Yangi dars yaratish", keywords: "dars qoshish lesson" },
  { href: "/mentor/announcements/new", label: "Yangi e'lon (tabrik, xabar)", keywords: "elon e'lon xabar tabrik bayram yangi yil hayit announcement" },
  { href: "/mentor/groups", label: "Davomat ochish", keywords: "qr kod sessiya davomat jurnal" },
  { href: "/mentor/shop", label: "Do'konga mahsulot qo'shish", keywords: "mahsulot sovga" },
];

const STUDENT_ACTIONS: { href: string; label: string; keywords: string }[] = [
  { href: "/attendance", label: "Davomatdan o'tish", keywords: "qr kod" },
  { href: "/shop/orders", label: "Buyurtmalarim", keywords: "dokon xarid" },
];

/** Bir guruhda ko'rsatiladigan eng ko'p natija (faqat bitta guruh topilsa — ko'proq) */
const PER_GROUP = 5;
const SINGLE_GROUP = 20;

/** Sarlavhaning topilgan qismi qalin va rangli */
function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  const ranges = highlightRanges(text, tokens);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (const [start, end] of ranges) {
    if (start > from) parts.push(text.slice(from, start));
    parts.push(
      <mark key={start} className="rounded-sm bg-transparent font-bold text-teal-700 dark:text-teal-300">
        {text.slice(start, end)}
      </mark>
    );
    from = end;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

export function CommandPalette({
  role,
  open,
  onClose,
  gamification = false,
}: {
  role: "mentor" | "student";
  open: boolean;
  onClose: () => void;
  gamification?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<SearchItem[] | null>(() => cachedSearchIndex());
  const [failed, setFailed] = useState(false);
  // Faqat birinchi yuklashda kutiladi; keyingi ochilishlarda eski ro'yxat darhol ko'rinadi
  const loading = index === null && !failed;
  // Uzun ro'yxatda ham yozish sekinlashmasligi uchun
  const deferredQuery = useDeferredValue(query);

  // Har ochilganda ro'yxat yangilanadi (xotirada bo'lsa — darhol ko'rinadi, orqada yangilanadi)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadSearchIndex()
      .then((items) => {
        if (cancelled) return;
        setIndex(items);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const commands = useMemo<Entry[]>(() => {
    const go = (href: string) => () => router.push(href);
    // Bo'limlarning ichki sahifalari (tablar) ham alohida topiladi: "Sozlamalar · Excel import"
    const tabs = sectionsFor(role, gamification).flatMap((s) => s.tabs.map((t) => ({ href: t.href, label: `${s.label} · ${t.label}`, shortLabel: s.label, icon: t.icon })));
    const links = [...navLinksFor(role, gamification).filter((l) => !tabs.some((t) => t.href === l.href)), ...tabs];
    const actions = role === "mentor" ? MENTOR_ACTIONS : STUDENT_ACTIONS;
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    return [
      ...links.map((l): Entry => ({ id: l.href, title: l.label, group: "page", icon: l.icon, keywords: l.shortLabel, run: go(l.href) })),
      ...actions.map((a): Entry => ({ id: `a:${a.href}`, title: a.label, group: "action", icon: Plus, keywords: a.keywords, run: go(a.href) })),
      {
        id: "theme",
        title: isDark ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish",
        group: "action",
        icon: isDark ? Sun : Moon,
        keywords: "tema rang dark light tungi kun tun",
        run: () => {
          const next = isDark ? "light" : "dark";
          localStorage.setItem("theme", next);
          document.documentElement.classList.toggle("dark", next === "dark");
          window.dispatchEvent(new Event("itxiva:theme"));
        },
      },
      { id: "logout", title: "Tizimdan chiqish", group: "action", icon: LogOut, keywords: "chiqish logout", run: () => void logoutAction() },
    ];
    // `open` — har ochilganda joriy tema bo'yicha yorliq yangilanadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, router, open, gamification]);

  const content = useMemo<Entry[]>(
    () =>
      (index ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        keywords: item.keywords,
        group: item.kind,
        icon: KIND_ICONS[item.kind],
        run: () => router.push(item.href),
      })),
    [index, router]
  );

  const tokens = useMemo(() => queryTokens(deferredQuery), [deferredQuery]);

  // Guruhlangan natijalar: eng mos natijasi bor guruh birinchi turadi
  const sections = useMemo<{ group: GroupId; entries: Entry[]; total: number }[]>(() => {
    if (tokens.length === 0) {
      const recent =
        role === "student"
          ? content
              .filter((e) => e.group === "lesson")
              .slice(0, 3)
              .map((e) => ({ ...e, id: `recent:${e.id}`, group: "recent" as const }))
          : [];
      return (["recent", "page", "action"] as const)
        .map((group) => {
          const entries = group === "recent" ? recent : commands.filter((c) => c.group === group);
          return { group, entries, total: entries.length };
        })
        .filter((s) => s.entries.length > 0);
    }
    const ranked = rankItems([...content, ...commands], deferredQuery);
    const byGroup = new Map<GroupId, { entries: Entry[]; best: number }>();
    for (const { item, score } of ranked) {
      const bucket = byGroup.get(item.group) ?? { entries: [], best: score };
      bucket.entries.push(item);
      byGroup.set(item.group, bucket);
    }
    const limit = byGroup.size === 1 ? SINGLE_GROUP : PER_GROUP;
    return [...byGroup.entries()]
      .sort((a, b) => b[1].best - a[1].best)
      .map(([group, b]) => ({ group, entries: b.entries.slice(0, limit), total: b.entries.length }));
  }, [tokens, deferredQuery, content, commands, role]);

  const flat = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

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

  const execute = (entry?: Entry) => {
    if (!entry) return;
    close();
    entry.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(1, flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + flat.length) % Math.max(1, flat.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(flat[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const searching = tokens.length > 0;
  const placeholder = role === "mentor" ? "O'quvchi, dars, guruh, imtihon yoki sahifa…" : "Dars, material, imtihon, topshiriq yoki sahifa…";
  let position = 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Qidiruv">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs palette-backdrop" onClick={close} aria-hidden />
      <div
        className="palette-panel relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-4">
          {loading ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-teal-600 dark:text-teal-400" />
          ) : (
            <Search className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
          )}
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
            aria-activedescendant={flat[activeIndex] ? `palette-${activeIndex}` : undefined}
            aria-label="Qidirish"
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="h-14 w-full bg-transparent text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 outline-hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActive(0);
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
            >
              Tozalash
            </button>
          ) : (
            <kbd className="shrink-0 rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">Esc</kbd>
          )}
        </div>

        <ul ref={listRef} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {flat.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {loading ? "Yuklanmoqda…" : (
                <>
                  <span className="block font-medium text-slate-700 dark:text-slate-300">“{query.trim()}” bo&apos;yicha hech narsa topilmadi</span>
                  <span className="mt-1 block text-xs">So&apos;zni qisqartirib yoki boshqacha yozib ko&apos;ring</span>
                </>
              )}
            </li>
          )}
          {sections.map((section) => (
            <Fragment key={section.group}>
              <li role="presentation" className="flex items-center justify-between px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>{GROUP_LABELS[section.group]}</span>
                {searching && section.total > section.entries.length && (
                  <span className="normal-case tracking-normal font-medium">
                    {section.entries.length} / {section.total}
                  </span>
                )}
              </li>
              {section.entries.map((entry) => {
                const i = position++;
                const Icon = entry.icon;
                const selected = i === activeIndex;
                return (
                  <li
                    key={entry.id}
                    id={`palette-${i}`}
                    role="option"
                    aria-selected={selected}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => execute(entry)}
                    className={cn(
                      "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm",
                      selected ? "bg-teal-500/10 text-teal-900 dark:text-teal-100" : "text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ICON_TONES[entry.group])}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        <Highlighted text={entry.title} tokens={tokens} />
                      </span>
                      {entry.subtitle && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{entry.subtitle}</span>}
                    </span>
                    {selected && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 opacity-70" />}
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>

        <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-800 px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline">
            <kbd className="font-sans">↑↓</kbd> tanlash · <kbd className="font-sans">Enter</kbd> ochish · <kbd className="font-sans">Esc</kbd> yopish
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            {failed && !index ? (
              "Ma'lumotlarni yuklab bo'lmadi — faqat sahifalar"
            ) : loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Yuklanmoqda
              </>
            ) : index ? (
              `${index.length} ta element ichidan`
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
