"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveHostState, LivePlayerRow } from "@/actions/live-game.actions";
import type { GameLook } from "@/lib/character/catalog";
import { GRID_H, GRID_W, PLANKS, ROCKET_MILESTONES } from "@/lib/live-game/adventures";
import { CharacterSvg, type CharMood } from "@/components/character/character-svg";
import { cn, formatNumberUz } from "@/lib/utils";
import { playHurt, playZap } from "@/lib/sound";
import { useViewportHeight } from "./live-ui";
import { GoldCoin } from "@/components/ui/gold-coin";

// Sarguzasht rejimlarining proyektordagi maydonlari: poyga yo'li, osmon, ko'prik, kon va hudud xaritasi.
// Har o'quvchi o'z personaji bilan: natijada avvalgi joyidan yangisiga yuguradi/uchadi/sakraydi,
// keyin natijasiga qarab xursand bo'ladi yoki xafa. Fon ham jonli: yo'l, yulduzlar, to'lqinlar harakatlanadi.

export const SLOT_COLORS = [
  "#f43f5e", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16",
  "#f97316", "#6366f1", "#14b8a6", "#eab308", "#ef4444", "#8b5cf6", "#10b981", "#0ea5e9",
  "#d946ef", "#65a30d", "#fb7185", "#38bdf8", "#facc15", "#4ade80", "#c084fc", "#fdba74",
];
export const slotColor = (slot: number) => (slot < 0 ? "#64748b" : SLOT_COLORS[slot % SLOT_COLORS.length]);
const firstName = (name: string) => name.split(/\s+/).filter(Boolean)[0] ?? name;

/** Bir kadrdan keyin "true": avval eski joyda chiziladi, keyin yangisiga suriladi */
function useArrived(key: number) {
  const [arrived, setArrived] = useState<number | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setArrived(key)));
    return () => cancelAnimationFrame(id);
  }, [key]);
  return arrived === key;
}

/** Harakat davomida "true" (yugurish/uchish animatsiyasi uchun), keyin "false" */
function useMoving(key: number, ms: number) {
  const [moving, setMoving] = useState<number | null>(null);
  useEffect(() => {
    const a = requestAnimationFrame(() => setMoving(key));
    const t = setTimeout(() => setMoving(-1), ms);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(t);
    };
  }, [key, ms]);
  return moving === key;
}

/** Natijadan keyingi kayfiyat: oldinga — xursand, orqaga — xafa */
const afterMood = (p: LivePlayerRow): CharMood => ((p.effect?.delta ?? 0) > 0 || p.finished ? "happy" : (p.effect?.delta ?? 0) < 0 ? "sad" : "idle");

