"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, ExternalLink, FileText, Inbox, Info, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  approveQuestSubmissionAction,
  getQuestFileUrlAction,
  rejectQuestSubmissionAction,
  revokeQuestSubmissionAction,
  type ReviewCategory,
  type ReviewItem,
} from "@/actions/quest-review.actions";
import { REJECT_REASONS } from "@/lib/gamification/proof";
import { VERIFY_LABEL } from "@/lib/gamification/labels";
import { openResolvedUrl } from "@/lib/open-tab";
import { cn, formatDateUz, formatTimeUz } from "@/lib/utils";

type Filter = "all" | ReviewCategory;
const CATEGORY_LABEL: Record<ReviewCategory, string> = { certificate: "Sertifikat", project: "Loyiha", other: "Boshqa" };

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
}

function ago(iso: string): { text: string; old: boolean } {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return { text: `${Math.max(1, Math.round(h * 60))} daq`, old: false };
  if (h < 24) return { text: `${Math.round(h)} soat`, old: false };
  const d = Math.floor(h / 24);
  return { text: d === 1 ? "kecha" : `${d} kun`, old: d >= 3 };
}

/** Oraliq mukofot uchun 4 ta tez qiymat (60–150 → 60·90·120·150) */
function quickValues(min: number, max: number): number[] {
  if (min === max) return [min];
  return [...new Set([0, 1, 2, 3].map((i) => Math.round(min + ((max - min) * i) / 3)))];
}

const isTyping = (el: Element | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement | null)?.isContentEditable;

