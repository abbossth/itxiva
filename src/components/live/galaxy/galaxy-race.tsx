"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Gem, Rocket, Zap } from "lucide-react";
import type { LivePlayerState } from "@/actions/live-game.actions";
import { SHIP_COLORS, type GalaxyPeer } from "@/lib/live-game/galaxy";
import { haptic } from "@/lib/haptics";
import { playBoom, playCheckInSound, playCorrectSound, playWhoosh } from "@/lib/sound";
import { cn, formatNumberUz } from "@/lib/utils";
import type { GalaxyEngine, GalaxyHud } from "./galaxy-engine";

// "Galaktika poygasi 3D": o'quvchi ekrani. 3D sahna `GalaxyEngine` da (three.js dinamik yuklanadi),
// bu yerda — boshqaruv (klaviatura va sensor tugmalar), HUD va server bilan almashuv.

type PlayerGalaxy = NonNullable<LivePlayerState["galaxy"]>;

export function GalaxyPlayer({ gameId, g }: { gameId: string; g: PlayerGalaxy }) {
  if (!g.joined) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <Rocket className="h-12 w-12 text-violet-300" />
        <p className="text-2xl font-black">Kosmik poyga ketmoqda</p>
        <p className="text-slate-300">Keyingi poygada siz ham uchasiz!</p>
      </div>
    );
  }
  if (g.ended) return <GalaxyResult g={g} />;
  return <GalaxyRace key={g.round} gameId={gameId} g={g} />;
}