export function AdventureBoard({ state, sound = true }: { state: LiveHostState; sound?: boolean }) {
  const slotOf = (id: string) => state.slots.indexOf(id);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {state.mode === "race" && <RaceBoard players={state.players} goal={state.goal} slotOf={slotOf} index={state.index} sound={sound} />}
      {state.mode === "rocket" && <RocketBoard players={state.players} slotOf={slotOf} index={state.index} />}
      {state.mode === "bridge" && <BridgeBoard players={state.players} goal={state.goal} slotOf={slotOf} index={state.index} planks={state.planks ?? []} />}
      {state.mode === "gold" && <GoldBoard players={state.players} slotOf={slotOf} index={state.index} />}
      {state.mode === "territory" && <TerritoryBoard players={state.players} cells={state.cells} slots={state.slots} index={state.index} />}
      {state.events.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {state.events.slice(0, 4).map((e, i) => (
            <span key={`${e.text}${i}`} className="live-pop rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold shadow-lg ring-1 ring-white/10 backdrop-blur" style={{ animationDelay: `${0.6 + i * 0.2}s` }}>
              {e.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ p, delay = 1.1 }: { p: LivePlayerRow; delay?: number }) {
  if (!p.effect) return null;
  const d = p.effect.delta;
  return (
    <span
      className={cn(
        "live-pop whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black shadow-lg",
        d > 0 ? "bg-emerald-500 text-white" : d < 0 ? "bg-rose-600 text-white" : "bg-white/15 text-white/80"
      )}
      style={{ animationDelay: `${delay}s` }}
    >
      {p.effect.items.join("")} {p.effect.text}
    </span>
  );
}

function NameTag({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("max-w-[7rem] truncate rounded-md px-1.5 py-0.5 text-[11px] font-black text-white shadow sm:text-xs", className)} style={{ background: color }}>
      {firstName(name)}
    </span>
  );
}

// ---- Robot poyga: yugurish yo'lakchalari ----
/** To'r zarbalari ketma-ketligi: har biri shuncha davom etadi (ms) */
const STRIKE_MS = 1900;
const STRIKES_START_MS = 1700;

type Strike = { from: string; to: string; m: number; blocked: boolean };

function RaceBoard({ players, goal, slotOf, index, sound }: { players: LivePlayerRow[]; goal: number; slotOf: (id: string) => number; index: number; sound: boolean }) {
  const arrived = useArrived(index);
  const moving = useMoving(index, 1600);
  // Ekran balandligiga moslash: nechta yo'lakcha sig'sa, shuncha; personaj yo'lakcha balandligiga qarab
  // Maydon balandligi = ekran − sarlavha, yozuv va tugmalar (skrollsiz sig'adi)
  const vh = useViewportHeight();
  const total = Math.max(280, vh - 250);
  const laneArea = total * 0.8 - 12;
  const maxLanes = Math.max(4, Math.min(10, Math.floor(laneArea / 34)));
  const lanes = players.slice(0, maxLanes);
  const laneH = Math.max(30, Math.min(70, Math.floor(laneArea / Math.max(1, lanes.length))));
  const charSize = Math.round(laneH * 0.92);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const laneOf = (id: string) => lanes.findIndex((p) => p.id === id);

  // Elektr to'rlar: kim kimga tashladi (ketma-ket ko'rsatiladi)
  // Ro'yxat har so'rovda yangi obyekt bo'lib keladi — animatsiya faqat zarbalar o'zgarganda qayta boshlanadi
  const sig = players.flatMap((p) => (p.effect?.zaps ?? []).map((z) => `${p.id}>${z.to}:${z.m}:${z.blocked ? 1 : 0}`)).join("|");
  const strikes: Strike[] = useMemo(
    () =>
      sig
        ? sig.split("|").map((t) => {
            const [from, rest] = t.split(">");
            const [to, m, b] = rest.split(":");
            return { from, to, m: Number(m), blocked: b === "1" };
          })
        : [],
    [sig]
  );
  const [cur, setCur] = useState(-1);
  const soundOn = useRef(sound);
  useEffect(() => {
    soundOn.current = sound;
  }, [sound]);
  useEffect(() => {
    if (strikes.length === 0) return;
    const timers = strikes.map((st, k) =>
      setTimeout(() => {
        setCur(k);
        if (soundOn.current) (st.blocked ? playHurt : playZap)();
      }, STRIKES_START_MS + k * STRIKE_MS)
    );
    timers.push(setTimeout(() => setCur(strikes.length), STRIKES_START_MS + strikes.length * STRIKE_MS));
    return () => timers.forEach(clearTimeout);
  }, [strikes]);
  // Hali "tortilmagan" metrlar: zarba navbati kelguncha qurbon to'rsiz joyida turadi
  const pendingHit = (id: string) => strikes.reduce((sum, st, k) => (st.to === id && !st.blocked && k > cur ? sum + st.m : sum), 0);
  const pct = (v: number) => Math.min(100, (v / Math.max(1, goal)) * 100);
  const posOf = (p: LivePlayerRow) => {
    const after = p.progress + pendingHit(p.id);
    const before = Math.max(0, p.progress - Math.max(0, p.effect?.delta ?? 0));
    return arrived ? pct(after) : pct(Math.min(before, after));
  };
  const strike = cur >= 0 && cur < strikes.length ? strikes[cur] : null;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-3xl ring-1 ring-cyan-400/20"
      style={{ background: "linear-gradient(180deg, #0b1e3a 0%, #12304f 18%, #1b3b2a 19%, #14532d 100%)", height: total }}
    >
      {/* Uzoqdagi shahar (sekin suriladi) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[18%] overflow-hidden opacity-70">
        <div className={cn("flex h-full w-[200%] items-end", moving && "adv-scroll-x-fast")}>
          {Array.from({ length: 2 }, (_, k) => (
            <div key={k} className="flex h-full w-1/2 items-end gap-1 px-2">
              {[40, 70, 55, 85, 45, 65, 95, 50, 75, 60, 80, 42, 68, 90, 52].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm bg-[#0f2742]" style={{ height: `${h}%` }}>
                  <div className="mx-auto mt-2 h-1 w-1/2 bg-amber-200/40" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Marra (yo'lakchalar ustida) */}
      <div className="pointer-events-none absolute bottom-0 right-[6%] top-[18%] z-[5] w-4 bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:16px_16px] opacity-90" />
      <div className="pointer-events-none absolute right-[3%] top-[6%] flex items-start">
        <div className="h-12 w-1 rounded bg-slate-300" />
        <div className="adv-flag h-8 w-12 bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:12px_12px]" />
      </div>

      {/* To'r zarbasi e'loni: kim → kimga */}
      {strike && <StrikeBanner key={cur} strike={strike} from={byId.get(strike.from)} to={byId.get(strike.to)} />}

      <div className="absolute inset-x-0 bottom-0 top-[19%] flex flex-col justify-around px-2 py-1.5">
        {lanes.map((p, i) => {
          const color = slotColor(slotOf(p.id));
          const stepping = moving && (p.effect?.delta ?? 0) > 0;
          const turbo = p.effect?.items.includes("🔥");
          const hitNow = strike?.to === p.id && !strike.blocked;
          const shieldNow = strike?.to === p.id && strike.blocked;
          const attacking = strike?.from === p.id;
          const zappedEarlier = strikes.some((st, k) => st.to === p.id && !st.blocked && k < cur);
          const mood: CharMood = hitNow || zappedEarlier ? "sad" : attacking ? "cheer" : stepping ? "run" : moving ? "idle" : afterMood(p);
          return (
            <div key={p.id} className="relative flex flex-1 items-center overflow-visible rounded-xl" style={{ minHeight: laneH - 6 }}>
              {/* Yo'lakcha: asfalt va harakatlanuvchi chiziq */}
              <div className={cn("absolute inset-0 rounded-xl bg-[#1f2937] shadow-inner transition-colors duration-300", hitNow && "bg-[#3b2a07]")} />
              <div className={cn("absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.35)_0_48px,transparent_48px_96px)]", stepping && "adv-road")} />
              <span className="absolute left-2 z-10 font-mono text-xs font-black text-white/50">{i + 1}</span>
              <div
                className="absolute bottom-0 z-10 flex items-end gap-1 ease-out"
                style={{ left: `calc(4% + ${posOf(p) * 0.86}% - ${charSize / 2}px)`, transition: hitNow ? "left 800ms cubic-bezier(0.6,-0.4,0.4,1.3) 600ms" : "left 1500ms ease-out" }}
              >
                <div className={cn("relative", hitNow && "live-freeze")}>
                  {stepping && (
                    <span className="pointer-events-none absolute -left-4 bottom-1 flex gap-1">
                      <span className="adv-dust h-3 w-3 rounded-full bg-white/50" />
                      <span className="adv-dust h-2 w-2 rounded-full bg-white/40" style={{ animationDelay: "0.25s" }} />
                    </span>
                  )}
                  {turbo && stepping && <span className="adv-flame absolute -left-7 bottom-3 text-2xl">🔥</span>}
                  {hitNow && (
                    <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                      <span className="live-pop text-4xl drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]">⚡</span>
                      <NetOverlay size={charSize} />
                    </span>
                  )}
                  {shieldNow && <span className="live-pop absolute -top-3 left-1/2 z-20 -translate-x-1/2 text-3xl drop-shadow-[0_0_12px_rgba(56,189,248,0.9)]">🛡️</span>}
                  {!strike && p.effect?.items.includes("🛡️") && <span className="absolute -top-2 right-0 z-20 text-xl">🛡️</span>}
                  <CharacterSvg look={p.look} size={charSize} mood={mood} pedestal={false} />
                </div>
                <div className="mb-1 flex flex-col items-start gap-0.5">
                  <NameTag name={p.name} color={color} />
                  {laneH >= 44 && cur >= strikes.length && <DeltaBadge p={p} delay={0.2} />}
                  {laneH >= 44 && strikes.length === 0 && <DeltaBadge p={p} />}
                </div>
              </div>
              <span className="absolute right-[9%] z-10 font-mono text-xs font-bold text-white/60">{formatNumberUz(p.progress + pendingHit(p.id))} m</span>
            </div>
          );
        })}
        {/* Uchayotgan to'r: tashlagan yo'lakchadan qurbonga */}
        {strike && laneOf(strike.from) >= 0 && laneOf(strike.to) >= 0 && (
          <NetShot
            key={`shot${cur}`}
            from={{ x: posOf(byId.get(strike.from)!), lane: laneOf(strike.from) }}
            to={{ x: pct(byId.get(strike.to)!.progress + pendingHit(strike.to) + (strike.blocked ? 0 : strike.m)), lane: laneOf(strike.to) }}
            lanes={lanes.length}
            blocked={strike.blocked}
          />
        )}
      </div>
      {players.length > lanes.length && <p className="absolute bottom-1 left-3 text-xs text-white/60">+{players.length - lanes.length} ta poygachi</p>}
    </div>
  );
}

/** Tepadagi katta e'lon: "Ali ⚡ elektr to'r → Zarina −50 m" yoki qalqon qaytardi */
function StrikeBanner({ strike, from, to }: { strike: Strike; from?: LivePlayerRow; to?: LivePlayerRow }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3">
      <div
        className={cn(
          "live-banner flex items-center gap-3 rounded-3xl px-5 py-2.5 shadow-2xl ring-2 sm:gap-5 sm:px-8",
          strike.blocked ? "bg-gradient-to-r from-sky-600 to-cyan-500 ring-sky-200/60" : "bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 text-slate-950 ring-yellow-100/70"
        )}
        style={{ animationDelay: "0s" }}
      >
        <span className="flex items-center gap-2">
          <CharacterSvg look={from?.look} size={52} headOnly mood="cheer" />
          <span className="max-w-[9rem] truncate text-xl font-black sm:text-3xl">{from?.name.split(" ")[0] ?? "?"}</span>
        </span>
        <span className="flex flex-col items-center leading-none">
          <span className="text-3xl sm:text-4xl">⚡</span>
          <span className="text-[11px] font-black uppercase tracking-wider">elektr to&apos;r</span>
        </span>
        <span className="text-2xl font-black sm:text-4xl">→</span>
        <span className="flex items-center gap-2">
          <CharacterSvg look={to?.look} size={52} headOnly mood={strike.blocked ? "cheer" : "sad"} />
          <span className="max-w-[9rem] truncate text-xl font-black sm:text-3xl">{to?.name.split(" ")[0] ?? "?"}</span>
        </span>
        <span className={cn("rounded-2xl px-3 py-1 font-mono text-xl font-black sm:text-3xl", strike.blocked ? "bg-white/20" : "bg-rose-600 text-white")}>
          {strike.blocked ? "🛡️ qaytardi!" : `−${strike.m} m`}
        </span>
      </div>
    </div>
  );
}

/** Uchayotgan elektr to'r: boshlanish yo'lakchasidan qurbon yo'lakchasiga yoy bo'ylab */
function NetShot({ from, to, lanes, blocked }: { from: { x: number; lane: number }; to: { x: number; lane: number }; lanes: number; blocked: boolean }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const y = (lane: number) => ((lane + 0.5) / Math.max(1, lanes)) * 100;
  const p = go ? to : from;
  return (
    <div
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `calc(4% + ${p.x * 0.86}%)`, top: `${y(p.lane)}%`, transition: "left 650ms cubic-bezier(0.3,0.6,0.4,1), top 650ms cubic-bezier(0.3,-0.6,0.4,1)" }}
    >
      <div className={cn("relative flex items-center justify-center", go && "adv-spin-fast")}>
        <svg viewBox="0 0 40 40" className="h-12 w-12 drop-shadow-[0_0_14px_rgba(250,204,21,0.95)] sm:h-16 sm:w-16">
          <circle cx="20" cy="20" r="16" fill="none" stroke="#fde047" strokeWidth="2.5" />
          <path d="M4 20 H36 M20 4 V36 M8.7 8.7 L31.3 31.3 M31.3 8.7 L8.7 31.3" stroke="#facc15" strokeWidth="1.8" />
          <circle cx="20" cy="20" r="8" fill="none" stroke="#fef08a" strokeWidth="1.5" />
        </svg>
        {go && <span className={cn("live-pop absolute text-4xl", blocked && "opacity-0")} style={{ animationDelay: "0.6s" }}>💥</span>}
      </div>
    </div>
  );
}