/** Havolani ko'rsatish uchun: protokolsiz */
const displayUrl = (u: string) => u.replace(/^https?:\/\//, "");

export function ReviewQueue({ items: initial, view }: { items: ReviewItem[]; view: "pending" | "approved" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.submission._id ?? null);
  const visible = useMemo(() => items.filter((i) => filter === "all" || i.category === filter), [items, filter]);
  const index = Math.max(0, visible.findIndex((i) => i.submission._id === selectedId));
  const current = visible[index] ?? null;

  const counts = useMemo(() => {
    const c: Record<ReviewCategory, number> = { certificate: 0, project: 0, other: 0 };
    for (const i of items) c[i.category]++;
    return c;
  }, [items]);

  const go = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + delta))];
      setSelectedId(next.submission._id);
    },
    [visible, index]
  );

  const removeCurrent = useCallback(() => {
    if (!current) return;
    const nextVisible = visible.filter((i) => i.submission._id !== current.submission._id);
    setItems((all) => all.filter((i) => i.submission._id !== current.submission._id));
    setSelectedId(nextVisible[Math.min(index, nextVisible.length - 1)]?.submission._id ?? null);
    router.refresh();
  }, [current, visible, index, router]);

  const oldest = items.length ? ago(items.reduce((a, b) => (a.submission.submittedAt < b.submission.submittedAt ? a : b)).submission.submittedAt) : null;

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Tekshiruv navbati</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {view === "pending"
              ? items.length
                ? `${items.length} ta yuborilgan ish kutmoqda · eng eskisi ${oldest?.text === "kecha" ? "kecha" : `${oldest?.text} oldin`}`
                : "Hamma ish tekshirilgan"
              : "Oxirgi tasdiqlangan ishlar — soxta dalil aniqlansa, mukofotni bekor qilish mumkin"}
          </p>
        </div>
        <Link href={view === "pending" ? "/mentor/quests/review?view=approved" : "/mentor/quests/review"} className="text-sm font-semibold text-teal-700 dark:text-teal-400 hover:underline min-h-[40px] inline-flex items-center">
          {view === "pending" ? "Tasdiqlanganlar →" : "← Kutilayotganlar"}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
          <Inbox className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{view === "pending" ? "Navbat bo'sh — yangi dalil kelganda Telegram'ga xabar keladi." : "Hali tasdiqlangan ish yo'q."}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface">
            <div role="tablist" className="flex flex-wrap gap-1.5 border-b border-slate-100 dark:border-slate-800 p-3">
              {(["all", "certificate", "project", "other"] as const).map((f) => {
                const n = f === "all" ? items.length : counts[f];
                if (f !== "all" && n === 0) return null;
                return (
                  <button
                    key={f}
                    role="tab"
                    type="button"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "min-h-[36px] rounded-full border px-3 text-xs font-bold cursor-pointer",
                      filter === f ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    {f === "all" ? "Barchasi" : CATEGORY_LABEL[f]} {n}
                  </button>
                );
              })}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {visible.map((i) => {
                const a = ago(i.submission.submittedAt);
                const on = i.submission._id === current?.submission._id;
                return (
                  <li key={i.submission._id}>
                    <button
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => setSelectedId(i.submission._id)}
                      className={cn(
                        "flex w-full items-center gap-3 border-l-[3px] px-3 py-2.5 text-left min-h-[56px] cursor-pointer",
                        on ? "border-teal-600 bg-teal-500/5" : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      )}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                        {initials(i.student.fullName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">{i.student.fullName}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {i.quest.title}
                          {i.student.groupName ? ` · ${i.student.groupName}` : ""}
                        </span>
                      </span>
                      <span className={cn("shrink-0 text-xs", a.old ? "font-bold text-rose-600" : "text-slate-500")}>{a.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {view === "pending" && (
              <div className="hidden lg:flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-500">
                {[
                  ["J", "/", "K", "keyingi"],
                  ["A", "", "", "tasdiqlash"],
                  ["R", "", "", "rad etish"],
                ].map(([k1, sep, k2, label]) => (
                  <span key={label} className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-slate-300 dark:border-slate-700 px-1 font-mono">{k1}</kbd>
                    {sep}
                    {k2 && <kbd className="rounded border border-slate-300 dark:border-slate-700 px-1 font-mono">{k2}</kbd>}
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {current && (
            <ReviewDetail
              key={current.submission._id}
              item={current}
              position={`${index + 1} / ${visible.length}`}
              view={view}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
              onDone={removeCurrent}
              toast={toast}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReviewDetail({
  item,
  position,
  view,
  onPrev,
  onNext,
  onDone,
  toast,
}: {
  item: ReviewItem;
  position: string;
  view: "pending" | "approved";
  onPrev: () => void;
  onNext: () => void;
  onDone: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const q = item.quest;
  const s = item.submission;
  const e = s.evidence;
  const values = quickValues(q.reward.coinsMin, q.reward.coinsMax);
  const [coins, setCoins] = useState(values[Math.max(0, values.length - 2)] ?? q.reward.coinsMin);
  const [checklist, setChecklist] = useState({ name: false, course: false, date: false, program: false });
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const xp = q.reward.xp ?? coins;
  const isCompetition = q.verify === "competition";

  const approve = async () => {
    if (busy) return;
    setBusy("approve");
    const res = await approveQuestSubmissionAction({ submissionId: s._id, coins, checklist }).catch(() => null);
    setBusy(null);
    if (res?.success) {
      toast.success(res.message || "Tasdiqlandi");
      onDone();
    } else toast.error(res?.message || "Tasdiqlab bo'lmadi");
  };

  const reject = async () => {
    if (busy) return;
    if (reason.trim().length < 3) {
      setCustomReason(true);
      setTimeout(() => reasonRef.current?.focus(), 0);
      toast.error("Sababini tanlang yoki yozing");
      return;
    }
    setBusy("reject");
    const action = view === "approved" ? revokeQuestSubmissionAction : rejectQuestSubmissionAction;
    const res = await action({ submissionId: s._id, reason: reason.trim() }).catch(() => null);
    setBusy(null);
    if (res?.success) {
      toast.success(res.message || "Bajarildi");
      onDone();
    } else toast.error(res?.message || "Bajarib bo'lmadi");
  };

  // Klaviatura effekti har renderda qayta ulanmasligi uchun tasdiqlash ref orqali chaqiriladi
  const approveRef = useRef(approve);
  useEffect(() => {
    approveRef.current = approve;
  });

  // J/K — keyingi/oldingi, A — tasdiqlash, R — rad etish (matn kiritilayotganda ishlamaydi)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || isTyping(document.activeElement)) return;
      const k = ev.key.toLowerCase();
      if (k === "j") onNext();
      else if (k === "k") onPrev();
      else if (k === "a" && view === "pending") void approveRef.current();
      else if (k === "r") {
        ev.preventDefault();
        setCustomReason(true);
        setTimeout(() => reasonRef.current?.focus(), 0);
      } else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, view]);

  const openFile = async () => {
    const ok = await openResolvedUrl(async () => (await getQuestFileUrlAction(s._id)).url ?? null);
    if (!ok) toast.error("Faylni ochib bo'lmadi");
  };

  const field = (label: string, value?: string | null, mono = false) =>
    value ? (
      <div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        <div className={cn("font-bold text-slate-900 dark:text-slate-100 break-words", mono && "font-mono")}>{value}</div>
      </div>
    ) : null;

  const nth = item.history.approved + 1;

  return (
    <section aria-label="Tanlangan ish" className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-500/10 text-sm font-bold text-teal-700 dark:text-teal-300">{initials(item.student.fullName)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-black text-slate-900 dark:text-slate-100">{item.student.fullName}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {[item.student.groupName, `${formatDateUz(s.submittedAt)} ${formatTimeUz(s.submittedAt)} da yubordi`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm tabular-nums text-slate-600 dark:text-slate-400">{position}</span>
          <button type="button" onClick={onPrev} aria-label="Oldingi" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={onNext} aria-label="Keyingi" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500 text-white">
          <Award className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900 dark:text-slate-100">{q.title}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {VERIFY_LABEL[q.verify]} · {isCompetition ? `o'rinlar: ${q.reward.places.join("/")}` : q.reward.coinsMin === q.reward.coinsMax ? `${q.reward.coinsMin} coin` : `mukofot oralig'i ${q.reward.coinsMin}–${q.reward.coinsMax} coin`}
          </div>
        </div>
        {item.category === "certificate" && <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Bu o&apos;quvchining {nth}-sertifikati</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {field("Platforma", e.platform)}
        {field("Kurs nomi", e.courseName)}
        {field("Berilgan sana", e.issuedAt ? formatDateUz(e.issuedAt) : null, true)}
        {field("Sertifikat ID", e.certId, true)}
      </div>

      {e.url && (
        <div>
          <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{item.category === "certificate" ? "Tasdiqlash havolasi" : "Havola"}</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs">{displayUrl(e.url)}</code>
            {/* Havola serverda ochilmaydi — mentor o'zi yangi oynada tekshiradi */}
            <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
              Havolani ochish
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {e.fileName ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-5 text-center">
            <FileText className="h-6 w-6 text-slate-500" />
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">{e.fileName}</div>
            {e.fileSize ? <div className="text-xs text-slate-500">{Math.round(e.fileSize / 1024)} KB</div> : null}
            <Button size="sm" variant="outline" onClick={openFile}>
              Ochish
            </Button>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tizim tekshiruvi</div>
          {item.checks.length === 0 && <p className="text-sm text-slate-500">Tekshiruv talab qilinmaydi</p>}
          <ul className="space-y-1.5">
            {item.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                {c.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
                {c.message}
              </li>
            ))}
          </ul>
          {e.url && (
            <p className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-2.5 text-xs text-sky-900 dark:text-sky-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Dalil haqiqiyligini tizim tekshirmaydi — havolani ochib, quyidagilarni o&apos;zingiz belgilang.
            </p>
          )}
        </div>
      </div>

      {view === "pending" && q.verify === "proof" && (
        <fieldset className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Qo&apos;lda tekshirish</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {(
              [
                ["name", `Ism mos: ${item.student.fullName}`],
                ["course", "Kurs nomi mos"],
                ["date", "Sana mos"],
                ["program", "Kurs dasturga tegishli"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-slate-800 dark:text-slate-200">
                <input type="checkbox" checked={checklist[k]} onChange={(ev) => setChecklist((c) => ({ ...c, [k]: ev.target.checked }))} className="h-4 w-4 accent-teal-600" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {e.note && (
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{isCompetition ? "Yechim" : "O'quvchi izohi"}</div>
          <p className={cn("whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 text-sm text-slate-700 dark:text-slate-300", isCompetition && "font-mono text-xs")}>{e.note}</p>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-3 sm:p-4">
        {view === "pending" &&
          (isCompetition ? (
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <b>Mukofot:</b> o&apos;rin tasdiqlanish tartibida avtomatik beriladi ({q.reward.places.join(" / ")} coin). To&apos;rtinchidan keyingilar coin olmaydi.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Mukofot</span>
              <div role="radiogroup" aria-label="Mukofot miqdori" className="inline-flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                {values.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={coins === v}
                    onClick={() => setCoins(v)}
                    className={cn("min-h-[36px] min-w-[48px] rounded-lg px-2 font-mono text-sm font-bold cursor-pointer", coins === v ? "bg-white dark:bg-surface text-amber-700 dark:text-amber-400 shadow-xs" : "text-slate-600 dark:text-slate-400")}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {q.reward.coinsMin !== q.reward.coinsMax && (
                <Input
                  type="number"
                  min={q.reward.coinsMin}
                  max={q.reward.coinsMax}
                  value={coins}
                  onChange={(ev) => setCoins(Math.round(Number(ev.target.value) || 0))}
                  aria-label="Boshqa miqdor"
                  className="w-24 min-h-[36px]"
                />
              )}
              <span className="text-xs text-slate-500">coin · {q.reward.xp === null ? "XP ham shuncha" : `${xp} XP`}</span>
            </div>
          ))}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-600 dark:text-slate-400">{view === "pending" ? "Rad etish sababi:" : "Bekor qilish sababi:"}</span>
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => {
                  setReason(r);
                  setCustomReason(false);
                }}
                className={cn("min-h-[32px] rounded-full border px-2.5 text-xs font-semibold cursor-pointer", reason === r ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300" : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300")}
              >
                {r}
              </button>
            ))}
            <button type="button" onClick={() => setCustomReason(true)} className="min-h-[32px] rounded-full border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              Boshqa…
            </button>
          </div>
          {customReason && (
            <Textarea ref={reasonRef} value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2} maxLength={1000} placeholder="O'quvchiga nima uchun ekanini yozing" aria-label="Sabab" />
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Send className="h-3.5 w-3.5" />
            Natija o&apos;quvchiga Telegram orqali boradi
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reject} isLoading={busy === "reject"} disabled={busy !== null} className="flex-1 sm:flex-none border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40 gap-1.5">
              {view === "approved" && <Undo2 className="h-4 w-4" />}
              {view === "pending" ? "Rad etish" : "Mukofotni bekor qilish"}
            </Button>
            {view === "pending" && (
              <Button onClick={approve} isLoading={busy === "approve"} disabled={busy !== null} className="flex-1 sm:flex-none gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <Check className="h-4 w-4" />
                Tasdiqlash{isCompetition ? "" : ` · +${coins}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
