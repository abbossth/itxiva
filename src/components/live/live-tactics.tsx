"use client";

import { Check } from "lucide-react";
import type { LivePlayerState } from "@/actions/live-game.actions";
import { PLANKS, TACTICS, isAdventure, type Tactic } from "@/lib/live-game/adventures";
import { TimerBadge, useCountdown } from "./live-ui";
import { cn, formatNumberUz } from "@/lib/utils";

// Sarguzasht rejimlarida javob yuborilgach — natija ochilguncha taktika tanlanadi.
// Javob to'g'ri yoki xatoligi hali noma'lum: shu sababli tanlov hayajonli (xavfli taktika xatoda jazolaydi).

export function TacticView({
  state,
  onPick,
  saving,
}: {
  state: LivePlayerState;
  onPick: (tactic: string, target: string | null) => void;
  saving: boolean;
}) {
  const remaining = useCountdown(state.remainingMs, true);
  if (!isAdventure(state.mode) || !state.tactics) return null;
  const t = state.tactics;
  const list = TACTICS[state.mode];
  const me = state.me;

  // Nishon kerak bo'lgan taktikalar: nishon yo'q bo'lsa — tanlab bo'lmaydi
  const targets =
    state.mode === "race"
      ? t.ahead.map((a) => ({ id: a.id, label: a.name, sub: `+${formatNumberUz(a.progress - (me?.progress ?? 0))} m oldinda` }))
      : state.mode === "territory"
      ? t.rivals.map((r) => ({ id: String(r.slot), label: r.name, sub: `${r.cells} katak` }))
      : [];
  const disabledWhy = (tc: Tactic): string | null => {
    if (tc.target && targets.length === 0) return state.mode === "race" ? "Oldingizda robot yo'q" : "Chegaradosh raqib yo'q";
    if (state.mode === "bridge" && t.plank && t.plank.broken & (1 << Number(tc.id))) return "Singan!";
    return null;
  };
  const pick = (tc: Tactic) => {
    if (disabledWhy(tc)) return;
    onPick(tc.id, tc.target ? (t.picked === tc.id && t.target ? t.target : targets[0]?.id ?? null) : null);
  };
  const active = list.find((x) => x.id === t.picked);

  return (
    <div className="quiz-pop space-y-3 lg:space-y-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-200">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Javob qabul qilindi
          </p>
          <p className="mt-2 text-2xl font-black lg:text-4xl">{t.picked ? "Taktika tanlandi!" : "Endi taktikani tanlang"}</p>
          <p className="text-xs text-slate-300 lg:text-sm">Natija ochilguncha o&apos;zgartirish mumkin · taktika javob to&apos;g&apos;ri bo&apos;lsa ishlaydi</p>
        </div>
        <TimerBadge ms={remaining} limit={state.question?.timeLimit ?? 20} />
      </div>

      {state.mode === "bridge" && me && <PlankHint step={me.progress} plank={t.plank} />}

      <div className="grid gap-2.5 sm:grid-cols-3 lg:gap-4">
        {list.map((tc) => {
          const why = disabledWhy(tc);
          const on = t.picked === tc.id;
          const safe = state.mode === "bridge" && Boolean(t.plank && t.plank.known & (1 << Number(tc.id)) && !(t.plank.broken & (1 << Number(tc.id))));
          return (
            <button
              key={tc.id}
              type="button"
              disabled={Boolean(why)}
              onClick={() => pick(tc)}
              aria-pressed={on}
              className={cn(
                "relative flex min-h-[84px] cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[150px] sm:flex-col sm:justify-center sm:text-center lg:min-h-[190px]",
                on ? "bg-white text-slate-900 ring-4 ring-amber-300" : "bg-white/10 ring-1 ring-white/15 hover:bg-white/15"
              )}
            >
              <span className={cn("text-4xl lg:text-6xl", on && "live-pop")}>{why === "Singan!" ? "💥" : tc.icon}</span>
              <span className="min-w-0">
                <span className="block text-lg font-black lg:text-2xl">{tc.title}</span>
                <span className={cn("block text-xs font-semibold lg:text-sm", on ? "text-slate-600" : "text-slate-300")}>{why ?? tc.hint}</span>
                {safe && <span className="mt-1 inline-block rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-white">✓ mustahkam</span>}
              </span>
              {on && (
                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-slate-900">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active?.target && targets.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-black/20 p-3">
          <p className="text-sm font-black">{state.mode === "race" ? "⚡ Kimga to'r tashlaysiz?" : "⚔️ Kimga hujum qilasiz?"}</p>
          <div className="flex flex-wrap gap-2">
            {targets.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => onPick(active.id, x.id)}
                aria-pressed={t.target === x.id}
                className={cn(
                  "min-h-[48px] cursor-pointer rounded-xl px-3 py-1.5 text-left text-sm font-black",
                  t.target === x.id ? "bg-amber-400 text-slate-950" : "bg-white/10 hover:bg-white/20"
                )}
              >
                {x.label}
                <span className="block text-[11px] font-semibold opacity-70">{x.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {saving && <p className="text-center text-xs text-slate-400">Saqlanmoqda…</p>}
    </div>
  );
}

/** Ko'prik: keyingi qadamning 3 ta taxtasi — oldingilar bosganlari ko'rinadi */
function PlankHint({ step, plank }: { step: number; plank: { known: number; broken: number } | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-sky-950/60 px-4 py-3 ring-1 ring-sky-400/20">
      <span className="text-sm font-black text-sky-200">{step + 1}-qadam</span>
      <div className="flex flex-1 gap-1.5">
        {Array.from({ length: PLANKS }, (_, i) => {
          const broken = plank ? plank.broken & (1 << i) : 0;
          const known = plank ? plank.known & (1 << i) : 0;
          return (
            <span
              key={i}
              className={cn(
                "flex h-9 flex-1 items-center justify-center rounded-md text-sm font-black",
                broken ? "bg-rose-900/60 text-rose-200 line-through" : known ? "bg-emerald-600 text-white" : "bg-gradient-to-b from-amber-600 to-amber-800 text-amber-100"
              )}
            >
              {broken ? "💥" : known ? "✓" : "?"}
            </span>
          );
        })}
      </div>
    </div>
  );
}
