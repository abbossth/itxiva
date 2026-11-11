"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, Skull, Swords, Trophy, Users } from "lucide-react";
import type { LiveArenaView, LivePlayerState } from "@/actions/live-game.actions";
import type { PvpFeedView, PvpWorld } from "@/lib/live-game/pvp-server";
import { BULLET_RANGE, BULLET_SPEED, MAP_H, MAP_W, PLAYER_R, POWERS, inBush, skinOf, stepShots, type Shot } from "@/lib/live-game/pvp";
import { playBoom } from "@/lib/sound";
import { useCountdown } from "../live-ui";
import { PvpGame, pvpFetch } from "./pvp-game";
import {
  burst,
  colorFor,
  drawFloor,
  drawPickup,
  drawRobot,
  drawShot,
  drawTop,
  makeMapLayers,
  drawSparks,
  nameTag,
  spawnForeignShots,
  stepSparks,
  type Spark,
} from "./pvp-draw";
import { cn, formatNumberUz } from "@/lib/utils";

// Proyektor: butun jang maydoni jonli — kim qayerda, kim kimga otyapti, kim nima oldi, kim chiqdi.
// O'quvchi: o'yinning o'zi, tugagach — o'rni va bonus.

const WATCH_MS = 250;

export function ArenaHost({ gameId, arena, sound = true }: { gameId: string; arena: LiveArenaView; sound?: boolean }) {
  const starts = useCountdown(arena.startsInMs, arena.startsInMs > 0);
  const left = useCountdown(arena.remainingMs, !arena.ended && arena.startsInMs === 0);
  const [world, setWorld] = useState<PvpWorld | null>(null);
  const [shout, setShout] = useState<PvpFeedView | null>(null);
  const worldRef = useRef<PvpWorld | null>(null);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Tez so'rovlar: butun maydon
  useEffect(() => {
    let alive = true;
    let busy = false;
    const seen = new Set<string>();
    let first = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (!busy) {
        busy = true;
        try {
          const r = await pvpFetch<PvpWorld | null>(`/api/live/pvp?gameId=${gameId}`);
          if (alive && r.success && r.data) {
            worldRef.current = r.data;
            setWorld(r.data);
            for (const f of [...r.data.feed].reverse()) {
              if (seen.has(f.key)) continue;
              seen.add(f.key);
              if (!first && f.kind === "kill" && f.ago < 3000) {
                setShout(f);
                if (soundRef.current) playBoom();
              }
            }
            first = false;
          }
        } catch {
          // keyingi so'rovda
        } finally {
          busy = false;
        }
      }
      if (alive) timer = setTimeout(poll, WATCH_MS);
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [gameId]);

  useEffect(() => {
    if (!shout) return;
    const t = setTimeout(() => setShout(null), 2200);
    return () => clearTimeout(t);
  }, [shout]);

  const rows = arena.rows;
  const liveRows = world
    ? rows.map((r) => {
        const p = world.peers.find((x) => x.id === r.id);
        return p ? { ...r, lives: p.lives, maxLives: p.maxLives, out: p.out, kills: p.kills } : r;
      })
    : rows;
  const winner = arena.ended ? rows.find((r) => r.place === 1) : null;
  const alive = world?.alive ?? arena.alive;

  return (
    <div className="flex h-full flex-col gap-3 py-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="quiz-pulse flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-rose-600 sm:h-14 sm:w-14">
            <Swords className="h-7 w-7" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Final · hamma hammaga qarshi</p>
            <p className="text-3xl font-black sm:text-5xl">Kiber jang</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-xl font-black sm:text-2xl">
            <Users className="h-6 w-6 text-emerald-300" /> {alive}/{rows.length} tirik
          </span>
          {starts > 0 ? (
            <span key={Math.ceil(starts / 1000)} className="quiz-count font-mono text-6xl font-black">
              {Math.ceil(starts / 1000)}
            </span>
          ) : arena.ended ? (
            <span className="live-pop rounded-full bg-emerald-500 px-4 py-2 text-lg font-black">Tugadi!</span>
          ) : (
            <span className={cn("font-mono text-5xl font-black tabular-nums sm:text-7xl", left <= 10_000 && "text-rose-400 quiz-shake")}>{Math.ceil(left / 1000)}</span>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-2xl ring-1 ring-fuchsia-400/30">
          <ArenaSpectator worldRef={worldRef} />
          {shout && (
            <div key={shout.key} className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
              <span className="live-banner rounded-2xl bg-amber-500 px-6 py-3 text-3xl font-black text-white shadow-2xl sm:text-4xl">
                {shout.a} 💥 {shout.b}
              </span>
            </div>
          )}
          {winner && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-center">
              <Crown className="h-16 w-16 text-amber-300" />
              <p className="text-xl font-black uppercase tracking-[0.3em] text-amber-200">Jang g&apos;olibi</p>
              <p className="live-pop text-5xl font-black sm:text-7xl">{winner.name}</p>
            </div>
          )}
          {starts > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <span className="rounded-2xl bg-black/60 px-5 py-2 text-lg font-bold">Hamma o&apos;z telefonida/kompyuterida o&apos;ynaydi. 3 o&apos;q — o&apos;yindan chiqish!</span>
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-3 lg:w-[380px]">
          <ol className="live-noscroll grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto">
            {liveRows.map((r, i) => (
              <li
                key={r.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl px-3 py-2 transition-all",
                  r.out ? "bg-white/[0.04] text-white/45" : i === 0 && !arena.ended ? "bg-amber-500/15 ring-1 ring-amber-400/40" : "bg-white/10"
                )}
              >
                <span className="w-6 font-mono font-black text-slate-400">{arena.ended ? r.place : i + 1}</span>
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: skinOf(r.skin).body }} />
                <span className="min-w-0 flex-1 truncate text-lg font-black">{r.name}</span>
                {r.out ? (
                  <span className="truncate text-xs font-bold text-rose-300/80">
                    <Skull className="mr-0.5 inline h-3.5 w-3.5" />
                    {r.killedBy ?? ""}
                  </span>
                ) : (
                  <span className="text-sm tracking-tighter text-rose-500">{"❤".repeat(Math.max(0, r.lives))}</span>
                )}
                <span className="w-10 text-right text-sm font-black text-amber-300">💥{r.kills}</span>
                {arena.ended && <span className="live-pop w-16 text-right font-mono text-sm font-black text-emerald-300">+{formatNumberUz(r.points)}</span>}
              </li>
            ))}
          </ol>
          <div className="hidden min-h-[120px] flex-col gap-1 rounded-2xl bg-black/30 p-3 lg:flex">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Jang lentasi</p>
            {(world?.feed ?? []).slice(0, 5).map((f) => (
              <p key={f.key} className="live-pop truncate text-sm font-bold">
                {f.kind === "kill" ? (
                  <>
                    <span className="text-amber-300">{f.a}</span> 💥 <span className="text-rose-300">{f.b}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sky-300">{f.a}</span> {f.power ? `${POWERS[f.power].icon} ${POWERS[f.power].label} oldi` : ""}
                  </>
                )}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Butun maydon: hamma o'yinchilar, o'qlar va sovg'alar (so'rovlar orasida silliq harakat) */
function ArenaSpectator({ worldRef }: { worldRef: React.RefObject<PvpWorld | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const layers = makeMapLayers();
    const shown = new Map<string, { x: number; y: number; a: number; moving: boolean }>();
    const shots: Shot[] = [];
    const seenShots = new Map<string, number>();
    const sparks: Spark[] = [];
    const outSeen = new Set<string>();
    let lastWorld: PvpWorld | null = null;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const world = worldRef.current;
      if (world && world !== lastWorld) {
        lastWorld = world;
        spawnForeignShots(shots, seenShots, world.peers, now, BULLET_SPEED, BULLET_RANGE);
        for (const p of world.peers) {
          if (p.out && !outSeen.has(p.id)) {
            outSeen.add(p.id);
            const s = shown.get(p.id) ?? p;
            burst(sparks, s.x, s.y, skinOf(p.skin).body, 40);
          }
        }
      }
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
      }
      const scale = Math.min(r.width / MAP_W, r.height / MAP_H);
      const ox = (r.width - MAP_W * scale) / 2;
      const oy = (r.height - MAP_H * scale) / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#070b18";
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      // Kichik ekranda ham ismlar va qahramonlar o'qiladigan bo'lsin
      const big = Math.min(2.2, Math.max(1, 0.55 / scale));
      drawFloor(ctx, t, layers);
      for (const p of world?.pickups ?? []) drawPickup(ctx, p, t);
      const k = Math.min(1, dt * 9);
      const peers = world?.peers ?? [];
      for (const p of peers) {
        const s = shown.get(p.id) ?? { x: p.x, y: p.y, a: p.a, moving: false };
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        s.moving = Math.hypot(dx, dy) > 4;
        if (Math.hypot(dx, dy) > 400) {
          s.x = p.x;
          s.y = p.y;
        } else {
          s.x += dx * k;
          s.y += dy * k;
        }
        s.a += Math.atan2(Math.sin(p.a - s.a), Math.cos(p.a - s.a)) * k;
        shown.set(p.id, s);
        drawRobot(ctx, { x: s.x, y: s.y, a: s.a, skin: p.skin, shield: p.shield, powers: p.powers, out: p.out, moving: s.moving, ghost: inBush(s.x, s.y), size: big }, t);
      }
      const targets = peers.filter((p) => !p.out).map((p) => ({ id: p.id, ...(shown.get(p.id) ?? p) }));
      const step = stepShots(shots, dt, targets);
      shots.length = 0;
      shots.push(...step.shots);
      for (const h of step.hits) burst(sparks, h.x, h.y, colorFor(h.owner), 8);
      for (const s of shots) drawShot(ctx, s, colorFor(s.owner));
      stepSparks(sparks, dt);
      drawSparks(ctx, sparks);
      drawTop(ctx, t, layers);
      for (const p of peers) {
        const s = shown.get(p.id) ?? p;
        nameTag(ctx, `${p.out ? "💀 " : ""}${p.name} · ${p.kills}`, s.x, s.y - PLAYER_R * big - 14, colorFor(p.id), p.lives, p.maxLives, big);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [worldRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

type PlayerArena = NonNullable<LivePlayerState["arena"]>;

export function ArenaPlayer({ gameId, arena, myName }: { gameId: string; arena: PlayerArena; myName: string }) {
  if (!arena.ended && arena.remainingMs > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PvpGame
          gameId={gameId}
          myName={myName}
          init={{ lives: arena.lives, maxLives: arena.maxLives, skin: arena.skin, weapon: arena.weapon }}
          startsInMs={arena.startsInMs}
          remainingMs={arena.remainingMs}
        />
      </div>
    );
  }
  const won = arena.ended && arena.place === 1;
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      {won ? <Trophy className="h-16 w-16 text-amber-300" /> : arena.out ? <Skull className="h-16 w-16 text-rose-300" /> : <Swords className="h-16 w-16 text-fuchsia-300" />}
      <p className="text-3xl font-black lg:text-5xl">{!arena.ended ? "Jang tugadi" : won ? "Siz jang g'olibisiz!" : `${arena.place}-o'rin`}</p>
      <p className="font-mono text-lg text-slate-300 lg:text-2xl">
        💥 {arena.kills} yiqitdi{arena.out && arena.killedBy ? ` · ${arena.killedBy} yiqitdi` : !arena.out ? " · tirik qoldi" : ""}
      </p>
      {arena.ended ? (
        <>
          <p className="live-pop font-mono text-4xl font-black text-emerald-300 lg:text-6xl">+{formatNumberUz(arena.points)}</p>
          <p className="text-sm text-slate-400">Bonus ochko qo&apos;shildi</p>
        </>
      ) : (
        <p className="text-sm text-slate-400">Natijalar hisoblanmoqda…</p>
      )}
    </div>
  );
}
