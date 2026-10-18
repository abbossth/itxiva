"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudRain, Leaf, PartyPopper, Power, Snowflake, Sparkles, Sun, Wand2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { updateAmbienceSettingsAction } from "@/actions/settings.actions";
import { SEASON_LABEL, SEASON_MODES, holidayFor, seasonFor, type AmbienceSettings, type SeasonMode } from "@/lib/ambience";
import { toDateKey } from "@/lib/schedule";
import { cn } from "@/lib/utils";

const card = "p-4 sm:p-6 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4";

const MODE_ICON: Record<SeasonMode, LucideIcon> = {
  auto: Wand2,
  off: Power,
  winter: Snowflake,
  spring: CloudRain,
  summer: Sun,
  autumn: Leaf,
};

/** Bezaklar: header'dagi fasl effekti, bayram bezagi, o'quvchi darajasiga mos bezak */
export function AmbienceSettingsForm({ initial, gamification }: { initial: AmbienceSettings; gamification: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [season, setSeason] = useState<SeasonMode>(initial.season);
  const [levelEffects, setLevelEffects] = useState(initial.levelEffects);
  const [holidays, setHolidays] = useState(initial.holidays);
  const [saving, setSaving] = useState(false);
  const today = toDateKey();
  const autoSeason = seasonFor(today);
  const holiday = holidayFor(today);
  const dirty = season !== initial.season || levelEffects !== initial.levelEffects || holidays !== initial.holidays;

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateAmbienceSettingsAction({ season, levelEffects, holidays });
      if (res.success) {
        toast.success(res.message || "Saqlandi");
        router.refresh();
      } else toast.error(res.message || "Saqlab bo'lmadi");
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className={card}>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Snowflake className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Fasl effekti (header)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Sahifa tepasida yengil, kam sonli zarrachalar: qishda qor, bahorda yomg&apos;ir va gul barglari, yozda quyosh uchqunlari, kuzda
            sarg&apos;ish yaproqlar. &quot;Avtomatik&quot;da sanaga qarab o&apos;zi almashadi (hozir: {SEASON_LABEL[autoSeason].toLowerCase()}).
            Qurilmasida &quot;harakatni kamaytirish&quot; yoqilganlarga va profilda effektlarni o&apos;chirgan o&apos;quvchilarga ko&apos;rinmaydi.
          </p>
        </div>
        <div role="radiogroup" aria-label="Fasl effekti" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SEASON_MODES.map((m) => {
            const Icon = MODE_ICON[m];
            const selected = season === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSeason(m)}
                className={cn(
                  "flex min-h-[52px] items-center gap-2.5 rounded-xl border p-3 text-left text-sm font-semibold transition-colors cursor-pointer",
                  selected
                    ? "border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="leading-tight">{SEASON_LABEL[m]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PartyPopper className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Bayram bezagi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Yangi yil (20-dekabr – 7-yanvar): qor va header ostida chiroqlar gulchambari. Navro&apos;z (18–24-mart): gul barglari.
              {holiday ? " Hozir bayram kunlari!" : ""} Hayit va boshqa bayramlar bilan tabriklash uchun &quot;E&apos;lonlar&quot;dagi tayyor
              shablonlardan foydalaning.
            </p>
          </div>
          <Toggle checked={holidays} onChange={setHolidays} label={holidays ? "Yoqilgan" : "O'chiq"} />
        </div>
      </section>

      <section className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Daraja bezagi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              O&apos;quvchi darajasi oshgan sari platforma uning uchun chiroylashadi: header ostida daraja rangidagi chiziq (5-darajadan
              bo&apos;ylab yorug&apos;lik yuradi), sahifa tepasida yengil nur, 7-darajadan suzuvchi uchqunlar, profil va daraja paneli
              ramkasi.
              {!gamification && " Gamifikatsiya o'chiq — yoqilgach ishlaydi."}
            </p>
          </div>
          <Toggle checked={levelEffects} onChange={setLevelEffects} label={levelEffects ? "Yoqilgan" : "O'chiq"} />
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={save} isLoading={saving} disabled={!dirty}>
          Saqlash
        </Button>
      </div>
    </div>
  );
}
