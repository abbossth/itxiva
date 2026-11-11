"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Gamepad2, Skull, Swords, Trophy } from "lucide-react";
import type { ArenaPeer, LiveArenaView, LivePlayerState } from "@/actions/live-game.actions";
import { ARENA_H, ARENA_W, WALLS, WAVES, arenaBonus } from "@/lib/live-game/arena-engine";
import { useCountdown } from "../live-ui";
import { ArenaGame, nameTag, type ArenaResult } from "./arena-game";
import { cn, formatNumberUz } from "@/lib/utils";

// Arena: proyektorda jonli jadval (kim o'ynayapti, nechta dron, kim tugatdi), o'quvchida o'yinning o'zi.

export function ArenaHost({ arena }: { arena: LiveArenaView }) {
  const starts = useCountdown(arena.startsInMs, arena.startsInMs > 0);
  const left = useCountdown(arena.remainingMs, !arena.ended && arena.startsInMs === 0);
  return (
    <div className="flex h-full flex-col gap-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="quiz-pulse flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600">
            <Swords className="h-7 w-7" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Final bosqich</p>
            <p className="text-3xl font-black sm:text-5xl">Kiber arena</p>
          </div>
        </div>
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
      <p className="text-sm text-slate-300 sm:text-base">
        Har kim o&apos;z qurilmasida dronlarga qarshi o&apos;ynaydi. To&apos;g&apos;ri javoblar — ko&apos;proq o&apos;q va zirh. {WAVES.length} to&apos;lqinni
        tugatganlarga katta bonus!
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-2xl ring-1 ring-fuchsia-400/30">
          <ArenaSpectator peers={arena.peers} />
          <span className="absolute left-3 top-3 rounded-xl bg-black/60 px-3 py-1.5 text-sm font-black text-emerald-300">Guruh jami: {arena.groupKills} dron</span>
        </div>
      <ol className="live-noscroll grid min-h-0 content-start gap-2 overflow-y-auto lg:w-[360px]">
        {arena.rows.map((r, i) => (
          <li key={r.id} className={cn("flex items-center gap-3 rounded-2xl px-4 py-3", r.finished ? "bg-emerald-500/20 ring-1 ring-emerald-400/50" : r.dead ? "bg-white/[0.04] text-white/50" : "bg-white/10")}>
            <span className="w-6 font-mono font-black text-slate-400">{i + 1}</span>
            {r.finished ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : r.dead ? <Skull className="h-5 w-5" /> : <Gamepad2 className="h-5 w-5 text-fuchsia-300" />}
            <span className="min-w-0 flex-1 truncate text-lg font-black">{r.name}</span>
            <span className="text-sm font-bold text-slate-300">
              {r.waves}/{WAVES.length} · {r.kills} dron
            </span>
            {arena.ended && <span className="live-pop w-20 text-right font-mono font-black text-emerald-300">+{formatNumberUz(r.points)}</span>}
          </li>
        ))}
      </ol>
      </div>
    </div>
  );
}

/** Proyektorda butun arena: hamma robotlar, ismlari va sog'lig'i jonli (so'rovlar orasida silliq harakat) */
function ArenaSpectator({ peers }: { peers: ArenaPeer[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(peers);
  useEffect(() => {
    latest.current = peers;
  }, [peers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const shown = new Map<string, { x: number; y: number; a: number }>();
    let raf = 0;
    let last = performance.now();
    const colors = ["#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#facc15", "#60a5fa", "#f87171", "#2dd4bf", "#e879f9", "#a3e635"];
    const colorFor = (id: string) => {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      return colors[h % colors.length];
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
      }
      const scale = Math.min(r.width / ARENA_W, r.height / ARENA_H);
      const ox = (r.width - ARENA_W * scale) / 2;
      const oy = (r.height - ARENA_H * scale) / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#070b18";
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      ctx.strokeStyle = "rgba(99,102,241,0.12)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= ARENA_W; gx += 50) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, ARENA_H);
        ctx.stroke();
      }
      for (let gy = 0; gy <= ARENA_H; gy += 50) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(ARENA_W, gy);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(168,85,247,0.8)";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);
      for (const w of WALLS) {
        ctx.fillStyle = "#111c33";
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = "rgba(56,189,248,0.85)";
        ctx.lineWidth = 3;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      }
      const k = Math.min(1, dt * 6);
      for (const p of latest.current) {
        const cur = shown.get(p.id) ?? { x: p.x, y: p.y, a: p.a };
        cur.x += (p.x - cur.x) * k;
        cur.y += (p.y - cur.y) * k;
        cur.a += Math.atan2(Math.sin(p.a - cur.a), Math.cos(p.a - cur.a)) * k;
        shown.set(p.id, cur);
        const color = colorFor(p.id);
        ctx.save();
        ctx.translate(cur.x, cur.y);
        ctx.globalAlpha = p.dead ? 0.35 : 1;
        ctx.rotate(cur.a);
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = p.dead ? "#475569" : color;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(15, -5, 16, 10);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(0, 0, 13, -0.6, 0.6);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
        nameTag(ctx, `${p.dead ? "💀 " : p.finished ? "🏆 " : ""}${p.name} · ${p.kills}`, cur.x, cur.y - 38, color, p.hp);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

type PlayerArena = NonNullable<LivePlayerState["arena"]>;

export function ArenaPlayer({ gameId, arena, myName }: { gameId: string; arena: PlayerArena; myName: string }) {
  const [result, setResult] = useState<ArenaResult | null>(null);
  const alreadyDone = arena.final || arena.ended;

  if (!result && !alreadyDone && arena.remainingMs > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ArenaGame gameId={gameId} myName={myName} loadout={{ ammo: arena.ammo, armor: arena.armor }} startsInMs={arena.startsInMs} remainingMs={arena.remainingMs} onDone={setResult} />
      </div>
    );
  }

  const r = result ?? { kills: arena.kills, waves: arena.waves, finished: arena.finished, dead: arena.dead };
  const expected = arenaBonus(r.kills, r.waves, r.finished);
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      {r.finished ? <Trophy className="h-16 w-16 text-amber-300" /> : r.dead ? <Skull className="h-16 w-16 text-rose-300" /> : <Swords className="h-16 w-16 text-fuchsia-300" />}
      <p className="text-3xl font-black lg:text-5xl">{r.finished ? "Arena zabt etildi!" : r.dead ? "Robotingiz yiqildi" : "Vaqt tugadi"}</p>
      <p className="font-mono text-lg text-slate-300 lg:text-2xl">
        {r.waves}/{WAVES.length} to&apos;lqin · {r.kills} dron
      </p>
      <p className="live-pop font-mono text-4xl font-black text-emerald-300 lg:text-6xl">+{formatNumberUz(arena.ended ? arena.points : expected)}</p>
      <p className="text-sm text-slate-400">{arena.ended ? "Bonus ochko qo'shildi" : "Boshqalar tugatishini kuting — g'oliblar tez orada"}</p>
    </div>
  );
}
