"use client";

import { useEffect, useState } from "react";
import type { LiveHostState, LivePlayerRow } from "@/actions/live-game.actions";
import { CharacterSvg, type CharMood } from "@/components/character/character-svg";
import { TEAM_NAMES } from "@/lib/live-game/modes";
import { CASTLE_HP, ISLAND_BOARD, ISLAND_LEN, ROPE_WIN } from "@/lib/live-game/team-adventures";
import { cn, formatNumberUz } from "@/lib/utils";

// Jamoaviy sarguzashtlarning proyektordagi maydonlari: arqon tortish, qal'a qamali, penalti va orol xazinasi.
// O'quvchilarning o'z personajlari jamoa bo'lib harakat qiladi: tortadi, qal'a devorida turadi, gol urib quvonadi,
// orol bo'ylab yuradi. Natija ochilganda oldingi holatdan yangisiga silliq o'tadi.

export const TEAM_HEX = ["#f43f5e", "#3b82f6", "#facc15", "#22c55e"];
const teamName = (t: number) => TEAM_NAMES[t] ?? `${t + 1}-jamoa`;
const firstName = (n: string) => n.split(/\s+/).filter(Boolean)[0] ?? n;
const moodOf = (p: LivePlayerRow, win: boolean): CharMood => ((p.effect?.delta ?? 0) > 0 ? (win ? "cheer" : "happy") : p.effect ? "sad" : "idle");

/** Ikki kadrdan keyin "true": avval oldingi holat chiziladi, keyin yangisiga o'tadi (CSS transition) */
function useArrived() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

export function TeamAdventureBoard({ state }: { state: LiveHostState }) {
  const members = (t: number) => state.players.filter((p) => p.team === t);
  if (state.mode === "tug") return <TugBoard cells={state.cells} members={members} />;
  if (state.mode === "siege") return <SiegeBoard cells={state.cells} teams={state.teams} members={members} />;
  if (state.mode === "football") return <FootballBoard cells={state.cells} members={members} />;
  if (state.mode === "island") return <IslandBoard cells={state.cells} teams={state.teams} members={members} />;
  return null;
}

