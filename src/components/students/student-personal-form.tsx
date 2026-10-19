"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Coins, FileText, IdCard, Lock, ShieldCheck, StickyNote, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { updateOwnProfileAction, updateStudentProfileAction, type StudentPersonalData } from "@/actions/student-profile.actions";
import type { OwnProfileInput } from "@/lib/validations/student-profile.schema";
import { requestRewardCheck } from "@/lib/rewards-client";
import {
  BIRTH_CERT_KEYS,
  PARENT_KEYS,
  PASSPORT_KEYS,
  ageOf,
  countFilled,
  profileCompleteness,
  type DocumentType,
} from "@/lib/profile-completeness";
import { cn } from "@/lib/utils";

type FormState = StudentPersonalData & { fullName: string };

/**
 * Yig'iladigan bo'lim: sarlavhada nechta maydon to'ldirilgani va yopiq holatda qisqa xulosa.
 * Hamma bo'lim birdan ochiq turmasin — forma uzun va og'ir ko'rinmasin.
 */
function Section({
  icon: Icon,
  title,
  filled,
  total,
  summary,
  defaultOpen = false,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  filled: number;
  total: number;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const complete = filled === total;
  return (
    <details open={defaultOpen} className="group rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
      <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 px-4 sm:px-5 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
          <Icon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-900 dark:text-slate-100">{title}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400 group-open:hidden">
            {summary || (filled === 0 ? "To'ldirilmagan" : `${filled} ta maydon to'ldirilgan`)}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
            complete
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : filled === 0
                ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          )}
        >
          {filled}/{total}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 dark:border-slate-800 px-4 sm:px-5 pt-4 pb-5">{children}</div>
    </details>
  );
}

const joinFilled = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(" · ");

type Props =
  // Mentor: istalgan o'quvchi, ism-familiya va izoh bilan
  | { mode: "mentor"; studentId: string; fullName: string; personal: StudentPersonalData }
  // O'quvchi: faqat o'zi; `locked` — mentor tahrirlashni yopgan (faqat ko'rish); `reward` — 100% uchun coin
  | { mode: "student"; personal: OwnProfileInput; locked: boolean; reward?: { amount: number; received: boolean } };

const DOCUMENTS: { id: DocumentType; label: string; hint: string; icon: typeof IdCard }[] = [
  { id: "birthCert", label: "Tug'ilganlik guvohnomasi", hint: "16 yoshgacha", icon: FileText },
  { id: "passport", label: "Pasport yoki ID-karta", hint: "16 yoshdan", icon: IdCard },
];

