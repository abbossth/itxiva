"use client";

import { useEffect, useState, useTransition } from "react";
import { cancelMyStudentGameAction, contributeStudentGameAction, type LivePlayerState } from "@/actions/live-game.actions";
import { CONTRIBUTION_STEPS } from "@/lib/live-game/student-games-config";
import { LIVE_MODES } from "@/lib/live-game/modes";
import { haptic } from "@/lib/haptics";
import { playCheckInSound, playRankUp, unlockSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { GoldCoin } from "@/components/ui/gold-coin";

// O'quvchi o'yini kutish zali: narx qatnashchilar tomonidan birgalikda yig'iladi, to'lgach o'yin o'zi boshlanadi

const nonce = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function StudentFundPanel({ state, onChange }: { state: LivePlayerState; onChange: () => void }) {
  const sg = state.studentGame!;
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const left = Math.max(0, sg.price - sg.paid);
  const pct = sg.price > 0 ? Math.min(100, Math.round((sg.paid / sg.price) * 100)) : 0;

  // Narx to'lgan: boshlanishgacha sanoq
  const [countdown, setCountdown] = useState(Math.ceil(sg.startsInMs / 1000));
  useEffect(() => {
    if (!sg.funded) return;
    const end = Date.now() + sg.startsInMs;
    const id = setInterval(() => setCountdown(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
    return () => clearInterval(id);
  }, [sg.funded, sg.startsInMs]);

  const give = (amount: number) =>
    start(async () => {
      unlockSound();
      const r = await contributeStudentGameAction(state.id, amount, nonce());
      if (!r.success) {
        setMsg({ text: r.error, ok: false });
        return;
      }
      haptic([15, 30, 15]);
      if (r.data.paid >= r.data.price) {
        playRankUp();
        setMsg({ text: "Coin to'ldi! O'yin boshlanmoqda", ok: true });
      } else {
        playCheckInSound(1);
        setMsg({ text: `+${amount} coin qo'shdingiz`, ok: true });
      }
      onChange();
    });

  const cancel = () =>
    start(async () => {
      const r = await cancelMyStudentGameAction(state.id);
      setConfirmCancel(false);
      if (!r.success) setMsg({ text: r.error, ok: false });
      else onChange();
    });

  const steps = [...new Set([...CONTRIBUTION_STEPS.filter((n) => n < left), left])].filter((n) => n > 0);

  return (
    <div className="mx-auto mb-4 w-full max-w-md shrink-0 overflow-hidden rounded-3xl bg-gradient-to-b from-amber-400/20 via-slate-900/70 to-slate-900/80 p-4 text-left shadow-xl ring-1 ring-amber-300/30">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-wider text-amber-200/80">
            {sg.creator ? "Sizning o'yiningiz" : `${sg.creatorName} o'yini`} · {sg.audience}
          </p>
          <p className="truncate text-lg font-black text-white">{LIVE_MODES[state.mode].title}</p>
        </div>
        <span className="shrink-0 rounded-2xl bg-black/30 px-3 py-1.5 font-mono text-lg font-black text-amber-300">
          <GoldCoin /> {sg.paid}/{sg.price}
        </span>
      </div>

      {/* Yig'ish shkalasi */}
      <div className="relative mt-3 h-5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-500 transition-[width] duration-700 ease-out", sg.funded && "fund-glow")}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-950 mix-blend-luminosity">{pct}%</span>
      </div>

      {sg.funded ? (
        <p className="quiz-pop mt-3 text-center text-xl font-black text-emerald-300">
          🎉 Coin yig&apos;ildi! O&apos;yin {countdown > 0 ? `${countdown} soniyada` : "hozir"} boshlanadi
        </p>
      ) : (
        <>
          <p className="mt-2 text-center text-sm font-bold text-amber-100">
            O&apos;yin boshlanishi uchun yana <b className="text-amber-300">{left} coin</b> kerak — har kim qo&apos;sha oladi
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {steps.map((n) => (
              <button
                key={n}
                type="button"
                disabled={pending}
                onClick={() => give(n)}
                className={cn(
                  "min-w-[64px] cursor-pointer rounded-2xl px-3 py-2.5 text-base font-black shadow-lg transition active:scale-95 disabled:opacity-60",
                  n === left ? "bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950" : "bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950"
                )}
              >
                +{n} <GoldCoin />{n === left && steps.length > 1 ? <span className="block text-[10px] font-bold">qolganini</span> : null}
              </button>
            ))}
          </div>
        </>
      )}

      {msg && <p className={cn("mt-2 text-center text-sm font-bold", msg.ok ? "text-emerald-300" : "text-rose-300")}>{msg.text}</p>}

      {sg.contributors.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {sg.contributors.map((c, i) => (
            <span key={`${c.name}-${i}`} className="live-pop rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white" style={{ animationDelay: `${i * 40}ms` }}>
              {c.name} <b className="font-mono text-amber-300">+{c.amount}</b>
            </span>
          ))}
        </div>
      )}
      {sg.mine > 0 && <p className="mt-2 text-center text-xs text-white/60">Siz qo&apos;shgan: {sg.mine} coin. O&apos;yin boshlanmasa — qaytariladi.</p>}
      <PrizeLine prizes={sg.prizes} team={state.mode === "team"} minPlayers={sg.minPlayers} />

      {sg.creator && !sg.funded && (
        <div className="mt-3 text-center">
          {confirmCancel ? (
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-white/70">Har kimga o&apos;z coini qaytariladi.</span>
              <button type="button" disabled={pending} onClick={cancel} className="cursor-pointer rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-black text-white">
                Ha, bekor qilish
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)} className="cursor-pointer rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
                Yo&apos;q
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} className="cursor-pointer text-xs font-bold text-rose-300 underline-offset-2 hover:underline">
              O&apos;yinni bekor qilish
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** G'oliblar sovrini: 1-o'rin 30, 2-o'rin 20, 3-o'rin 10 (jamoaviyda — g'olib jamoa a'zolariga) */
export function PrizeLine({ prizes, team, minPlayers, light = false }: { prizes: number[]; team: boolean; minPlayers: number; light?: boolean }) {
  const list = team ? (prizes[0] ? [prizes[0]] : []) : prizes.filter((n) => n > 0);
  if (list.length === 0) return <p className={cn("mt-1 text-center text-[11px]", light ? "text-white/70" : "text-white/45")}>Bu o&apos;yinda sovrin yo&apos;q — faqat sharaf uchun!</p>;
  return (
    <div className="mt-2 text-center">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className={cn("text-xs font-bold", light ? "text-white/80" : "text-white/60")}>🏆 Sovrin:</span>
        {team ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-black text-amber-200">
            G&apos;olib jamoaning har biriga +{list[0]} <GoldCoin />
          </span>
        ) : (
          list.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-black text-amber-200">
              {["🥇", "🥈", "🥉"][i]} +{n} <GoldCoin />
            </span>
          ))
        )}
      </div>
      {minPlayers > 1 && <p className={cn("mt-1 text-[11px]", light ? "text-white/70" : "text-white/45")}>Sovrin kamida {minPlayers} kishi o&apos;ynasa beriladi</p>}
    </div>
  );
}