/** Qurbon ustidagi to'r (yo'lakchada titrab turadi) */
function NetOverlay({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 40 40" className="adv-net absolute" style={{ width: size * 1.1, height: size * 1.1 }}>
      <circle cx="20" cy="20" r="17" fill="rgba(250,204,21,0.12)" stroke="#fde047" strokeWidth="2" />
      <path d="M3 20 H37 M20 3 V37 M8 8 L32 32 M32 8 L8 32" stroke="#facc15" strokeWidth="1.4" />
    </svg>
  );
}

// ---- Raketa parvozi ----
function Rocket({ p, color, fell, flying }: { p: LivePlayerRow; color: string; fell: boolean; flying: boolean }) {
  return (
    <div className={cn("relative flex flex-col items-center", fell ? "adv-wobble" : flying ? "" : "adv-bob")}>
      <svg viewBox="0 0 60 110" className="h-24 w-14 drop-shadow-[0_0_14px_rgba(255,255,255,0.25)] sm:h-28 sm:w-16">
        <path d="M30 2 C46 18 48 48 44 78 L16 78 C12 48 14 18 30 2 Z" fill="#e2e8f0" />
        <path d="M30 2 C38 10 42 20 43 30 L17 30 C18 20 22 10 30 2 Z" fill={color} />
        <path d="M16 62 L4 84 L16 80 Z M44 62 L56 84 L44 80 Z" fill={color} />
        <rect x="22" y="78" width="16" height="6" rx="2" fill="#64748b" />
        <circle cx="30" cy="48" r="13" fill="#0f172a" stroke={color} strokeWidth="3" />
      </svg>
      {/* Illyuminatorda — personaj boshi */}
      <span className="pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2 overflow-hidden rounded-full sm:top-[31%]" style={{ width: 24, height: 24 }}>
        <CharacterSvg look={p.look} size={24} headOnly still mood={fell ? "sad" : "happy"} />
      </span>
      {!fell && (
        <span className="absolute top-[76%] flex flex-col items-center">
          <span className={cn("adv-flame block h-8 w-4 rounded-b-full bg-gradient-to-b from-yellow-200 via-orange-400 to-transparent", flying && "h-14 w-5")} />
        </span>
      )}
    </div>
  );
}