function GalaxyResult({ g }: { g: PlayerGalaxy }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.35em] text-violet-300">{g.final ? "Final poyga" : "Kosmik poyga"} tugadi</p>
      <p className="live-pop text-5xl font-black">{g.place > 0 ? `${g.place}-o'rin` : "—"}</p>
      {g.points > 0 && <p className="live-pop font-mono text-4xl font-black text-emerald-300">+{formatNumberUz(g.points)}</p>}
      <ol className="w-full max-w-md space-y-1.5 text-left">
        {g.top.map((r, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">
            <span className="w-6 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="font-mono text-slate-300">{formatNumberUz(r.d)} m</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const EMPTY_HUD: GalaxyHud = {
  d: 0,
  speed: 0,
  orbs: 0,
  turbo: 0,
  place: 1,
  total: 1,
  countdown: 1,
  remaining: 1,
  stunned: false,
  boosting: false,
  finished: false,
  flash: null,
};

function GalaxyRace({ gameId, g }: { gameId: string; g: PlayerGalaxy }) {
  const box = useRef<HTMLDivElement>(null);
  const engine = useRef<GalaxyEngine | null>(null);
  const [hud, setHud] = useState<GalaxyHud>({ ...EMPTY_HUD, turbo: g.turbo });
  const [failed, setFailed] = useState(false);
  const keys = useRef({ left: false, right: false, touchL: false, touchR: false });
  const sending = useRef(false);
  // Vaqt hisobi: server aytgan qolgan ms — sahifa ochilgan paytdan
  const timing = useRef({ startsInMs: g.startsInMs, remainingMs: g.remainingMs });

  const send = useCallback(
    (state: { d: number; x: number; orbs: number }) => {
      if (sending.current) return;
      sending.current = true;
      void fetch("/api/live/galaxy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, round: g.round, ...state }),
        keepalive: true,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((res: { success: boolean; data?: { peers: GalaxyPeer[]; place: number; total: number } } | null) => {
          if (res?.success && res.data) engine.current?.setPeers(res.data.peers, res.data.place, res.data.total);
        })
        .catch(() => {})
        .finally(() => {
          sending.current = false;
        });
    },
    [gameId, g.round]
  );

  useEffect(() => {
    let cancelled = false;
    const container = box.current;
    if (!container) return;
    const now = performance.now();
    // Server: boshlanishigacha va tugashigacha qolgan vaqt (ikkalasi ham hozirdan)
    const startAt = now + timing.current.startsInMs;
    const endAt = now + timing.current.remainingMs;
    import("three")
      .then(async (THREE) => {
        if (cancelled) return;
        const { GalaxyEngine } = await import("./galaxy-engine");
        if (cancelled) return;
        try {
          engine.current = new GalaxyEngine(THREE, container, {
            seed: g.seed,
            ship: g.ship,
            turbo: g.turbo,
            startAt,
            endAt,
            onHud: setHud,
            onSend: send,
            onEvent: (kind) => {
              if (kind === "hit") {
                playBoom();
                haptic([80, 40, 80]);
              } else if (kind === "orb") {
                playCheckInSound(1);
                haptic([8]);
              } else if (kind === "ring") {
                playCorrectSound();
                haptic([20, 20, 20]);
              } else {
                playWhoosh(0.6);
                haptic([30]);
              }
            },
          });
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [g.seed, g.ship, g.turbo, send]);

  // Klaviatura: ←/→ yoki A/D — burilish, Space / ↑ — turbo
  useEffect(() => {
    const apply = () => {
      const k = keys.current;
      engine.current?.setInput(k.left || k.touchL, k.right || k.touchR);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.current.left = true;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.current.right = true;
      else if ((e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") && !e.repeat) engine.current?.useTurbo();
      else return;
      e.preventDefault();
      apply();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.current.left = false;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.current.right = false;
      else return;
      apply();
    };
    const blur = () => {
      keys.current = { left: false, right: false, touchL: false, touchR: false };
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const touch = (side: "touchL" | "touchR", on: boolean) => {
    keys.current[side] = on;
    const k = keys.current;
    engine.current?.setInput(k.left || k.touchL, k.right || k.touchR);
  };

  if (failed) {
    return (
      <div className="py-14 text-center">
        <p className="text-xl font-black">3D poyga bu qurilmada ochilmadi</p>
        <p className="mt-2 text-sm text-slate-300">Brauzerni yangilang yoki kompyuterdan kiring (WebGL kerak).</p>
      </div>
    );
  }

  const color = SHIP_COLORS[g.ship % SHIP_COLORS.length];
  const secs = Math.ceil(hud.remaining / 1000);
  return (
    <div className="relative h-[calc(100dvh-9rem)] min-h-[420px] w-full select-none overflow-hidden rounded-3xl bg-[#04021a] ring-1 ring-violet-500/30 touch-none">
      <div ref={box} className="absolute inset-0" />

      {/* Urilish / kristall / halqa chaqnashi */}
      {hud.flash && (
        <div
          key={hud.flash.at}
          className={cn(
            "live-flash pointer-events-none absolute inset-0",
            hud.flash.kind === "hit" ? "bg-rose-600/40" : hud.flash.kind === "orb" ? "bg-cyan-400/15" : "bg-amber-300/25"
          )}
        />
      )}

      {/* Yuqori panel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="rounded-2xl bg-slate-950/60 px-3 py-2 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">O&apos;rin</p>
          <p className="font-mono text-2xl font-black leading-none">
            {hud.place}
            <span className="text-sm text-slate-400">/{hud.total}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-slate-950/60 px-4 py-2 text-center backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">{g.final ? "Final" : "Vaqt"}</p>
          <p className={cn("font-mono text-2xl font-black leading-none", secs <= 5 && hud.countdown <= 0 && "text-rose-400")}>{hud.countdown > 0 ? "—" : secs}</p>
        </div>
        <div className="rounded-2xl bg-slate-950/60 px-3 py-2 text-right backdrop-blur">
          <p className="font-mono text-xl font-black leading-none">{formatNumberUz(Math.round(hud.d))} m</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-sm font-bold text-cyan-300">
            <Gem className="h-3.5 w-3.5" /> {hud.orbs}
          </p>
        </div>
      </div>

      {/* Tezlik o'lchagich */}
      <div className="pointer-events-none absolute left-3 top-20 rounded-2xl bg-slate-950/60 px-3 py-2 backdrop-blur">
        <p className="font-mono text-2xl font-black leading-none" style={{ color }}>
          {Math.round(hud.speed * 3.6)}
        </p>
        <p className="text-[10px] font-bold text-slate-400">km/soat</p>
      </div>

      {/* Sanoq */}
      {hud.countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/30">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-violet-200">{g.final ? "Final poyga" : "Kosmik poyga"}</p>
          <span key={Math.ceil(hud.countdown / 1000)} className="quiz-count font-mono text-8xl font-black">
            {Math.ceil(hud.countdown / 1000)}
          </span>
          <p className="max-w-xs text-center text-sm font-semibold text-slate-200">
            ← → yoki A/D — burilish · Space — turbo. Asteroidlardan qoching, 💎 yig&apos;ing, 🟡 halqadan o&apos;ting!
          </p>
        </div>
      )}
      {hud.finished && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/40">
          <p className="live-pop rounded-3xl bg-gradient-to-r from-violet-500 to-cyan-400 px-8 py-4 text-4xl font-black">🏁 Marra! {hud.place}-o&apos;rin</p>
        </div>
      )}
      {hud.stunned && <p className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 text-2xl font-black text-rose-300">💥 Asteroid!</p>}

      {/* Sensor boshqaruv: chap va o'ng yarmini bosib turish */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <button
          type="button"
          aria-label="Chapga"
          onPointerDown={(e) => {
            e.preventDefault();
            touch("touchL", true);
          }}
          onPointerUp={() => touch("touchL", false)}
          onPointerLeave={() => touch("touchL", false)}
          onPointerCancel={() => touch("touchL", false)}
          className="flex h-16 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur active:bg-white/30 sm:h-14"
        >
          <ChevronLeft className="h-9 w-9" />
        </button>
        <button
          type="button"
          aria-label="Turbo"
          disabled={hud.turbo <= 0 || hud.countdown > 0}
          onPointerDown={(e) => {
            e.preventDefault();
            engine.current?.useTurbo();
          }}
          className={cn(
            "flex h-16 min-w-28 items-center justify-center gap-1.5 rounded-2xl px-4 text-lg font-black backdrop-blur transition disabled:opacity-40 sm:h-14",
            hud.boosting ? "bg-cyan-400 text-slate-950" : "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950"
          )}
        >
          <Zap className="h-5 w-5" /> TURBO ×{hud.turbo}
        </button>
        <button
          type="button"
          aria-label="O'ngga"
          onPointerDown={(e) => {
            e.preventDefault();
            touch("touchR", true);
          }}
          onPointerUp={() => touch("touchR", false)}
          onPointerLeave={() => touch("touchR", false)}
          onPointerCancel={() => touch("touchR", false)}
          className="flex h-16 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur active:bg-white/30 sm:h-14"
        >
          <ChevronRight className="h-9 w-9" />
        </button>
      </div>
    </div>
  );
}
