"use client";

import { useState } from "react";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { Archive, Check, Send, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { archiveQuestAction, saveQuestAction, type QuestFormContext } from "@/actions/quest.actions";
import type { QuestView } from "@/lib/gamification/quest-view";
import {
  AUTO_KIND_HAS_TARGET,
  AUTO_KIND_LABEL,
  DIFFICULTY_LABEL,
  QUEST_TEMPLATES,
  REPEAT_LABEL,
  VERIFY_HINT,
  VERIFY_LABEL,
  VERIFY_TONE,
  rewardLabel,
} from "@/lib/gamification/labels";
import type { QuestAutoKind, QuestDifficulty, QuestTemplate, QuestVerify } from "@/lib/db/models/quest.model";
import type { QuestRepeat } from "@/lib/gamification/periods";
import { fromTashkentInputValue, toTashkentInputValue } from "@/lib/schedule";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5 space-y-4";

interface FormState {
  title: string;
  description: string;
  difficulty: QuestDifficulty;
  verify: QuestVerify;
  template: QuestTemplate | null;
  autoKind: QuestAutoKind;
  autoTarget: number;
  evidence: { link: "required" | "optional" | "none"; file: boolean; certId: boolean; note: boolean };
  guard: { uniqueProof: boolean; dateAfterJoin: boolean; monthlyLimit: number | null };
  fixedReward: boolean;
  coinsMin: number;
  coinsMax: number;
  xpSame: boolean;
  xp: number;
  places: [number, number, number];
  groupIds: string[];
  repeat: QuestRepeat;
  startsAt: string;
  endsAt: string;
  announce: boolean;
  onSubmission: boolean;
}

function initialState(quest: QuestView | null, template: QuestTemplate | null): FormState {
  const preset = QUEST_TEMPLATES.find((t) => t.id === template)?.preset;
  const src = quest ?? preset;
  const reward = quest?.reward ?? preset?.reward ?? { coinsMin: 10, coinsMax: 10, xp: null, places: [] };
  const places = reward.places.length === 3 ? (reward.places as [number, number, number]) : ([50, 30, 20] as [number, number, number]);
  return {
    title: src?.title ?? "",
    description: src?.description ?? "",
    difficulty: src?.difficulty ?? "medium",
    verify: src?.verify ?? "mentor",
    template: quest?.template ?? template,
    autoKind: src?.autoRule?.kind ?? "tests_today",
    autoTarget: src?.autoRule?.target ?? 10,
    evidence: src?.evidence ?? { link: "required", file: false, certId: false, note: true },
    guard: src?.guard ?? { uniqueProof: true, dateAfterJoin: false, monthlyLimit: null },
    fixedReward: reward.coinsMin === reward.coinsMax,
    coinsMin: reward.coinsMin,
    coinsMax: reward.coinsMax,
    xpSame: reward.xp === null,
    xp: reward.xp ?? reward.coinsMin,
    places,
    groupIds: quest?.audience.groupIds ?? [],
    repeat: src?.repeat ?? "once",
    startsAt: quest?.startsAt ? toTashkentInputValue(quest.startsAt) : "",
    endsAt: quest?.endsAt ? toTashkentInputValue(quest.endsAt) : "",
    announce: quest?.notify.announce ?? true,
    onSubmission: quest?.notify.onSubmission ?? true,
  };
}

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-slate-100">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-500/10 font-mono text-sm font-black text-teal-700 dark:text-teal-300">{n}</span>
      {children}
    </h2>
  );
}

function CheckRow({ checked, onChange, children, extra }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 px-3 py-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-teal-600" />
      <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">{children}</span>
      {extra}
    </label>
  );
}

const num = (v: string) => (v === "" ? 0 : Math.max(0, Math.round(Number(v)) || 0));

