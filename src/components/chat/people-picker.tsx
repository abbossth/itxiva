"use client";

import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchChatPeopleAction, type ChatPerson } from "@/actions/chat.actions";

/** Ism bo'yicha odam qidirish: bitta (onPick) yoki bir nechta (selected + onToggle) tanlash */
export function PeoplePicker({
  onPick,
  selected,
  onToggle,
  exclude = [],
}: {
  onPick?: (p: ChatPerson) => void;
  selected?: ChatPerson[];
  onToggle?: (p: ChatPerson) => void;
  exclude?: string[];
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<ChatPerson[] | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void searchChatPeopleAction(q).then((r) => {
        if (alive && r.success) setList(r.data);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const chosen = new Set((selected ?? []).map((p) => p.id));
  const shown = (list ?? []).filter((p) => !exclude.includes(p.id));

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ism yoki familiya..."
          aria-label="Odam qidirish"
          className="min-h-[44px] w-full bg-transparent text-sm outline-none"
        />
      </label>
      {selected && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle?.(p)}
              className="cursor-pointer rounded-full bg-teal-500/15 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-500/25 dark:text-teal-200"
            >
              {p.name.split(" ").slice(0, 2).join(" ")} ✕
            </button>
          ))}
        </div>
      )}
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {list === null && <li className="p-3 text-sm text-slate-500">Qidirilmoqda…</li>}
        {list !== null && shown.length === 0 && <li className="p-3 text-sm text-slate-500">Hech kim topilmadi</li>}
        {shown.map((p) => {
          const on = chosen.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => (onPick ? onPick(p) : onToggle?.(p))}
                aria-pressed={onToggle ? on : undefined}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60",
                  on && "bg-teal-50 dark:bg-teal-500/10"
                )}
              >
                <Initials name={p.name} mentor={p.role === "mentor"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{p.name}</span>
                  <span className="block text-xs text-slate-500">{p.role === "mentor" ? "Ustoz" : p.group ? `${p.group} guruhi` : "O'quvchi"}</span>
                </span>
                {onToggle && on && <Check className="h-4 w-4 text-teal-600" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const PALETTE = [
  "from-teal-500 to-emerald-500",
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-blue-600",
  "from-rose-500 to-pink-500",
  "from-amber-500 to-orange-500",
  "from-fuchsia-500 to-purple-600",
  "from-cyan-500 to-teal-600",
  "from-lime-500 to-green-600",
];

/** Ismdan barqaror rang (bir odam — doim bir xil rang) */
function colorOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Initials({
  name,
  mentor = false,
  size = "md",
  icon: Icon,
  className,
}: {
  name: string;
  mentor?: boolean;
  size?: "xs" | "sm" | "md";
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white",
        size === "xs" ? "h-7 w-7 text-[10px]" : size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm",
        mentor ? "from-amber-400 to-orange-500" : colorOf(name),
        className
      )}
    >
      {Icon ? <Icon className={size === "md" ? "h-5 w-5" : "h-4 w-4"} /> : letters || "?"}
    </span>
  );
}
