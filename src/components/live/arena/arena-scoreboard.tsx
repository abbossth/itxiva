"use client";

import { memo } from "react";
import { CharacterSvg } from "@/components/character/character-svg";
import type { GameLook } from "@/lib/character/catalog";
import { teamColor } from "@/lib/live-game/pvp";
import { TEAM_NAMES } from "@/lib/live-game/modes";
import { compareUz } from "@/lib/sort-uz";
import { cn } from "@/lib/utils";

// Kiber arena: statistika jadvali (kompyuterda Tab bosib turilganda, telefonda 📊 tugmasi bilan)

export interface BoardRow {
  id: string;
  name: string;
  kills: number;
  /** Yo'qotilgan jonlar */
  deaths: number;
  lives: number;
  maxLives: number;
  out: boolean;
  team: number;
  isMe: boolean;
  look: GameLook | null | undefined;
}

/** Jadval tartibi: ko'p kill, kam o'lim, tiriklar oldinda */
export const byScore = (a: BoardRow, b: BoardRow) => b.kills - a.kills || a.deaths - b.deaths || Number(a.out) - Number(b.out) || compareUz(a.name, b.name);

/** Personaj boshi: qator har yangilanganda qayta chizilmasin (ko'rinish o'zgarmaguncha) */
const BoardAvatar = memo(function BoardAvatar({ look, out }: { look: GameLook | null | undefined; out: boolean }) {
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10", out && "opacity-40 grayscale")}>
      {look !== undefined ? <CharacterSvg look={look} size={30} headOnly still /> : <span className="text-base">🤖</span>}
    </span>
  );
});

/** Statistika jadvali: kim nechta kill qildi, necha marta yiqildi, qancha jon qoldi */
/** Ustunlar: o'rin, o'yinchi, kill, o'lim, jon */
const COLS = { gridTemplateColumns: "1.75rem minmax(0,1fr) 3rem 3rem 4.5rem" };

export function Scoreboard({ rows, myTeam, left }: { rows: BoardRow[]; myTeam: number; left: number }) {
  const teamed = rows.some((r) => r.team >= 0);
  const groups = teamed
    ? [...new Set(rows.map((r) => r.team))]
        .sort((a, b) => a - b)
        .map((team) => {
          const members = rows.filter((r) => r.team === team);
          return { team, members, kills: members.reduce((n, r) => n + r.kills, 0), alive: members.filter((r) => !r.out).length };
        })
        .sort((a, b) => b.kills - a.kills || b.alive - a.alive)
    : [{ team: -1, members: rows, kills: 0, alive: rows.filter((r) => !r.out).length }];
  const best = rows.reduce((m, r) => Math.max(m, r.kills), 0);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-slate-950/45 px-2 pt-16 backdrop-blur-[2px] sm:items-center sm:pt-0">
      <div className="live-pop w-full max-w-xl overflow-hidden rounded-2xl bg-slate-900/90 text-white shadow-2xl ring-1 ring-white/15">
        <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-fuchsia-600/80 to-violet-700/80 px-4 py-2.5">
          <span className="text-base font-black">📊 Jang statistikasi</span>
          <span className="text-xs font-bold text-white/80">
            Tirik: {rows.filter((r) => !r.out).length}/{rows.length} · {left}s
          </span>
        </div>
        <div className="grid items-center gap-x-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/50" style={COLS}>
          <span>#</span>
          <span>O&apos;yinchi</span>
          <span className="text-center">💥 Kill</span>
          <span className="text-center">💀 O&apos;lim</span>
          <span className="text-center">❤️ Jon</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto pb-2">
          {groups.map((g) => (
            <div key={g.team}>
              {teamed && (
                <div
                  className="mx-2 mt-1 flex items-center justify-between rounded-lg px-2 py-1 text-xs font-black"
                  style={{ background: `${teamColor(g.team)}33`, color: teamColor(g.team) ?? undefined }}
                >
                  <span>
                    {g.team === myTeam ? "🤝 " : ""}
                    {TEAM_NAMES[g.team] ?? `${g.team + 1}-jamoa`}
                  </span>
                  <span>
                    💥 {g.kills} · tirik {g.alive}/{g.members.length}
                  </span>
                </div>
              )}
              {g.members.map((r, i) => (
                <div
                  key={r.id}
                  style={COLS}
                  className={cn(
                    "mx-2 grid items-center gap-x-2 rounded-lg px-1 py-1 text-sm",
                    r.isMe ? "bg-amber-400/20 ring-1 ring-amber-300/60" : i % 2 ? "bg-white/[0.03]" : ""
                  )}
                >
                  <span className={cn("text-center font-mono font-black", i === 0 ? "text-amber-300" : "text-white/60")}>{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <BoardAvatar look={r.look} out={r.out} />
                    <span className={cn("truncate font-bold", r.out && "text-white/45 line-through decoration-white/30")}>
                      {r.name}
                      {r.isMe && <span className="ml-1 text-[10px] font-black text-amber-300">(siz)</span>}
                    </span>
                    {best > 0 && r.kills === best && <span title="Eng ko'p kill">👑</span>}
                  </span>
                  <span className="text-center font-mono text-base font-black text-amber-300">{r.kills}</span>
                  <span className="text-center font-mono font-bold text-rose-300">{r.deaths}</span>
                  <span className="text-center text-xs">
                    {r.out ? (
                      <span className="font-black text-white/45">💀 chiqdi</span>
                    ) : (
                      <span className="tracking-tighter text-rose-400">{"♥".repeat(Math.max(0, r.lives))}<span style={{ color: "rgba(255,255,255,0.18)" }}>{"♥".repeat(Math.max(0, r.maxLives - r.lives))}</span></span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