export function QuestForm({ quest, template, context }: { quest: QuestView | null; template: QuestTemplate | null; context: QuestFormContext }) {
  const router = useRouter();
  const { toast } = useToast();
  const [f, setF] = useState<FormState>(() => initialState(quest, template));
  const [busy, setBusy] = useState<"draft" | "publish" | "archive" | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((s) => ({ ...s, [key]: value }));
  const templateDef = QUEST_TEMPLATES.find((t) => t.id === f.template);

  const coinsMax = f.fixedReward ? f.coinsMin : f.coinsMax;
  const rewardPreview = { coinsMin: f.coinsMin, coinsMax, xp: f.xpSame ? null : f.xp, places: f.places };
  const audience = f.groupIds.length === 0 ? context.groups : context.groups.filter((g) => f.groupIds.includes(g._id));
  const audienceCount = audience.reduce((s, g) => s + g.students, 0);
  const typical = f.verify === "competition" ? f.places[0] : Math.round((f.coinsMin + coinsMax) / 2);
  const months = context.avgMonthlyCoins > 0 ? typical / context.avgMonthlyCoins : null;
  const evidenceList = [
    f.evidence.link !== "none" && "havola",
    f.evidence.file && "fayl",
    f.evidence.certId && "ID",
    f.evidence.note && "izoh",
  ].filter(Boolean) as string[];

  const submit = async (publish: boolean) => {
    const startsAt = f.startsAt ? fromTashkentInputValue(f.startsAt) : null;
    const endsAt = f.endsAt ? fromTashkentInputValue(f.endsAt) : null;
    const payload = {
      title: f.title,
      description: f.description,
      difficulty: f.difficulty,
      verify: f.verify,
      template: f.template,
      autoRule: f.verify === "auto" ? { kind: f.autoKind, target: AUTO_KIND_HAS_TARGET[f.autoKind] ? f.autoTarget : 1 } : null,
      evidence: f.evidence,
      guard: f.guard,
      reward: {
        coinsMin: f.coinsMin,
        coinsMax: f.verify === "auto" ? f.coinsMin : coinsMax,
        xp: f.xpSame ? null : f.xp,
        places: f.verify === "competition" ? f.places : [],
      },
      audience: { groupIds: f.groupIds, grades: [] },
      repeat: f.verify === "competition" ? "weekly" : f.repeat,
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      notify: { announce: f.announce, onSubmission: f.onSubmission },
      publish,
    };
    try {
      setBusy(publish ? "publish" : "draft");
      const res = await saveQuestAction(payload, quest?._id);
      if (res.success) {
        toast.success(res.message || "Saqlandi");
        router.push("/mentor/quests");
        router.refresh();
      } else toast.error(res.message || "Saqlab bo'lmadi");
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setBusy(null);
    }
  };

  const archive = async () => {
    if (!quest) return;
    setBusy("archive");
    const res = await archiveQuestAction(quest._id).catch(() => null);
    setBusy(null);
    setConfirmArchive(false);
    if (res?.success) {
      toast.success(res.message || "Arxivga olindi");
      router.push("/mentor/quests");
      router.refresh();
    } else toast.error(res?.message || "Arxivga olib bo'lmadi");
  };

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        icon={Target}
        title={quest ? "Topshiriqni tahrirlash" : "Yangi topshiriq"}
        subtitle={templateDef ? `Shablon: ${templateDef.title}` : undefined}
        backHref="/mentor/quests"
        backLabel="Topshiriqlar"
        actions={
          <div className="flex flex-wrap gap-2">
            {quest && !quest.isSystem && (
              <Button variant="ghost" onClick={() => setConfirmArchive(true)} disabled={busy !== null} className="gap-2">
                <Archive className="w-4 h-4" />
                Arxivga olish
              </Button>
            )}
            {quest?.status !== "published" && (
              <Button variant="outline" onClick={() => submit(false)} isLoading={busy === "draft"} disabled={busy !== null}>
                Qoralama sifatida saqlash
              </Button>
            )}
            <Button onClick={() => submit(true)} isLoading={busy === "publish"} disabled={busy !== null} className="gap-2">
              {quest?.status === "published" ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {quest?.status === "published" ? "Saqlash" : "E'lon qilish"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-4 min-w-0">
          <section className={card}>
            <SectionTitle n={1}>Asosiy ma&apos;lumot</SectionTitle>
            <Field htmlFor="q-title" label="Nomi" required>
              <Input id="q-title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={140} />
            </Field>
            <Field htmlFor="q-desc" label="Tavsif">
              <Textarea id="q-desc" value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={4000} />
            </Field>
            <Field label="Qiyinlik">
              <SegmentedControl
                ariaLabel="Qiyinlik"
                value={f.difficulty}
                onChange={(v) => set("difficulty", v)}
                options={(["easy", "medium", "hard"] as const).map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
              />
            </Field>
          </section>

          <section className={card}>
            <SectionTitle n={2}>Qanday tekshiriladi</SectionTitle>
            <div role="radiogroup" aria-label="Tekshirish turi" className="grid gap-2 sm:grid-cols-2">
              {(["auto", "mentor", "proof", "competition"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={f.verify === v}
                  onClick={() => set("verify", v)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors cursor-pointer min-h-[64px]",
                    f.verify === v ? "border-teal-500 bg-teal-500/5 ring-1 ring-teal-500" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  )}
                >
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{VERIFY_LABEL[v]}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{VERIFY_HINT[v]}</span>
                </button>
              ))}
            </div>

            {f.verify === "auto" ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Field htmlFor="q-rule" label="Shart">
                  <Select id="q-rule" value={f.autoKind} onChange={(e) => set("autoKind", e.target.value as QuestAutoKind)}>
                    {(Object.keys(AUTO_KIND_LABEL) as QuestAutoKind[]).map((k) => (
                      <option key={k} value={k}>
                        {AUTO_KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {AUTO_KIND_HAS_TARGET[f.autoKind] && (
                  <Field htmlFor="q-target" label={f.autoKind === "group_challenge" ? "N (%)" : "N"}>
                    <Input id="q-target" type="number" min={1} value={f.autoTarget} onChange={(e) => set("autoTarget", Math.max(1, num(e.target.value)))} />
                  </Field>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">O&apos;quvchidan nima so&apos;raladi</h3>
                  <CheckRow
                    checked={f.evidence.link !== "none"}
                    onChange={(v) => set("evidence", { ...f.evidence, link: v ? "required" : "none" })}
                    extra={
                      f.evidence.link !== "none" && (
                        <span className="w-32 shrink-0">
                          <Select
                            value={f.evidence.link}
                            onChange={(e) => set("evidence", { ...f.evidence, link: e.target.value as "required" | "optional" })}
                            aria-label="Havola majburiymi"
                            className="min-h-[36px] py-1 text-xs"
                          >
                            <option value="required">majburiy</option>
                            <option value="optional">ixtiyoriy</option>
                          </Select>
                        </span>
                      )
                    }
                  >
                    Tasdiqlash havolasi
                  </CheckRow>
                  <CheckRow checked={f.evidence.file} onChange={(v) => set("evidence", { ...f.evidence, file: v })}>
                    Fayl — PDF yoki rasm
                  </CheckRow>
                  <CheckRow checked={f.evidence.certId} onChange={(v) => set("evidence", { ...f.evidence, certId: v })}>
                    Sertifikat ID raqami
                  </CheckRow>
                  <CheckRow checked={f.evidence.note} onChange={(v) => set("evidence", { ...f.evidence, note: v })}>
                    Qisqa izoh: nima o&apos;rgandi
                  </CheckRow>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Firibgarlikdan himoya</h3>
                  <CheckRow checked={f.guard.uniqueProof} onChange={(v) => set("guard", { ...f.guard, uniqueProof: v })}>
                    Bir xil havola yoki ID ni ikkinchi marta qabul qilmaslik
                  </CheckRow>
                  <CheckRow checked={f.guard.dateAfterJoin} onChange={(v) => set("guard", { ...f.guard, dateAfterJoin: v })}>
                    Sana o&apos;quvchi dasturga qo&apos;shilgan kundan keyin bo&apos;lsin
                  </CheckRow>
                  <CheckRow
                    checked={f.guard.monthlyLimit !== null}
                    onChange={(v) => set("guard", { ...f.guard, monthlyLimit: v ? 3 : null })}
                    extra={
                      f.guard.monthlyLimit !== null && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Input
                            type="number"
                            min={1}
                            value={f.guard.monthlyLimit}
                            onChange={(e) => set("guard", { ...f.guard, monthlyLimit: Math.max(1, num(e.target.value)) })}
                            aria-label="Oylik limit"
                            className="w-16 min-h-[36px] py-1 text-center"
                          />
                          ta
                        </span>
                      )
                    }
                  >
                    Bir o&apos;quvchidan oyiga ko&apos;pi bilan
                  </CheckRow>
                </div>
              </>
            )}
          </section>

          <section className={card}>
            <SectionTitle n={3}>Mukofot</SectionTitle>
            {f.verify === "competition" ? (
              <div className="grid grid-cols-3 gap-3">
                {f.places.map((p, i) => (
                  <Field key={i} htmlFor={`q-place-${i}`} label={`${i + 1}-o'rin (coin)`}>
                    <Input
                      id={`q-place-${i}`}
                      type="number"
                      min={0}
                      value={p}
                      onChange={(e) => {
                        const next = [...f.places] as [number, number, number];
                        next[i] = num(e.target.value);
                        set("places", next);
                      }}
                    />
                  </Field>
                ))}
              </div>
            ) : (
              <>
                {f.verify !== "auto" && (
                  <Toggle checked={f.fixedReward} onChange={(v) => set("fixedReward", v)} label="Belgilangan miqdor" />
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field htmlFor="q-min" label={f.fixedReward || f.verify === "auto" ? "Coin" : "Coin — eng kami"}>
                    <Input id="q-min" type="number" min={0} value={f.coinsMin} onChange={(e) => set("coinsMin", num(e.target.value))} />
                  </Field>
                  {!f.fixedReward && f.verify !== "auto" && (
                    <Field htmlFor="q-max" label="Coin — eng ko'pi" hint="Aniq miqdorni tasdiqlashda tanlaysiz">
                      <Input id="q-max" type="number" min={0} value={f.coinsMax} onChange={(e) => set("coinsMax", num(e.target.value))} />
                    </Field>
                  )}
                </div>
              </>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Toggle checked={f.xpSame} onChange={(v) => set("xpSame", v)} label="XP coin bilan teng" />
              {!f.xpSame && (
                <Input type="number" min={0} value={f.xp} onChange={(e) => set("xp", num(e.target.value))} aria-label="XP" className="w-28" />
              )}
            </div>
            {months !== null && (
              <p className={cn("rounded-xl p-3 text-xs", months > 3 ? "bg-amber-500/10 text-amber-900 dark:text-amber-200" : "bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400")}>
                Hozir o&apos;rtacha o&apos;quvchi 30 kunda <b>~{context.avgMonthlyCoins} coin</b> oladi. {typical} coin — taxminan{" "}
                <b>{months < 1 ? `${Math.max(1, Math.round(months * 30))} kunlik` : `${months.toFixed(1).replace(".0", "")} oylik`}</b> daromad.
                {typical > context.mentorBonusMax && ` Sozlamadagi chegara: ${context.mentorBonusMax} coin.`}
              </p>
            )}
          </section>

          <section className={card}>
            <SectionTitle n={4}>Kimga va qachon</SectionTitle>
            <Field label={`Guruhlar · ${audienceCount} o'quvchi`}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={f.groupIds.length === 0}
                  onClick={() => set("groupIds", [])}
                  className={cn("min-h-[40px] rounded-xl border px-3 text-sm font-semibold cursor-pointer", f.groupIds.length === 0 ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 dark:border-slate-700")}
                >
                  Barchasi
                </button>
                {context.groups.map((g) => {
                  const on = f.groupIds.includes(g._id);
                  return (
                    <button
                      key={g._id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("groupIds", on ? f.groupIds.filter((x) => x !== g._id) : [...f.groupIds, g._id])}
                      className={cn("min-h-[40px] rounded-xl border px-3 text-sm font-semibold cursor-pointer", on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 dark:border-slate-700")}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            {f.verify !== "competition" && (
              <Field label="Takrorlanish">
                <SegmentedControl
                  ariaLabel="Takrorlanish"
                  value={f.repeat}
                  onChange={(v) => set("repeat", v)}
                  options={(["once", "daily", "weekly", "unlimited"] as const).map((r) => ({ value: r, label: REPEAT_LABEL[r] }))}
                  className="overflow-x-auto"
                />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field htmlFor="q-start" label="Boshlanish" hint="Bo'sh — darhol">
                <Input id="q-start" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
              </Field>
              <Field htmlFor="q-end" label="Tugash" hint="Bo'sh — muddatsiz">
                <Input id="q-end" type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className={card}>
            <SectionTitle n={5}>Bildirishnomalar</SectionTitle>
            <div className="flex flex-col gap-2">
              <Toggle checked={f.announce} onChange={(v) => set("announce", v)} label="E'lon qilinganda guruhlarga Telegram orqali xabar" />
              <Toggle checked={f.onSubmission} onChange={(v) => set("onSubmission", v)} label="Har bir yangi dalil haqida menga xabar" />
            </div>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20" aria-label="Ko'rinish">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">O&apos;quvchiga shunday ko&apos;rinadi</div>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", VERIFY_TONE[f.verify])}>{VERIFY_LABEL[f.verify]}</span>
              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {DIFFICULTY_LABEL[f.difficulty]}
              </span>
            </div>
            <div className="font-bold text-slate-900 dark:text-slate-100">{f.title || "Topshiriq nomi"}</div>
            {f.description && <p className="line-clamp-3 text-sm text-slate-600 dark:text-slate-400">{f.description}</p>}
            <div className="flex items-center justify-between pt-1">
              <span className="font-mono font-black text-amber-700 dark:text-amber-400">{rewardLabel(rewardPreview, f.verify)}</span>
              <span className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white">{f.verify === "auto" ? "Avtomatik" : "Yuborish"}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Xulosa</div>
            <dl className="space-y-1.5 text-sm">
              {[
                ["Tekshiruv", VERIFY_LABEL[f.verify]],
                ...(f.verify === "auto" ? [] : [["Dalillar", evidenceList.join(", ") || "—"]]),
                ["Mukofot", `${rewardLabel(rewardPreview, f.verify).replace("+", "")} coin`],
                ["Kimga", f.groupIds.length === 0 ? `Barcha guruhlar · ${audienceCount} o'quvchi` : `${audience.length} guruh · ${audienceCount} o'quvchi`],
                ["Takrorlanish", `${REPEAT_LABEL[f.verify === "competition" ? "weekly" : f.repeat]}${f.guard.monthlyLimit && f.verify !== "auto" ? ` · oyiga ${f.guard.monthlyLimit} ta` : ""}`],
                ["Telegram", f.announce ? "Yoqilgan" : "O'chiq"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="text-right font-semibold text-slate-900 dark:text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/mentor/reports/economy" className="mt-3 inline-block text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline">
              Coin iqtisodiyoti →
            </Link>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title="Topshiriqni arxivga olasizmi?"
        description="O'quvchilar uni endi ko'rmaydi. Yuborilgan ishlar va berilgan coinlar saqlanib qoladi."
        confirmText="Arxivga olish"
        isLoading={busy === "archive"}
      />
    </div>
  );
}
