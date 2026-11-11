"use client";

import { useEffect, useState } from "react";
import type { LiveHostState, LivePlayerRow } from "@/actions/live-game.actions";
import { GRID_H, GRID_W, ROCKET_MILESTONES } from "@/lib/live-game/adventures";
import { cn, formatNumberUz } from "@/lib/utils";

// Sarguzasht rejimlarining proyektordagi maydonlari: poyga yo'li, osmon, ko'prik, kon va hudud xaritasi.
// Har natijada o'yinchilar avvalgi joyidan yangisiga animatsiya bilan o'tadi.

export const SLOT_COLORS = [
  "#f43f5e", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16",
  "#f97316", "#6366f1", "#14b8a6", "#eab308", "#ef4444", "#8b5cf6", "#10b981", "#0ea5e9",
  "#d946ef", "#65a30d", "#fb7185", "#38bdf8", "#facc15", "#4ade80", "#c084fc", "#fdba74",
];
export const slotColor = (slot: number) => (slot < 0 ? "#64748b" : SLOT_COLORS[slot % SLOT_COLORS.length]);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Bir kadrdan keyin "true": avval eski joyda chiziladi, keyin yangisiga suriladi */
function useArrived(key: number) {
  const [arrived, setArrived] = useState<number | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setArrived(key)));
    return () => cancelAnimationFrame(id);
  }, [key]);
  return arrived === key;
}