function Crew({ list, size, win, flip = false, className }: { list: LivePlayerRow[]; size: number; win: boolean; flip?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-end", className)} style={{ gap: -size * 0.25 }}>
      {list.map((p) => (
        <div key={p.id} className="flex flex-col items-center" style={{ marginInline: -size * 0.04 }}>
          <div style={flip ? { transform: "scaleX(-1)" } : undefined}>
            <CharacterSvg look={p.look} size={size} mood={moodOf(p, win)} pedestal={false} still={list.length > 6} />
          </div>
          <span className="truncate rounded-full bg-black/40 px-1.5 text-[10px] font-bold" style={{ maxWidth: Math.max(44, size + 6) }}>
            {firstName(p.name)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------- Arqon tortish ----------------
function TugBoard({ cells, members }: { cells: number[]; members: (t: number) => LivePlayerRow[] }) {
  const arrived = useArrived();
  const rope = cells[0] ?? 0;
  const prev = cells[3] ?? 0;
  const wins = [cells[1] ?? 0, cells[2] ?? 0];
  // Raund yutilganda arqon markazga qaytadi — avval chetga borib, keyin qaytgandek ko'rsatiladi
  const shown = arrived ? rope : prev;
  const pct = (v: number) => 50 + (v / ROPE_WIN) * 38;
  const leading = rope < 0 ? 0 : rope > 0 ? 1 : -1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-6 text-center">
        <TeamScore t={0} value={wins[0]} label="raund" lead={leading === 0} />
        <span className="font-mono text-2xl font-black text-white/50">:</span>
        <TeamScore t={1} value={wins[1]} label="raund" lead={leading === 1} />
      </div>
      <div className="relative h-[46vh] min-h-[260px] overflow-hidden rounded-3xl bg-gradient-to-b from-sky-900/60 via-emerald-900/40 to-amber-900/60 ring-1 ring-white/10">
        {/* Maydon: o'rtada loy chuquri, ikki chetda chegara chiziqlari */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-lime-800/60 to-lime-950/80" />
        <div className="absolute bottom-[12%] left-1/2 h-[18%] w-[22%] -translate-x-1/2 rounded-[50%] bg-amber-950/80 shadow-inner ring-2 ring-amber-900" />
        {[12, 88].map((x, i) => (
          <div key={x} className="absolute bottom-0 top-[30%] w-1.5 rounded" style={{ left: `${x}%`, background: TEAM_HEX[i] }} />
        ))}
        {/* Arqon va bayroqcha */}
        <div className="absolute left-[4%] right-[4%] top-[58%] h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-amber-700 via-amber-500 to-amber-700 shadow" />
        <div className="absolute top-[58%] -translate-x-1/2 -translate-y-[85%] text-4xl transition-[left] duration-[1600ms] ease-out" style={{ left: `${pct(shown)}%` }}>
          🚩
        </div>
        {/* Jamoalar: arqonning ikki uchida tortadi (bayroq bilan birga siljiydi) */}
        <div className="absolute bottom-[16%] flex justify-end transition-[left] duration-[1600ms] ease-out" style={{ left: `calc(${pct(shown)}% - 46%)`, width: "34%" }}>
          <Crew list={members(0).slice(0, 7)} size={72} win={leading === 0} flip />
        </div>
        <div className="absolute bottom-[16%] flex justify-start transition-[left] duration-[1600ms] ease-out" style={{ left: `calc(${pct(shown)}% + 12%)`, width: "34%" }}>
          <Crew list={members(1).slice(0, 7)} size={72} win={leading === 1} />
        </div>
        <p className="absolute inset-x-0 top-3 text-center text-sm font-black text-white/80">
          {Math.abs(rope) < 8 ? "Teng kuch!" : `${teamName(leading)} tortyapti · g'alabagacha ${ROPE_WIN - Math.abs(rope)}`}
        </p>
      </div>
    </div>
  );
}

function TeamScore({ t, value, label, lead }: { t: number; value: number; label: string; lead: boolean }) {
  return (
    <div className={cn("rounded-2xl px-5 py-2 ring-2 transition-transform", lead && "scale-110")} style={{ background: `${TEAM_HEX[t]}33`, borderColor: TEAM_HEX[t], boxShadow: lead ? `0 0 28px ${TEAM_HEX[t]}88` : undefined }}>
      <p className="text-xs font-black uppercase tracking-widest" style={{ color: TEAM_HEX[t] }}>
        {teamName(t)}
      </p>
      <p className="font-mono text-4xl font-black leading-none">{value}</p>
      <p className="text-[10px] font-bold text-white/60">{label}</p>
    </div>
  );
}

// ---------------- Qal'a qamali ----------------
function Castle({ t, hp, prev, crew }: { t: number; hp: number; prev: number; crew: LivePlayerRow[] }) {
  const arrived = useArrived();
  const shown = arrived ? hp : prev;
  const frac = Math.max(0, Math.min(1, shown / CASTLE_HP));
  const ruined = hp <= 0;
  const lost = Math.max(0, prev - hp);
  const healed = Math.max(0, hp - prev);
  const c = TEAM_HEX[t];
  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-center gap-1">
      <div className="flex h-7 items-end gap-1">
        {lost > 0 && <span className="live-pop rounded-full bg-rose-600 px-2 py-0.5 font-mono text-sm font-black">−{formatNumberUz(lost)}</span>}
        {healed > 0 && <span className="live-pop rounded-full bg-emerald-600 px-2 py-0.5 font-mono text-sm font-black">+{formatNumberUz(healed)}</span>}
      </div>
      {/* Devorda jamoa a'zolari */}
      <div className="relative z-10 -mb-6 flex justify-center">
        <Crew list={crew.slice(0, 5)} size={46} win={!ruined && healed > 0} />
      </div>
      <svg viewBox="0 0 120 100" className={cn("w-full max-w-[220px] drop-shadow-xl transition-[filter] duration-700", ruined && "grayscale")} aria-label={`${teamName(t)} qal'asi`}>
        <defs>
          <linearGradient id={`stone${t}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#a8a29e" />
            <stop offset="1" stopColor="#57534e" />
          </linearGradient>
        </defs>
        {ruined ? (
          <>
            <path d="M10 95 L18 70 L30 78 L42 62 L55 80 L70 66 L84 82 L100 70 L110 95 Z" fill={`url(#stone${t})`} />
            <text x="60" y="58" textAnchor="middle" fontSize="18">💥</text>
          </>
        ) : (
          <>
            <rect x="14" y="30" width="22" height="65" fill={`url(#stone${t})`} />
            <rect x="84" y="30" width="22" height="65" fill={`url(#stone${t})`} />
            <rect x="30" y="48" width="60" height="47" fill={`url(#stone${t})`} />
            {[14, 21, 28, 84, 91, 98].map((x) => (
              <rect key={x} x={x} y="24" width="5" height="7" fill="#78716c" />
            ))}
            <path d="M50 95 L50 74 Q60 64 70 74 L70 95 Z" fill="#292524" />
            <rect x="57" y="10" width="2" height="38" fill="#44403c" />
            <path d="M59 10 L80 16 L59 22 Z" fill={c} />
            {frac < 0.6 && <path d="M36 58 L42 66 L38 74 M88 44 L94 52 L90 60" stroke="#1c1917" strokeWidth="2" fill="none" />}
            {frac < 0.3 && <path d="M22 40 L28 50 L24 60 M76 56 L82 64" stroke="#1c1917" strokeWidth="2.5" fill="none" />}
          </>
        )}
      </svg>
      <div className="w-full max-w-[220px]">
        <div className="mb-0.5 flex items-center justify-between text-xs font-black">
          <span style={{ color: c }}>{teamName(t)}</span>
          <span className="font-mono">{ruined ? "vayron" : `${formatNumberUz(hp)} HP`}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-[1400ms] ease-out" style={{ width: `${frac * 100}%`, background: frac > 0.5 ? "#22c55e" : frac > 0.25 ? "#f59e0b" : "#ef4444" }} />
        </div>
      </div>
    </div>
  );
}

function SiegeBoard({ cells, teams, members }: { cells: number[]; teams: number; members: (t: number) => LivePlayerRow[] }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-indigo-950/70 via-slate-900/60 to-emerald-950/70 px-3 pb-4 pt-2 ring-1 ring-white/10">
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-b from-emerald-900/40 to-emerald-950/70" />
      <div className="relative flex items-end justify-around gap-3">
        {Array.from({ length: teams }, (_, t) => (
          <Castle key={t} t={t} hp={cells[t] ?? 0} prev={cells[4 + t] ?? cells[t] ?? 0} crew={members(t)} />
        ))}
      </div>
    </div>
  );
}

// ---------------- Penalti ----------------
function FootballBoard({ cells, members }: { cells: number[]; members: (t: number) => LivePlayerRow[] }) {
  const goals = [cells[0] ?? 0, cells[1] ?? 0];
  const now = [Math.max(0, goals[0] - (cells[2] ?? 0)), Math.max(0, goals[1] - (cells[3] ?? 0))];
  const lead = goals[0] > goals[1] ? 0 : goals[1] > goals[0] ? 1 : -1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-6">
        <TeamScore t={0} value={goals[0]} label="gol" lead={lead === 0} />
        <span className="font-mono text-2xl font-black text-white/50">:</span>
        <TeamScore t={1} value={goals[1]} label="gol" lead={lead === 1} />
      </div>
      <div className="relative grid grid-cols-2 gap-3 overflow-hidden rounded-3xl bg-[repeating-linear-gradient(90deg,#15803d_0_60px,#166534_60px_120px)] p-3 ring-1 ring-white/10">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white/50" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/40" />
        {[0, 1].map((t) => {
          const scorers = members(t).filter((p) => p.effect?.kind === "finish");
          const saved = members(1 - t).filter((p) => p.effect?.text?.includes("Darvozabon")).length;
          return (
            <div key={t} className="relative flex min-h-[38vh] flex-col items-center justify-between gap-2 rounded-2xl bg-black/15 p-3">
              <div className="flex w-full items-center justify-between text-sm font-black">
                <span style={{ color: TEAM_HEX[t] }}>{teamName(t)} zarbasi</span>
                <span className="rounded-full bg-black/40 px-2 py-0.5">{now[t] > 0 ? `+${now[t]} gol` : "gol yo'q"}</span>
              </div>
              {/* Darvoza va raqib darvozaboni */}
              <div className="relative h-24 w-full max-w-[300px] rounded-t-lg border-4 border-b-0 border-white bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.15)_0_6px,transparent_6px_12px)]">
                {Array.from({ length: now[t] }, (_, i) => (
                  <span key={i} className="live-pop absolute text-3xl" style={{ left: `${18 + i * 28}%`, top: "28%", animationDelay: `${0.4 + i * 0.35}s` }}>
                    ⚽
                  </span>
                ))}
                {members(1 - t)[0] && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                    <CharacterSvg look={members(1 - t)[0].look} size={54} mood={saved > 0 ? "jump" : "idle"} pedestal={false} />
                  </div>
                )}
                {saved > 0 && <span className="live-pop absolute -right-2 -top-3 rounded-full bg-sky-600 px-2 py-0.5 text-xs font-black">🧤 {saved}</span>}
              </div>
              <Crew list={(scorers.length ? scorers : members(t)).slice(0, 6)} size={58} win={scorers.length > 0} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Orol xazinasi ----------------
const COLS = 9;
/** Katak markazi (ilon shaklidagi yo'l: har qatorda yo'nalish almashadi), % da */
function cellPos(i: number): { x: number; y: number } {
  const k = Math.max(0, Math.min(ISLAND_LEN, i));
  const row = Math.floor(k / COLS);
  const col = k % COLS;
  const x = row % 2 === 0 ? col : COLS - 1 - col;
  // 37 katak (0…36) — 5 qator; oxirgi qatorda faqat 🏆 xazina
  const rows = Math.ceil((ISLAND_LEN + 1) / COLS);
  return { x: 6 + x * (88 / (COLS - 1)), y: 90 - row * (78 / (rows - 1)) };
}
const CELL_ICON: Record<string, string> = { palm: "🌴", croc: "🐊", chest: "💰", path: "" };

function IslandBoard({ cells, teams, members }: { cells: number[]; teams: number; members: (t: number) => LivePlayerRow[] }) {
  const arrived = useArrived();
  return (
    <div className="relative h-[56vh] min-h-[320px] overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_at_center,#fde68a_0%,#f59e0b_35%,#0e7490_60%,#083344_100%)] ring-1 ring-white/10">
      <div className="absolute inset-[4%] rounded-[45%] bg-gradient-to-b from-lime-500/50 to-emerald-700/60 blur-[1px]" />
      {/* Yo'l kataklari */}
      {ISLAND_BOARD.map((kind, i) => {
        const p = cellPos(i);
        const end = i === ISLAND_LEN;
        return (
          <div
            key={i}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl text-lg font-black shadow",
              end ? "h-14 w-14 bg-amber-300 text-3xl ring-4 ring-amber-100" : kind === "croc" ? "h-10 w-10 bg-rose-900/80" : kind === "palm" ? "h-10 w-10 bg-emerald-700/90" : kind === "chest" ? "h-10 w-10 bg-amber-600/90" : "h-9 w-9 bg-amber-100/70 text-[11px] text-amber-950"
            )}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {end ? "🏆" : CELL_ICON[kind] || (i === 0 ? "🚩" : i)}
          </div>
        );
      })}
      {/* Jamoalar: yetakchi personaj va jamoa bayrog'i, oldingi katakdan yangisiga yuradi */}
      {Array.from({ length: teams }, (_, t) => {
        const pos = cells[t] ?? 0;
        const prev = cells[8 + t] ?? pos;
        const p = cellPos(arrived ? pos : prev);
        // Eng yuqori qatorda (xazina) — belgi katak ostida, aks holda maydondan chiqib ketadi
        const top = p.y < 25;
        const crew = members(t);
        const leader = crew[0];
        const done = (cells[4 + t] ?? 0) > 0;
        return (
          <div
            key={t}
            className={cn("absolute z-10 flex -translate-x-1/2 flex-col items-center transition-[left,top] duration-[1800ms] ease-in-out", top ? "translate-y-[18%]" : "-translate-y-[95%]")}
            style={{ left: `calc(${p.x}% + ${(t - (teams - 1) / 2) * 22}px)`, top: `${p.y}%` }}
          >
            <span className="rounded-full px-2 text-[10px] font-black text-white shadow" style={{ background: TEAM_HEX[t] }}>
              {teamName(t)} {done ? `🏆 ${cells[4 + t]}-o'rin` : `${pos}/${ISLAND_LEN}`}
            </span>
            {leader ? <CharacterSvg look={leader.look} size={58} mood={pos > prev ? "run" : pos < prev ? "sad" : done ? "cheer" : "idle"} pedestal={false} /> : <span className="text-3xl">🚩</span>}
            <span className="-mt-1 text-[10px] font-bold text-white drop-shadow">+{Math.max(0, crew.length - 1)}</span>
          </div>
        );
      })}
    </div>
  );
}