export function StudentPersonalForm(props: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const isMentor = props.mode === "mentor";
  const locked = props.mode === "student" && props.locked;
  const initial: FormState = isMentor
    ? { fullName: props.fullName, ...props.personal }
    : { fullName: "", notes: "", ...props.personal };
  const [form, setForm] = useState<FormState>(initial);
  const [isSaving, setIsSaving] = useState(false);

  const dirty = (Object.keys(initial) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const text = (key: keyof FormState) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const res =
        props.mode === "mentor" ? await updateStudentProfileAction(props.studentId, form) : await updateOwnProfileAction(form);
      if (res.success) {
        toast.success(res.message || "Ma'lumotlar saqlandi");
        router.refresh();
        // Profil 100% bo'lib coin berilgan bo'lsa — mukofot oynasi (coin header'dagi balansga uchib boradi)
        if (((res.data as { rewarded?: number } | undefined)?.rewarded ?? 0) > 0) requestRewardCheck();
      } else {
        toast.error(res.message || "Saqlab bo'lmadi");
      }
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setIsSaving(false);
    }
  };

  const age = ageOf(form.birthDate);
  const genderLabel = form.gender === "male" ? "O'g'il bola" : form.gender === "female" ? "Qiz bola" : "";

  const basicKeys = [...(isMentor ? ["fullName"] : []), "birthDate", "gender", "phone", "school", "address"];
  // 100% hisobiga faqat o'quvchida bor hujjat kiradi (tanlangani yoki yoshi/to'ldirilganiga qarab taxmin qilingani)
  const completeness = profileCompleteness(form);
  const docType = completeness.documentType;
  const reward = props.mode === "student" ? props.reward : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
        {locked ? (
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        ) : (
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
        )}
        {isMentor
          ? "Bu ma'lumotlarni siz va o'quvchining o'zi ko'radi — boshqa o'quvchilarga ko'rinmaydi. Hujjat raqamlari bazada shifrlangan holda saqlanadi."
          : locked
          ? "Ma'lumotlarni tahrirlash hozir yopiq. O'zgartirish kerak bo'lsa, mentorga ayting."
          : "Bu ma'lumotlarni faqat siz va mentor ko'rasiz — boshqa o'quvchilarga ko'rinmaydi. Bilmagan maydonni bo'sh qoldirishingiz mumkin."}
      </p>

      {/* Qancha to'ldirilgani (o'quvchida — 100% uchun coin mukofoti bilan) */}
      <div
        className={cn(
          "rounded-2xl px-4 py-3 space-y-2",
          reward && (reward.received ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-amber-500/10 ring-1 ring-amber-500/25")
        )}
      >
        {reward && (
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              reward.received ? "text-emerald-800 dark:text-emerald-300" : "text-amber-900 dark:text-amber-200"
            )}
          >
            {reward.received ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Coins className="h-4 w-4 shrink-0" />}
            {reward.received
              ? `Profil to'liq — ${reward.amount} coin olingan`
              : completeness.complete
                ? `Hammasi to'ldirildi — saqlang va ${reward.amount} coin oling!`
                : `Profilni 100% to'ldiring va ${reward.amount} coin oling`}
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
            <div
              className={cn("h-full rounded-full transition-all duration-500", completeness.complete ? "bg-emerald-500" : "bg-teal-500")}
              style={{ width: `${completeness.percent}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
            {completeness.percent}% · {completeness.filled} / {completeness.total}
          </span>
        </div>
      </div>

      {/* Yopiq bo'lsa barcha maydonlar faqat o'qish uchun */}
      <fieldset disabled={locked} className="space-y-3 min-w-0 disabled:opacity-90">
        <Section
          icon={UserRound}
          title="Asosiy ma'lumotlar"
          filled={countFilled(form, basicKeys)}
          total={basicKeys.length}
          summary={joinFilled(age === null ? null : `${age} yosh`, genderLabel, form.phone, form.school)}
          defaultOpen
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isMentor && (
              <Field htmlFor="sp-name" label="Ism-familiya" required className="sm:col-span-2 lg:col-span-1">
                <Input id="sp-name" {...text("fullName")} required minLength={2} maxLength={80} autoComplete="off" />
              </Field>
            )}
            <Field htmlFor="sp-birth" label="Tug'ilgan sana" hint={age === null ? undefined : `${age} yosh`}>
              <Input id="sp-birth" type="date" {...text("birthDate")} max={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field htmlFor="sp-gender" label="Jinsi">
              <Select id="sp-gender" value={form.gender} onChange={(e) => set("gender", e.target.value as FormState["gender"])}>
                <option value="">Ko&apos;rsatilmagan</option>
                <option value="male">O&apos;g&apos;il bola</option>
                <option value="female">Qiz bola</option>
              </Select>
            </Field>
            <Field htmlFor="sp-phone" label="Telefon raqami">
              <Input id="sp-phone" type="tel" inputMode="tel" placeholder="+998 90 123 45 67" {...text("phone")} maxLength={20} autoComplete="off" />
            </Field>
            <Field htmlFor="sp-school" label="Maktabi">
              <Input id="sp-school" placeholder="Masalan: 12-maktab" {...text("school")} maxLength={120} />
            </Field>
            <Field htmlFor="sp-address" label="Yashash manzili" className={cn("sm:col-span-2", isMentor ? "lg:col-span-1" : "lg:col-span-3")}>
              <Input id="sp-address" placeholder="Tuman, mahalla, ko'cha, uy" {...text("address")} maxLength={200} autoComplete="off" />
            </Field>
          </div>
        </Section>

        <Section
          icon={Users}
          title="Ota-onasi"
          filled={countFilled(form, PARENT_KEYS)}
          total={PARENT_KEYS.length}
          summary={joinFilled(form.fatherName, form.motherName)}
          defaultOpen
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field htmlFor="sp-father" label="Otasining ism-familiyasi">
              <Input id="sp-father" {...text("fatherName")} maxLength={80} autoComplete="off" />
            </Field>
            <Field htmlFor="sp-father-phone" label="Otasining telefoni">
              <Input id="sp-father-phone" type="tel" inputMode="tel" placeholder="+998 ..." {...text("fatherPhone")} maxLength={20} autoComplete="off" />
            </Field>
            <Field htmlFor="sp-mother" label="Onasining ism-familiyasi">
              <Input id="sp-mother" {...text("motherName")} maxLength={80} autoComplete="off" />
            </Field>
            <Field htmlFor="sp-mother-phone" label="Onasining telefoni">
              <Input id="sp-mother-phone" type="tel" inputMode="tel" placeholder="+998 ..." {...text("motherPhone")} maxLength={20} autoComplete="off" />
            </Field>
          </div>
        </Section>

        {/* Hujjat: o'quvchida yoki guvohnoma, yoki pasport bo'ladi — faqat tanlangani ko'rinadi va hisobga olinadi.
            Ikkinchisining avval kiritilgan ma'lumotlari o'chirilmaydi, shunchaki yashirinadi */}
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Qaysi hujjatingiz bor?</p>
          <div role="radiogroup" aria-label="Hujjat turi" className="grid grid-cols-2 gap-2">
            {DOCUMENTS.map((doc) => {
              const selected = docType === doc.id;
              const Icon = doc.icon;
              return (
                <button
                  key={doc.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set("documentType", doc.id)}
                  className={cn(
                    "flex min-h-[56px] items-center gap-2.5 rounded-xl border p-3 text-left transition-colors cursor-pointer disabled:cursor-default",
                    selected
                      ? "border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-200"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-surface text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{doc.label}</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">{doc.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {docType === "birthCert" && (
          <Section
            icon={FileText}
            title="Tug'ilganlik haqidagi guvohnoma"
            filled={countFilled(form, BIRTH_CERT_KEYS)}
            total={BIRTH_CERT_KEYS.length}
            summary={joinFilled(form.birthCertNumber, form.birthCertIssuedBy)}
            defaultOpen
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field htmlFor="sp-bc-number" label="Seriya va raqami">
                <Input id="sp-bc-number" placeholder="I-XR 1234567" {...text("birthCertNumber")} maxLength={30} autoComplete="off" className="font-mono" />
              </Field>
              <Field htmlFor="sp-bc-date" label="Berilgan sana">
                <Input id="sp-bc-date" type="date" {...text("birthCertIssuedAt")} />
              </Field>
              <Field htmlFor="sp-bc-by" label="Kim tomonidan berilgan" className="sm:col-span-2 lg:col-span-1">
                <Input id="sp-bc-by" placeholder="Masalan: Xiva shahar FHDY bo'limi" {...text("birthCertIssuedBy")} maxLength={160} />
              </Field>
            </div>
          </Section>
        )}

        {docType === "passport" && (
          <Section
            icon={IdCard}
            title="Pasport yoki ID-karta"
            filled={countFilled(form, PASSPORT_KEYS)}
            total={PASSPORT_KEYS.length}
            summary={joinFilled(form.passportNumber, form.pinfl && `JSHSHIR ${form.pinfl}`)}
            defaultOpen
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field htmlFor="sp-pass-number" label="Seriya va raqami">
                <Input id="sp-pass-number" placeholder="AB 1234567" {...text("passportNumber")} maxLength={20} autoComplete="off" className="font-mono" />
              </Field>
              <Field htmlFor="sp-pinfl" label="JSHSHIR (PINFL)" hint="14 ta raqam">
                <Input
                  id="sp-pinfl"
                  inputMode="numeric"
                  placeholder="00000000000000"
                  value={form.pinfl}
                  onChange={(e) => set("pinfl", e.target.value.replace(/\D/g, "").slice(0, 14))}
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Field htmlFor="sp-pass-by" label="Kim tomonidan berilgan" className="sm:col-span-2 lg:col-span-1">
                <Input id="sp-pass-by" placeholder="Masalan: Xiva shahar IIB" {...text("passportIssuedBy")} maxLength={160} />
              </Field>
              <Field htmlFor="sp-pass-date" label="Berilgan sana">
                <Input id="sp-pass-date" type="date" {...text("passportIssuedAt")} />
              </Field>
              <Field htmlFor="sp-pass-exp" label="Amal qilish muddati">
                <Input id="sp-pass-exp" type="date" {...text("passportExpiresAt")} />
              </Field>
            </div>
          </Section>
        )}

        {isMentor && (
          <Section
            icon={StickyNote}
            title="Mentor izohi (faqat sizga ko'rinadi)"
            filled={form.notes.trim() ? 1 : 0}
            total={1}
            summary={form.notes.trim() ? form.notes.trim().split("\n")[0] : "Izoh yo'q"}
          >
            <Textarea
              aria-label="Mentor izohi"
              rows={3}
              placeholder="O'quvchi haqida eslatmalar: qiziqishlari, sog'lig'i bo'yicha muhim ma'lumot, kelishuvlar..."
              {...text("notes")}
              maxLength={2000}
            />
          </Section>
        )}
      </fieldset>

      {/* Saqlash paneli faqat o'zgarish bo'lganda chiqadi */}
      {!locked && dirty && (
        <div className="sticky bottom-20 md:bottom-4 z-10 flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-white/95 dark:bg-surface/95 backdrop-blur border border-amber-500/40 shadow-card animate-in fade-in">
          <span className="flex-1 min-w-[160px] text-xs font-semibold text-amber-700 dark:text-amber-400">Saqlanmagan o&apos;zgarishlar bor</span>
          <Button type="button" variant="ghost" onClick={() => setForm(initial)} disabled={isSaving}>
            Bekor qilish
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            Saqlash
          </Button>
        </div>
      )}
    </form>
  );
}
