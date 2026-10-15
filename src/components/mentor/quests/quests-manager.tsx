"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, ClipboardCheck, Code2, Flag, Flame, Pencil, Plus, Search, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { setQuestActiveAction, type MentorQuestsData, type MentorQuestRow } from "@/actions/quest.actions";
import { QUEST_TEMPLATES, REPEAT_LABEL, VERIFY_LABEL, VERIFY_TONE, rewardLabel } from "@/lib/gamification/labels";
import type { QuestVerify } from "@/lib/db/models/quest.model";
import { cn } from "@/lib/utils";

type Filter = "all" | "auto" | "mentor" | "proof";

const TEMPLATE_ICON = { certificate: Award, project: Code2, habit: Flame, group_challenge: Flag } as const;

function subtitleOf(row: MentorQuestRow): string {
  const q = row.quest;
  if (q.status === "draft") return "Qoralama";
  if (q.verify === "auto") return q.repeat === "daily" ? "Kunlik · tizim o'zi hisoblaydi" : "Tizim o'zi hisoblaydi";
  if (q.verify === "competition") return "Birinchi 3 ta to'g'ri yechim";
  const ev = [q.evidence.link !== "none" && "havola", q.evidence.file && "fayl", q.evidence.certId && "ID", q.evidence.note && "izoh"].filter(Boolean);
  return ev.length ? ev.join(" + ").replace(/^./, (c) => c.toUpperCase()) : VERIFY_LABEL[q.verify];
}

function doneLabel(row: MentorQuestRow) {
  const q = row.quest;
  if (q.repeat === "daily") return { main: `${row.done}/${row.audienceSize}`, hint: "bugun" };
  if (q.repeat === "weekly") return { main: `${row.done}/${row.audienceSize}`, hint: "shu hafta" };
  if (q.repeat === "once") return { main: `${row.done}/${row.audienceSize}`, hint: "" };
  return { main: `${row.done}`, hint: row.pending ? `tasdiqlangan · ${row.pending} kutmoqda` : "tasdiqlangan" };
}