function RocketBoard({ players, slotOf, index }: { players: LivePlayerRow[]; slotOf: (id: string) => number; index: number }) {
  const arrived = useArrived(index);
  const flying = useMoving(index, 1800);
  const cols = players.slice(0, 10);
  const top = Math.max(3300, ...players.map((p) => p.progress * 1.12));
  // Raketa va yozuvi tepada qirqilmasin
  const pct = (v: number) => Math.min(70, (v / top) * 80);
  return (
    <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-3xl ring-1 ring-indigo-400/20 lg:min-h-[440px]" style={{ background: "linear-gradient(to top, #38bdf8 0%, #1e3a8a 18%, #1e1b4b 45%, #0b0820 75%, #000 100%)" }}>
      {/* Yulduzlar — uchish paytida tezroq oqadi */}
      <div
        className={cn("pointer-events-none absolute inset-0 opacity-80", flying ? "adv-stars-fast" : "adv-stars")}
        style={{
          backgroundImage:
            "radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 20%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 60%, #fff, transparent), radial-gradient(1px 1px at 85% 45%, #fff, transparent), radial-gradient(1px 1px at 10% 70%, #fff, transparent), radial-gradient(2px 2px at 55% 85%, #c7d2fe, transparent)",
          backgroundSize: "300px 300px",
        }}
      />
      {/* Oy va bulutlar */}
      <div className="pointer-events-none absolute right-[8%] top-[6%] h-16 w-16 rounded-full bg-gradient-to-br from-slate-100 to-slate-400 shadow-[0_0_40px_rgba(226,232,240,0.5)]">
        <span className="absolute left-3 top-4 h-3 w-3 rounded-full bg-slate-400/60" />
        <span className="absolute bottom-3 right-4 h-2 w-2 rounded-full bg-slate-400/60" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-[4%] h-16 overflow-hidden opacity-80">
        <div className="adv-scroll-x flex h-full w-[200%]">
          {Array.from({ length: 2 }, (_, k) => (
            <div key={k} className="relative h-full w-1/2">
              {[8, 30, 55, 78].map((x) => (
                <span key={x} className="absolute bottom-2 h-8 w-28 rounded-full bg-white/70 blur-[2px]" style={{ left: `${x}%` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {ROCKET_MILESTONES.map((m) => (
        <div key={m.km} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/20" style={{ bottom: `${pct(m.km)}%` }}>
          <span className="absolute left-2 -translate-y-full text-xs font-bold text-white/80">
            {m.icon} {m.label} · {formatNumberUz(m.km)} km
          </span>
        </div>
      ))}
      <div className="absolute inset-x-[10%] bottom-0 top-0 flex justify-around">
        {cols.map((p) => {
          const before = Math.max(0, p.progress - (p.effect?.delta ?? 0));
          const fell = (p.effect?.delta ?? 0) < 0;
          const at = arrived ? pct(p.progress) : pct(before);
          const color = slotColor(slotOf(p.id));
          return (
            <div key={p.id} className="relative h-full w-16">
              <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 transition-[bottom] duration-[1700ms] ease-out" style={{ bottom: `calc(${at}% + 34px)` }}>
                <DeltaBadge p={p} delay={1.6} />
                <Rocket p={p} color={color} fell={fell} flying={flying && !fell && (p.effect?.delta ?? 0) > 0} />
              </div>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2">
                <NameTag name={p.name} color={color} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Ko'prikdan o'tish ----
function BridgeBoard({
  players,
  goal,
  slotOf,
  index,
  planks,
}: {
  players: LivePlayerRow[];
  goal: number;
  slotOf: (id: string) => number;
  index: number;
  planks: { known: number; broken: number }[];
}) {
  const arrived = useArrived(index);
  const hopping = useMoving(index, 1300);
  const L = Math.max(1, goal);
  const shown = players.slice(0, 24);
  // Har taxtadagi o'yinchilar
  const onPlank = new Map<number, LivePlayerRow[]>();
  for (const p of shown) {
    const k = Math.min(L, p.progress);
    onPlank.set(k, [...(onPlank.get(k) ?? []), p]);
  }
  const x = (k: number) => 8 + (k / L) * 84;
  return (
    <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-3xl ring-1 ring-teal-400/20 lg:min-h-[440px]" style={{ background: "linear-gradient(to bottom, #7dd3fc 0%, #38bdf8 22%, #0c4a6e 46%, #0e7490 47%, #155e75 100%)" }}>
      {/* Quyosh va bulutlar */}
      <div className="pointer-events-none absolute left-[12%] top-[6%] h-14 w-14 rounded-full bg-yellow-200 shadow-[0_0_50px_rgba(254,240,138,0.9)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[4%] h-14 overflow-hidden">
        <div className="adv-scroll-x flex h-full w-[200%]">
          {Array.from({ length: 2 }, (_, k) => (
            <div key={k} className="relative h-full w-1/2">
              {[20, 52, 80].map((cx) => (
                <span key={cx} className="absolute top-2 h-6 w-24 rounded-full bg-white/80" style={{ left: `${cx}%` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Qirg'oqlar */}
      <div className="absolute bottom-0 left-0 top-[42%] w-[8%] rounded-tr-3xl bg-gradient-to-b from-lime-500 to-amber-900" />
      <div className="absolute bottom-0 right-0 top-[42%] w-[8%] rounded-tl-3xl bg-gradient-to-b from-lime-400 to-amber-900">
        <span className="adv-sway absolute -top-14 left-1/2 -translate-x-1/2 text-5xl">🌴</span>
        <span className="absolute -top-6 left-0 text-2xl">🏁</span>
      </div>
      {/* Suv: ikki qatlam to'lqin */}
      <div className="pointer-events-none absolute inset-x-0 top-[52%] h-10 overflow-hidden opacity-50">
        <svg className="adv-wave h-full w-[200%]" viewBox="0 0 800 40" preserveAspectRatio="none">
          <path d="M0 20 Q50 0 100 20 T200 20 T300 20 T400 20 T500 20 T600 20 T700 20 T800 20 V40 H0 Z" fill="#67e8f9" />
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[70%] h-10 overflow-hidden opacity-30">
        <svg className="adv-wave-slow h-full w-[200%]" viewBox="0 0 800 40" preserveAspectRatio="none">
          <path d="M0 20 Q50 40 100 20 T200 20 T300 20 T400 20 T500 20 T600 20 T700 20 T800 20 V40 H0 Z" fill="#a5f3fc" />
        </svg>
      </div>
      {/* Ko'prik: har qadamda 3 ta taxta — bosilgan mustahkamlari yashil, singanlari yo'q bo'lib qoladi */}
      <div className="absolute left-[8%] right-[8%] top-[38%] h-[2px] bg-amber-950/60" />
      <div className="absolute left-[8%] right-[8%] top-[38%] flex h-[13%] gap-1">
        {Array.from({ length: L }, (_, i) => (
          <div key={i} className="flex h-full flex-1 flex-col gap-[3px]">
            {Array.from({ length: PLANKS }, (_, j) => {
              const pl = planks[i];
              const broken = pl ? pl.broken & (1 << j) : 0;
              const safe = pl && !broken ? pl.known & (1 << j) : 0;
              return (
                <div
                  key={j}
                  className={cn(
                    "relative flex-1 rounded-sm shadow-md transition-colors duration-700",
                    broken ? "border border-dashed border-rose-300/60 bg-transparent" : safe ? "bg-gradient-to-b from-emerald-400 to-emerald-700 shadow-emerald-400/40" : "bg-gradient-to-b from-amber-600 to-amber-800"
                  )}
                >
                  {broken ? <span className="live-pop absolute inset-0 flex items-center justify-center text-xs">💥</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {/* O'yinchilar */}
      {[...onPlank.entries()].map(([k, list]) =>
        list.map((p, j) => {
          const splash = p.effect?.kind === "splash";
          const stepped = p.effect?.kind === "step" || p.effect?.kind === "finish";
          const prev = Math.max(0, Math.min(L, p.progress + (splash && (p.effect?.delta ?? 0) < 0 ? 1 : stepped ? -1 : 0)));
          const left = arrived ? x(k) : x(prev);
          return (
            <div
              key={p.id}
              className="absolute flex -translate-x-1/2 flex-col items-center transition-[left] duration-[1200ms] ease-out"
              style={{ left: `calc(${left}% + ${((j % 4) - 1.5) * 46}px)`, bottom: `${60 + Math.floor(j / 4) * 9}%`, zIndex: 10 - Math.floor(j / 4) }}
              title={p.name}
            >
              <CharacterSvg look={p.look} size={50} mood={hopping && stepped ? "jump" : splash ? "sad" : p.finished ? "happy" : "idle"} pedestal={false} />
              <NameTag name={p.name} color={slotColor(slotOf(p.id))} className="-mt-1" />
              {splash && (
                <span className="pointer-events-none absolute top-24 flex gap-1">
                  <span className="adv-splash text-3xl">💦</span>
                  <span className="adv-splash text-2xl" style={{ animationDelay: "0.3s" }}>
                    💧
                  </span>
                </span>
              )}
            </div>
          );
        })
      )}
      {/* Yetakchilar */}
      <ol className="absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-1.5">
        {players.slice(0, 6).map((p, i) => (
          <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-black/40 py-0.5 pl-1 pr-3 text-xs font-bold backdrop-blur">
            <CharacterSvg look={p.look} size={22} headOnly still />
            {i + 1}. {firstName(p.name)} · {Math.min(L, p.progress)}/{L}
            {p.finished && " 🏝️"}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---- Oltin kon ----
function GoldBoard({ players, slotOf, index }: { players: LivePlayerRow[]; slotOf: (id: string) => number; index: number }) {
  const digging = useMoving(index, 2200);
  const rows = players.slice(0, 8);
  const top = Math.max(1, ...rows.map((p) => p.score));
  return (
    <div className="relative flex-1 overflow-hidden rounded-3xl p-3 ring-1 ring-amber-400/20" style={{ background: "radial-gradient(ellipse at 50% 0%, #4a2c0b 0%, #2b1a07 40%, #120a03 100%)" }}>
      {/* Kon devoridagi yaltiroq toshlar */}
      {[
        [6, 12],
        [92, 18],
        [14, 64],
        [88, 72],
        [48, 6],
        [70, 40],
        [30, 88],
      ].map(([x, y], i) => (
        <span key={i} className="adv-sparkle pointer-events-none absolute text-lg" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.37}s` }}>
          {i % 3 === 0 ? "💎" : "✨"}
        </span>
      ))}
      {/* Fonar */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-[70%] -translate-x-1/2 rounded-b-full bg-amber-300/10 blur-2xl" />
      <div className="relative flex h-full flex-col justify-around gap-2">
        {rows.map((p, i) => {
          const items = p.effect?.items ?? [];
          const gained = (p.effect?.delta ?? 0) > 0 || items.length > 0;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-black/35 px-3 py-1.5 ring-1 ring-amber-200/10">
              <span className="w-6 text-center font-mono font-black text-amber-200/70">{i === 0 ? "👑" : i + 1}</span>
              <span className="relative shrink-0">
                <CharacterSvg look={p.look} size={44} mood={digging && gained ? "work" : gained ? "happy" : "idle"} holding="pickaxe" pedestal={false} />
                {digging && gained && (
                  <span className="adv-coin pointer-events-none absolute -top-1 left-1/2 text-lg" style={{ animationDelay: `${i * 0.1}s` }}>
                    <GoldCoin />
                  </span>
                )}
              </span>
              <span className="w-28 shrink-0 truncate text-base font-black sm:w-40 sm:text-lg" style={{ color: slotColor(slotOf(p.id)) }}>
                {p.name}
              </span>
              <div className="relative h-8 flex-1 overflow-hidden rounded-xl bg-white/10">
                <div className="relative h-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-300 transition-[width] duration-1000" style={{ width: `${Math.max(4, (p.score / top) * 100)}%` }}>
                  <span className="reward-shine absolute inset-0" />
                </div>
                <span className="absolute inset-y-0 right-3 flex items-center font-mono text-sm font-black text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{formatNumberUz(p.score)} <GoldCoin /></span>
              </div>
              <span className="flex w-28 shrink-0 justify-end gap-1 text-2xl sm:w-36 sm:text-3xl">
                {items.map((it, j) => (
                  <span key={j} className="live-drop" style={{ animationDelay: `${0.4 + j * 0.35}s` }}>
                    {it}
                  </span>
                ))}
                {!items.length && <span className="text-base text-white/30">⛏️</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Hudud bosib olish ----
function TerritoryBoard({ players, cells, slots, index }: { players: LivePlayerRow[]; cells: number[]; slots: string[]; index: number }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const counts = new Map<number, number>();
  cells.forEach((c) => c >= 0 && counts.set(c, (counts.get(c) ?? 0) + 1));
  // Har egasining "markazi" — personaji shu yerda turadi
  const centers = new Map<number, { x: number; y: number; n: number }>();
  cells.forEach((c, i) => {
    if (c < 0) return;
    const m = centers.get(c) ?? { x: 0, y: 0, n: 0 };
    m.x += i % GRID_W;
    m.y += Math.floor(i / GRID_W);
    m.n++;
    centers.set(c, m);
  });
  const legend = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className="relative min-h-[260px] flex-1">
        <div
          className="grid h-full min-h-[260px] w-full gap-[3px] rounded-3xl p-2 shadow-inner"
          style={{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)`, gridTemplateRows: `repeat(${GRID_H}, 1fr)`, background: "linear-gradient(135deg, #0b3b2e, #0f172a)" }}
        >
          {Array.from({ length: GRID_W * GRID_H }, (_, i) => {
            const owner = cells[i] ?? -1;
            return (
              <div
                // Egasi o'zgarsa — katak qaytadan "sakrab" bo'yaladi
                key={`${i}:${owner}`}
                className={cn("relative rounded-md", owner >= 0 && "adv-cell shadow-[inset_0_-3px_0_rgba(0,0,0,0.25)]")}
                style={{
                  background: owner >= 0 ? `linear-gradient(160deg, ${slotColor(owner)}, ${slotColor(owner)}cc)` : "rgba(255,255,255,0.06)",
                  animationDelay: `${(i % GRID_W) * 30 + Math.floor(i / GRID_W) * 15}ms`,
                }}
              />
            );
          })}
        </div>
        {[...centers.entries()].map(([slot, m]) =>
          m.n >= 3 ? (
            <span
              key={`${slot}:${index}`}
              className="live-drop pointer-events-none absolute flex -translate-x-1/2 -translate-y-[70%] flex-col items-center"
              style={{ left: `${((m.x / m.n + 0.5) / GRID_W) * 100}%`, top: `${((m.y / m.n + 0.5) / GRID_H) * 100}%` }}
            >
              <CharacterSvg look={byId.get(slots[slot])?.look} size={m.n >= 10 ? 48 : 36} mood={m.n >= 10 ? "happy" : "idle"} pedestal={false} />
              <span className="-mt-1 rounded bg-black/50 px-1 text-[10px] font-black">🚩{m.n}</span>
            </span>
          ) : null
        )}
      </div>
      <ol className="grid content-start gap-1.5 lg:w-72">
        {legend.map(([slot, n], i) => {
          const p = byId.get(slots[slot]);
          return (
            <li key={slot} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5">
              <span className="w-5 font-mono text-sm font-black text-white/60">{i + 1}</span>
              <span className="h-4 w-4 shrink-0 rounded" style={{ background: slotColor(slot) }} />
              <CharacterSvg look={p?.look} size={26} headOnly still />
              <span className="min-w-0 flex-1 truncate font-black">{p?.name ?? "?"}</span>
              <span className="font-mono text-sm font-black">{n} 🚩</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** O'quvchi telefonida: shu natijaning ta'siri va o'z holati (o'z personaji bilan) */
export function AdventureMine({
  mode,
  me,
  goal,
}: {
  mode: LiveHostState["mode"];
  me: { progress: number; finished: boolean; effect: { kind: string; text: string; delta: number; items: string[] } | null; score: number; look?: GameLook | null };
  goal: number;
}) {
  const e = me.effect;
  const good = (e?.delta ?? 0) > 0;
  const bad = (e?.delta ?? 0) < 0;
  const status =
    mode === "race"
      ? `${formatNumberUz(me.progress)} / ${formatNumberUz(goal)} m${me.finished ? " · marrada 🏁" : ""}`
      : mode === "rocket"
      ? `Balandlik: ${formatNumberUz(me.progress)} km`
      : mode === "bridge"
      ? `Ko'prikda: ${me.progress} / ${goal}${me.finished ? " · qirg'oqda 🏝️" : ""}`
      : mode === "gold"
      ? `Boylik: ${formatNumberUz(me.score)} 💰 · ${me.progress} 💎`
      : `Hududingiz: ${me.progress} katak 🚩`;
  const mood: CharMood = good ? (mode === "gold" ? "work" : mode === "race" ? "run" : mode === "rocket" ? "fly" : "cheer") : bad ? "sad" : me.finished ? "cheer" : "idle";
  return (
    <div className={cn("live-pop flex flex-col items-center gap-2 rounded-3xl px-5 py-4 text-center", good ? "bg-emerald-500/20 ring-1 ring-emerald-400/50" : bad ? "bg-rose-500/20 ring-1 ring-rose-400/50" : "bg-white/10")}>
      <div className="flex items-end gap-2">
        <CharacterSvg look={me.look} size={88} mood={mood} holding={mode === "gold" ? "pickaxe" : null} />
        {e?.items.length ? <span className="live-drop mb-6 text-4xl">{e.items.join(" ")}</span> : null}
      </div>
      {e && <p className="text-xl font-black lg:text-3xl">{e.text}</p>}
      <p className="font-mono text-sm font-bold text-white/80 lg:text-lg">{status}</p>
      {(mode === "race" || mode === "bridge") && goal > 0 && (
        <div className="h-3 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-lime-300 transition-[width] duration-1000" style={{ width: `${Math.min(100, (me.progress / goal) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