export function AdventureBoard({ state }: { state: LiveHostState }) {
  const slotOf = (id: string) => state.slots.indexOf(id);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {state.mode === "race" && <RaceBoard players={state.players} goal={state.goal} slotOf={slotOf} index={state.index} />}
      {state.mode === "rocket" && <RocketBoard players={state.players} slotOf={slotOf} index={state.index} />}
      {state.mode === "bridge" && <BridgeBoard players={state.players} goal={state.goal} slotOf={slotOf} index={state.index} />}
      {state.mode === "gold" && <GoldBoard players={state.players} slotOf={slotOf} />}
      {state.mode === "territory" && <TerritoryBoard players={state.players} cells={state.cells} slots={state.slots} />}
      {state.events.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {state.events.slice(0, 4).map((e, i) => (
            <span key={`${e.text}${i}`} className="live-pop rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold" style={{ animationDelay: `${0.6 + i * 0.2}s` }}>
              {e.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ p }: { p: LivePlayerRow }) {
  if (!p.effect) return null;
  const d = p.effect.delta;
  return (
    <span
      className={cn(
        "live-pop whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black",
        d > 0 ? "bg-emerald-500 text-white" : d < 0 ? "bg-rose-600 text-white" : "bg-white/15 text-white/80"
      )}
      style={{ animationDelay: "1.1s" }}
    >
      {p.effect.items.join("")} {p.effect.text}
    </span>
  );
}

// ---- Robot poyga ----
function RaceBoard({ players, goal, slotOf, index }: { players: LivePlayerRow[]; goal: number; slotOf: (id: string) => number; index: number }) {
  const arrived = useArrived(index);
  const lanes = players.slice(0, 10);
  return (
    <div className="relative flex-1 overflow-hidden rounded-3xl bg-[#08202b] p-3 ring-1 ring-cyan-400/20">
      <div className="pointer-events-none absolute inset-y-0 right-[6%] w-3 bg-[repeating-linear-gradient(0deg,#fff_0_12px,#111_12px_24px)] opacity-80" />
      <p className="pointer-events-none absolute right-[2%] top-1 text-3xl">🏁</p>
      <div className="flex h-full flex-col justify-around gap-1.5">
        {lanes.map((p, i) => {
          const color = slotColor(slotOf(p.id));
          const before = Math.max(0, p.progress - Math.max(0, p.effect?.delta ?? 0));
          const pct = (v: number) => Math.min(100, (v / Math.max(1, goal)) * 100);
          const at = arrived ? pct(p.progress) : pct(before);
          return (
            <div key={p.id} className="relative flex min-h-[40px] flex-1 items-center rounded-xl bg-black/25">
              <span className="absolute left-2 z-10 w-28 truncate text-sm font-black sm:w-40 sm:text-base">
                {i + 1}. {p.name}
              </span>
              <div className="absolute inset-y-1/2 left-[22%] right-[6%] border-t-2 border-dashed border-white/10" />
              <div
                className="absolute flex items-center gap-1.5 transition-[left] duration-[1400ms] ease-out"
                style={{ left: `calc(22% + ${at * 0.72}% - 18px)` }}
              >
                <span className="relative text-3xl drop-shadow-[0_0_8px_rgba(0,0,0,0.6)] sm:text-4xl" style={{ filter: `drop-shadow(0 0 10px ${color})` }}>
                  🤖
                  {p.effect?.items.includes("🔥") && <span className="absolute -left-5 top-1 text-xl">🔥</span>}
                </span>
                <DeltaBadge p={p} />
              </div>
              <span className="absolute right-[8%] font-mono text-xs font-bold text-white/60">{formatNumberUz(p.progress)} m</span>
            </div>
          );
        })}
      </div>
      {players.length > lanes.length && <p className="absolute bottom-1 left-3 text-xs text-white/50">+{players.length - lanes.length} ta robot</p>}
    </div>
  );
}

// ---- Raketa parvozi ----
function RocketBoard({ players, slotOf, index }: { players: LivePlayerRow[]; slotOf: (id: string) => number; index: number }) {
  const arrived = useArrived(index);
  const cols = players.slice(0, 10);
  const top = Math.max(3300, ...players.map((p) => p.progress * 1.12));
  const pct = (v: number) => Math.min(96, (v / top) * 100);
  return (
    <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-3xl ring-1 ring-indigo-400/20 lg:min-h-[440px]" style={{ background: "linear-gradient(to top, #38bdf8 0%, #1e3a8a 18%, #1e1b4b 45%, #0b0820 75%, #000 100%)" }}>
      {/* Yulduzlar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-70 [background-image:radial-gradient(1.5px_1.5px_at_20%_30%,#fff,transparent),radial-gradient(1px_1px_at_70%_20%,#fff,transparent),radial-gradient(1.5px_1.5px_at_40%_60%,#fff,transparent),radial-gradient(1px_1px_at_85%_45%,#fff,transparent),radial-gradient(1px_1px_at_10%_70%,#fff,transparent)]" />
      {ROCKET_MILESTONES.map((m) => (
        <div key={m.km} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/20" style={{ bottom: `${pct(m.km)}%` }}>
          <span className="absolute left-2 -translate-y-full text-xs font-bold text-white/70">
            {m.icon} {m.label} · {formatNumberUz(m.km)} km
          </span>
        </div>
      ))}
      <div className="absolute inset-x-[12%] bottom-0 top-0 flex justify-around">
        {cols.map((p) => {
          const before = Math.max(0, p.progress - (p.effect?.delta ?? 0));
          const fell = (p.effect?.delta ?? 0) < 0;
          const at = arrived ? pct(p.progress) : pct(before);
          return (
            <div key={p.id} className="relative h-full w-14">
              <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center transition-[bottom] duration-[1600ms] ease-out" style={{ bottom: `calc(${at}% + 28px)` }}>
                <DeltaBadge p={p} />
                <span className={cn("text-4xl", fell ? "rotate-180" : "-rotate-45")} style={{ filter: `drop-shadow(0 0 10px ${slotColor(slotOf(p.id))})` }}>
                  🚀
                </span>
                {!fell && (p.effect?.delta ?? 0) > 0 && <span className="-mt-2 text-xl">🔥</span>}
              </div>
              <span className="absolute bottom-1 left-1/2 w-20 -translate-x-1/2 truncate text-center text-xs font-black">{p.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Ko'prikdan o'tish ----
function BridgeBoard({ players, goal, slotOf, index }: { players: LivePlayerRow[]; goal: number; slotOf: (id: string) => number; index: number }) {
  const arrived = useArrived(index);
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
    <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-3xl ring-1 ring-teal-400/20 lg:min-h-[440px]" style={{ background: "linear-gradient(to bottom, #0c4a6e 0%, #075985 45%, #0e7490 46%, #155e75 100%)" }}>
      {/* Qirg'oqlar */}
      <div className="absolute bottom-0 left-0 top-[42%] w-[8%] rounded-tr-3xl bg-gradient-to-b from-lime-600 to-amber-900" />
      <div className="absolute bottom-0 right-0 top-[42%] w-[8%] rounded-tl-3xl bg-gradient-to-b from-lime-500 to-amber-900">
        <span className="absolute -top-10 left-1/2 -translate-x-1/2 text-4xl">🏝️</span>
      </div>
      {/* Ko'prik taxtalari */}
      <div className="absolute left-[8%] right-[8%] top-[42%] flex h-5 gap-1">
        {Array.from({ length: L }, (_, i) => (
          <div key={i} className="h-full flex-1 rounded-sm bg-gradient-to-b from-amber-600 to-amber-800 shadow-md" />
        ))}
      </div>
      {/* To'lqinlar */}
      <div className="live-drift pointer-events-none absolute inset-x-0 top-[55%] text-center text-3xl tracking-[2rem] opacity-30">〰〰〰〰〰〰〰〰</div>
      {/* O'yinchilar */}
      {[...onPlank.entries()].map(([k, list]) =>
        list.map((p, j) => {
          const splash = p.effect?.kind === "splash";
          const prev = Math.max(0, Math.min(L, p.progress + (splash && (p.effect?.delta ?? 0) < 0 ? 1 : p.effect?.kind === "step" || p.effect?.kind === "finish" ? -1 : 0)));
          const left = arrived ? x(k) : x(prev);
          return (
            <div
              key={p.id}
              className="absolute flex -translate-x-1/2 flex-col items-center transition-[left] duration-[1200ms] ease-out"
              style={{ left: `calc(${left}% + ${((j % 4) - 1.5) * 26}px)`, bottom: `${58 + Math.floor(j / 4) * 7}%` }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white shadow-lg ring-2 ring-white/70"
                style={{ background: slotColor(slotOf(p.id)) }}
                title={p.name}
              >
                {initials(p.name)}
              </span>
              {splash && <span className="live-pop absolute top-20 text-3xl">💦</span>}
            </div>
          );
        })
      )}
      {/* Yetakchilar */}
      <ol className="absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-1.5">
        {players.slice(0, 6).map((p, i) => (
          <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs font-bold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: slotColor(slotOf(p.id)) }} />
            {i + 1}. {p.name} · {Math.min(L, p.progress)}/{L}
            {p.finished && " 🏝️"}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---- Oltin kon ----
function GoldBoard({ players, slotOf }: { players: LivePlayerRow[]; slotOf: (id: string) => number }) {
  const rows = players.slice(0, 8);
  const top = Math.max(1, ...rows.map((p) => p.score));
  return (
    <div className="relative flex-1 overflow-hidden rounded-3xl p-3 ring-1 ring-amber-400/20" style={{ background: "linear-gradient(180deg, #2b1a07, #1a0f04 60%, #0d0802)" }}>
      <div className="flex h-full flex-col justify-around gap-2">
        {rows.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-black/30 px-3 py-2">
            <span className="w-6 text-center font-mono font-black text-amber-200/70">{i + 1}</span>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: slotColor(slotOf(p.id)) }} />
            <span className="w-32 shrink-0 truncate text-base font-black sm:w-44 sm:text-lg">{p.name}</span>
            <div className="relative h-8 flex-1 overflow-hidden rounded-xl bg-white/10">
              <div className="h-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-1000" style={{ width: `${Math.max(4, (p.score / top) * 100)}%` }} />
              <span className="absolute inset-y-0 right-3 flex items-center font-mono text-sm font-black text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{formatNumberUz(p.score)} 🪙</span>
            </div>
            <span className="flex w-28 shrink-0 justify-end gap-1 text-2xl sm:w-36 sm:text-3xl">
              {(p.effect?.items ?? []).map((it, j) => (
                <span key={j} className="live-drop" style={{ animationDelay: `${0.4 + j * 0.35}s` }}>
                  {it}
                </span>
              ))}
              {!p.effect?.items.length && <span className="text-base text-white/30">⛏️</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Hudud bosib olish ----
function TerritoryBoard({ players, cells, slots }: { players: LivePlayerRow[]; cells: number[]; slots: string[] }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const counts = new Map<number, number>();
  cells.forEach((c) => c >= 0 && counts.set(c, (counts.get(c) ?? 0) + 1));
  // Har egasining "markazi" — ismi qisqartmasi shu yerda
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
        <div className="grid h-full min-h-[260px] w-full gap-[3px] rounded-3xl bg-black/30 p-2" style={{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)`, gridTemplateRows: `repeat(${GRID_H}, 1fr)` }}>
          {Array.from({ length: GRID_W * GRID_H }, (_, i) => {
            const owner = cells[i] ?? -1;
            return (
              <div
                key={i}
                className="rounded-md transition-colors duration-700"
                style={{ background: owner >= 0 ? slotColor(owner) : "rgba(255,255,255,0.06)", transitionDelay: `${(i % GRID_W) * 25}ms` }}
              />
            );
          })}
        </div>
        {[...centers.entries()].map(([slot, m]) =>
          m.n >= 3 ? (
            <span
              key={slot}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/40 px-1.5 text-sm font-black"
              style={{ left: `${((m.x / m.n + 0.5) / GRID_W) * 100}%`, top: `${((m.y / m.n + 0.5) / GRID_H) * 100}%` }}
            >
              {initials(byId.get(slots[slot])?.name ?? "?")}
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
              <span className="min-w-0 flex-1 truncate font-black">{p?.name ?? "?"}</span>
              <span className="font-mono text-sm font-black">{n} 🚩</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** O'quvchi telefonida: shu natijaning ta'siri va o'z holati */
export function AdventureMine({
  mode,
  me,
  goal,
}: {
  mode: LiveHostState["mode"];
  me: { progress: number; finished: boolean; effect: { kind: string; text: string; delta: number; items: string[] } | null; score: number };
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
      ? `Boylik: ${formatNumberUz(me.score)} 🪙 · ${me.progress} 💎`
      : `Hududingiz: ${me.progress} katak 🚩`;
  const icon = { race: "🤖", rocket: "🚀", bridge: "🌉", gold: "⛏️", territory: "🚩" }[mode as "race"] ?? "⭐";
  return (
    <div className={cn("live-pop flex flex-col items-center gap-2 rounded-3xl px-5 py-4 text-center", good ? "bg-emerald-500/20 ring-1 ring-emerald-400/50" : bad ? "bg-rose-500/20 ring-1 ring-rose-400/50" : "bg-white/10")}>
      <span className="text-5xl">{e?.items.length ? e.items.join(" ") : icon}</span>
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