function ActiveToggle({ row }: { row: MentorQuestRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(row.quest.isActive);
  const [busy, setBusy] = useState(false);
  const disabled = row.quest.status !== "published" || busy;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${row.quest.title}: ${on ? "faol" : "to'xtatilgan"}`}
      disabled={disabled}
      onClick={async () => {
        const next = !on;
        setOn(next);
        setBusy(true);
        const res = await setQuestActiveAction(row.quest._id, next).catch(() => null);
        setBusy(false);
        if (!res?.success) {
          setOn(!next);
          toast.error(res?.message || "O'zgartirib bo'lmadi");
        } else router.refresh();
      }}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        on ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700",
        "after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform",
        on && "after:translate-x-5"
      )}
    />
  );
}

export function QuestsManager({ data }: { data: MentorQuestsData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => {
      const verify: QuestVerify = r.quest.verify;
      if (filter === "auto" && verify !== "auto") return false;
      if (filter === "mentor" && verify !== "mentor" && verify !== "competition") return false;
      if (filter === "proof" && verify !== "proof") return false;
      if (q && !r.quest.title.toLowerCase().includes(q)) return false;
      if (groupId) {
        const g = data.groups.find((x) => x._id === groupId);
        const a = r.quest.audience;
        const all = a.groupIds.length === 0 && a.grades.length === 0;
        if (!all && !a.groupIds.includes(groupId) && !(g && a.grades.includes(g.grade))) return false;
      }
      return true;
    });
  }, [data, filter, query, groupId]);

  const stat = (label: string, value: React.ReactNode, hint: string, highlight = false, icon?: React.ReactNode) => (
    <div
      className={cn(
        "rounded-2xl border p-4",
        highlight
          ? "border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40"
          : "border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface"
      )}
    >
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-300">
        {label}
        {icon}
      </div>
      <div className="mt-1 font-mono text-3xl font-black tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>
    </div>
  );

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        icon={Target}
        title="Topshiriqlar"
        subtitle="O'quvchilar bajarib coin va XP oladigan qo'shimcha vazifalar"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/mentor/quests/review" className={buttonVariants({ variant: "outline", className: "gap-2" })}>
              <ClipboardCheck className="w-4 h-4" />
              Tekshirish ({data.stats.pending})
            </Link>
            <Link href="/mentor/quests/new" className={buttonVariants({ variant: "primary", className: "gap-2" })}>
              <Plus className="w-4 h-4" />
              Yangi topshiriq
            </Link>
          </div>
        }
      />

      {!data.enabled && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          Gamifikatsiya o&apos;chiq — o&apos;quvchilar topshiriqlarni ko&apos;rmaydi.{" "}
          <Link href="/mentor/settings?tab=gamification" className="font-semibold underline">
            Sozlamalarda yoqish
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("Tekshirish kerak", data.stats.pending, "yuborilgan dalil va ish", data.stats.pending > 0, <ClipboardCheck className="w-4 h-4 text-amber-600" />)}
        {stat("Faol topshiriqlar", data.stats.active, `${data.stats.activeAuto} tasi avtomatik tekshiriladi`)}
        {stat(
          "Topshiriqlardan coin",
          <span className="text-amber-700 dark:text-amber-400">{data.stats.coinsThisMonth}</span>,
          "shu oy berilgan"
        )}
        {stat(
          "Qatnashayotganlar",
          <>
            {data.stats.participants}
            <span className="text-lg text-slate-400">/{data.stats.students}</span>
          </>,
          "shu oy kamida bittasini bajargan"
        )}
      </div>

      <section aria-labelledby="templates" className="space-y-2">
        <h2 id="templates" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Shablondan boshlash
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {QUEST_TEMPLATES.map((t) => {
            const Icon = TEMPLATE_ICON[t.id as keyof typeof TEMPLATE_ICON] ?? Award;
            return (
              <Link
                key={t.id}
                href={`/mentor/quests/new?template=${t.id}`}
                className="flex items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-3 min-h-[60px] hover:border-teal-500/60 transition-colors"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{t.title}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{t.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:min-w-[12rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Topshiriq qidirish..." className="pl-9" aria-label="Topshiriq qidirish" />
        </div>
        {/* Tor ekranda filtr tugmalari siqilmaydi — gorizontal aylanadi */}
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] lg:mx-0 lg:shrink-0 lg:px-0">
          <SegmentedControl
            ariaLabel="Turi bo'yicha"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Barchasi" },
              { value: "auto", label: "Avtomatik" },
              { value: "mentor", label: "Mentor tekshiradi" },
              { value: "proof", label: "Dalil bilan" },
            ]}
            className="max-w-none [&>button]:flex-none"
          />
        </div>
        <div className="lg:w-48 lg:shrink-0">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Guruh">
            <option value="">Barcha guruhlar</option>
            {data.groups.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {data.rows.length === 0 ? "Hali topshiriq yo'q — shablondan boshlang." : "Bu filtr bo'yicha topshiriq topilmadi."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface">
          <div className="hidden lg:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)_56px_48px] gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span>Topshiriq</span>
            <span>Turi</span>
            <span>Mukofot</span>
            <span>Kimga</span>
            <span>Takrorlanish</span>
            <span>Bajargan</span>
            <span>Faol</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {rows.map((row) => {
              const q = row.quest;
              const done = doneLabel(row);
              return (
                <li
                  key={q._id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)_56px_48px] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{q.title}</div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitleOf(row)}</div>
                  </div>
                  <div className="row-span-2 flex items-center gap-2 lg:hidden">
                    <ActiveToggle row={row} />
                    <Link href={`/mentor/quests/${q._id}/edit`} aria-label={`${q.title}: tahrirlash`} className={buttonVariants({ variant: "outline", size: "sm", className: "h-10 w-10 p-0" })}>
                      <Pencil className="w-4 h-4" />
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs lg:contents">
                    <span>
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold", VERIFY_TONE[q.verify])}>{VERIFY_LABEL[q.verify]}</span>
                    </span>
                    <span className="font-mono text-sm">
                      <b className="text-amber-700 dark:text-amber-400">{rewardLabel(q.reward, q.verify)}</b>
                      {q.verify !== "competition" && q.reward.coinsMin === q.reward.coinsMax && (
                        <span className="text-slate-500 dark:text-slate-400"> · {q.reward.xp ?? q.reward.coinsMin} XP</span>
                      )}
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-300">{row.audienceLabel}</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {REPEAT_LABEL[q.repeat]}
                      {q.guard.monthlyLimit ? ` · oyiga ${q.guard.monthlyLimit}` : ""}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      <b className="font-mono text-slate-900 dark:text-slate-100">{done.main}</b> {done.hint}
                    </span>
                  </div>
                  <span className="hidden lg:block">
                    <ActiveToggle row={row} />
                  </span>
                  <Link href={`/mentor/quests/${q._id}/edit`} aria-label={`${q.title}: tahrirlash`} className={buttonVariants({ variant: "outline", size: "sm", className: "hidden lg:inline-flex h-10 w-10 p-0" })}>
                    <Pencil className="w-4 h-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
