"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { updateGamificationSettingsAction } from "@/actions/settings.actions";
import { LEVEL_NAMES } from "@/lib/gamification/levels";
import type { GamificationSettings } from "@/lib/gamification/config";

const card = "p-4 sm:p-6 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4";

type NumberKey = Exclude<keyof GamificationSettings, "enabled" | "levelThresholds">;

const ECONOMY_FIELDS: { key: NumberKey; label: string; hint: string }[] = [
  { key: "levelUpBonus", label: "Yangi daraja bonusi (coin)", hint: "Har daraja uchun bir marta" },
  { key: "dailyLoginCoins", label: "Kunlik kirish (coin)", hint: "\"Platformaga kiring\" topshirig'i" },
  { key: "quizCoinPerQuestion", label: "Test savoli uchun (coin)", hint: "Faqat birinchi to'g'ri javobga" },
  { key: "quizDailyCap", label: "Testdan kunlik chegara (coin)", hint: "Bir kunda testlardan ko'pi bilan" },
  { key: "mentorBonusMax", label: "Bitta tasdiqda eng ko'p (coin)", hint: "Topshiriq mukofoti chegarasi" },
  { key: "streakShieldPrice", label: "Seriya himoyasi narxi (coin)", hint: "Do'kondagi mahsulot" },
  { key: "monthlyCoinTarget", label: "Oylik maqsad (o'quvchi boshiga)", hint: "Coin iqtisodiyoti hisobotida" },
];

export function GamificationSettingsForm({ initial }: { initial: GamificationSettings }) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const setNumber = (key: NumberKey, value: string) => setForm((f) => ({ ...f, [key]: value === "" ? NaN : Number(value) }));
  const setThreshold = (i: number, value: string) =>
    setForm((f) => ({ ...f, levelThresholds: f.levelThresholds.map((t, j) => (j === i ? (value === "" ? NaN : Number(value)) : t)) }));

  const save = async () => {
    try {
      setSaving(true);
      const res = await updateGamificationSettingsAction(form);
      if (res.success) {
        toast.success(res.message || "Saqlandi");
        router.refresh();
      } else {
        toast.error(res.message || "Saqlab bo'lmadi");
      }
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Gamifikatsiya
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg">
              Yoqilsa: o&apos;quvchilarda XP, darajalar, topshiriqlar, nishonlar va seriya paydo bo&apos;ladi, reyting XP bo&apos;yicha
              tuziladi. O&apos;chirilsa — platforma avvalgidek ishlaydi, to&apos;plangan XP saqlanib qoladi.
            </p>
          </div>
          <Toggle
            checked={form.enabled}
            onChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
            label={form.enabled ? "Yoqilgan" : "O'chiq"}
          />
        </div>
      </section>

      <section className={card}>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Darajalar
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Har bir darajaga kerakli XP. Chegara oldingisidan katta bo&apos;lishi kerak; daraja hech qachon pasaymaydi.
          </p>
        </div>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LEVEL_NAMES.map((name, i) => (
            <li key={name} className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 px-3 py-2">
              <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-teal-500/10 font-mono text-sm font-black text-teal-700 dark:text-teal-300">
                {i + 1}
              </span>
              <label htmlFor={`level-${i}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                {name}
              </label>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`level-${i}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={Number.isNaN(form.levelThresholds[i]) ? "" : form.levelThresholds[i]}
                  onChange={(e) => setThreshold(i, e.target.value)}
                  disabled={i === 0}
                  className="w-24 text-right font-mono"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">XP</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={card}>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Coins className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Coin iqtisodiyoti
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Inflyatsiyaga qarshi chegaralar: coin juda tez yig&apos;ilsa, do&apos;kon qadrsizlanadi.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ECONOMY_FIELDS.map((f) => (
            <Field key={f.key} htmlFor={`g-${f.key}`} label={f.label} hint={f.hint}>
              <Input
                id={`g-${f.key}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={Number.isNaN(form[f.key]) ? "" : form[f.key]}
                onChange={(e) => setNumber(f.key, e.target.value)}
                className="font-mono"
              />
            </Field>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={save} isLoading={saving} disabled={!dirty || saving} className="min-h-[44px]">
          Saqlash
        </Button>
      </div>
    </div>
  );
}
