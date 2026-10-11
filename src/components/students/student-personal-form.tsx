"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, IdCard, Lock, ShieldCheck, StickyNote, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { updateOwnProfileAction, updateStudentProfileAction, type StudentPersonalData } from "@/actions/student-profile.actions";
import type { OwnProfileInput } from "@/lib/validations/student-profile.schema";

type FormState = StudentPersonalData & { fullName: string };

const card = "p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4";

function SectionTitle({ icon: Icon, children }: { icon: typeof UserRound; children: React.ReactNode }) {
  return (
    <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
      <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
      {children}
    </h2>
  );
}

/** Tug'ilgan sanadan to'liq yosh */
function ageOf(birthDate: string): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

type Props =
  // Mentor: istalgan o'quvchi, ism-familiya va izoh bilan
  | { mode: "mentor"; studentId: string; fullName: string; personal: StudentPersonalData }
  // O'quvchi: faqat o'zi; `locked` — mentor tahrirlashni yopgan (faqat ko'rish)
  | { mode: "student"; personal: OwnProfileInput; locked: boolean };

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

      {/* Yopiq bo'lsa barcha maydonlar faqat o'qish uchun */}
      <fieldset disabled={locked} className="space-y-4 min-w-0 disabled:opacity-90">

      <section className={card}>
        <SectionTitle icon={UserRound}>Asosiy ma&apos;lumotlar</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isMentor && (
            <Field htmlFor="sp-name" label="Ism-familiya" required className="sm:col-span-2">
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
          <Field htmlFor="sp-address" label="Yashash manzili" className="sm:col-span-2">
            <Input id="sp-address" placeholder="Tuman, mahalla, ko'cha, uy" {...text("address")} maxLength={200} autoComplete="off" />
          </Field>
        </div>
      </section>

      <section className={card}>
        <SectionTitle icon={Users}>Ota-onasi</SectionTitle>
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
      </section>

      <section className={card}>
        <SectionTitle icon={FileText}>Tug&apos;ilganlik haqidagi guvohnoma</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field htmlFor="sp-bc-number" label="Seriya va raqami">
            <Input id="sp-bc-number" placeholder="I-XR 1234567" {...text("birthCertNumber")} maxLength={30} autoComplete="off" className="font-mono" />
          </Field>
          <Field htmlFor="sp-bc-date" label="Berilgan sana">
            <Input id="sp-bc-date" type="date" {...text("birthCertIssuedAt")} />
          </Field>
          <Field htmlFor="sp-bc-by" label="Kim tomonidan berilgan" className="sm:col-span-2">
            <Input id="sp-bc-by" placeholder="Masalan: Xiva shahar FHDY bo'limi" {...text("birthCertIssuedBy")} maxLength={160} />
          </Field>
        </div>
      </section>

      <section className={card}>
        <SectionTitle icon={IdCard}>Pasport yoki ID-karta</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Field htmlFor="sp-pass-date" label="Berilgan sana">
            <Input id="sp-pass-date" type="date" {...text("passportIssuedAt")} />
          </Field>
          <Field htmlFor="sp-pass-exp" label="Amal qilish muddati">
            <Input id="sp-pass-exp" type="date" {...text("passportExpiresAt")} />
          </Field>
          <Field htmlFor="sp-pass-by" label="Kim tomonidan berilgan" className="sm:col-span-2">
            <Input id="sp-pass-by" placeholder="Masalan: Xiva shahar IIB" {...text("passportIssuedBy")} maxLength={160} />
          </Field>
        </div>
      </section>

      {isMentor && (
      <section className={card}>
        <SectionTitle icon={StickyNote}>Mentor izohi (faqat sizga ko&apos;rinadi)</SectionTitle>
        <Textarea
          aria-label="Mentor izohi"
          rows={3}
          placeholder="O'quvchi haqida eslatmalar: qiziqishlari, sog'lig'i bo'yicha muhim ma'lumot, kelishuvlar..."
          {...text("notes")}
          maxLength={2000}
        />
      </section>
      )}
      </fieldset>

      {!locked && (
      <div className="sticky bottom-20 md:bottom-4 z-10 flex items-center gap-3 p-3 rounded-2xl bg-white/95 dark:bg-surface/95 backdrop-blur border border-slate-200 dark:border-slate-800 shadow-card">
        <Button type="submit" variant="primary" isLoading={isSaving} disabled={!dirty}>
          Saqlash
        </Button>
        {dirty ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setForm(initial)} disabled={isSaving}>
              Bekor qilish
            </Button>
            <span className="text-xs text-amber-700 dark:text-amber-400">Saqlanmagan o&apos;zgarishlar bor</span>
          </>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">Barcha o&apos;zgarishlar saqlangan</span>
        )}
      </div>
      )}
    </form>
  );
}
