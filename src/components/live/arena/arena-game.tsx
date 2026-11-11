"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Heart, Shield, Skull, Trophy, Zap } from "lucide-react";
import { reportArenaAction } from "@/actions/live-game.actions";
import {
  ARENA_H,
  ARENA_W,
  DRONE,
  WALLS,
  WAVES,
  createArena,
  stepArena,
  type ArenaInput,
  type ArenaState,
} from "@/lib/live-game/arena-engine";
import { playBoom, playHurt, playShot, unlockSound } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

// "Kiber arena" — canvas'da chiziladi. Kompyuter: WASD/strelkalar + sichqoncha bilan nishon va otish.
// Telefon/planshet: chap tomonda joystik, o'ng tomonni bosib turish — otish (eng yaqin dronga avtomatik nishon).

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Hud {
  hp: number;
  armor: number;
  ammo: number;
  wave: number;
  kills: number;
  left: number;
  group: number;
  peers: number;
}

export interface ArenaResult {
  kills: number;
  waves: number;
  finished: boolean;
  dead: boolean;
}

export function ArenaGame({
  gameId,
  loadout,
  startsInMs,
  remainingMs,
  sound = true,
  myName,
  onDone,
}: {
  gameId: string;
  /** O'z roboti tepasidagi ism */
  myName: string;
  loadout: { ammo: number; armor: number };
  startsInMs: number;
  remainingMs: number;
  sound?: boolean;
  onDone: (r: ArenaResult) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({ hp: 100, armor: loadout.armor, ammo: loadout.ammo, wave: 1, kills: 0, left: Math.ceil(remainingMs / 1000), group: 0, peers: 0 });
  const [phase, setPhase] = useState<"intro" | "play" | "done">(startsInMs > 0 ? "intro" : "play");
  const [intro, setIntro] = useState(Math.ceil(startsInMs / 1000));
  const [banner, setBanner] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);

  // Vaqtlar bir marta (mount paytida) mutlaq qilib olinadi
  const timing = useRef<{ start: number; end: number } | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const now = performance.now();
    timing.current = { start: now + startsInMs, end: now + startsInMs + remainingMs };
    // Faqat birinchi qiymatlar — keyingi so'rovlar o'yinni qaytadan boshlamasin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: ArenaState = createArena(loadout, Math.floor(Math.random() * 1e9));
    const particles: Particle[] = [];
    // Boshqa ishtirokchilar: server bergan joylashuvga silliq yetib boriladi
    const peers = new Map<string, { name: string; x: number; y: number; a: number; tx: number; ty: number; ta: number; hp: number; dead: boolean; color: string }>();
    let groupKills = 0;
    let reporting = false;
    const input: ArenaInput = { mx: 0, my: 0, aimX: null, aimY: null, fire: false };
    const keys = new Set<string>();
    let mouseFire = false;
    let touchFire = false;
    let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
    let fireId: number | null = null;
    let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    let lastReport = 0;
    let lastShotSound = 0;
    let finished = false;
    let prevWave = 0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      const scale = Math.min(r.width / ARENA_W, r.height / ARENA_H);
      view = { scale, ox: (r.width - ARENA_W * scale) / 2, oy: (r.height - ARENA_H * scale) / 2, w: r.width, h: r.height, dpr };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toWorld = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left - view.ox) / view.scale, y: (cy - r.top - view.oy) / view.scale };
    };

    const report = (final: boolean) => {
      const res: ArenaResult = { kills: state.kills, waves: state.wavesCleared, finished: state.won, dead: state.dead };
      if (reporting && !final) return res;
      reporting = true;
      const p = state.player;
      void reportArenaAction(gameId, { ...res, x: Math.round(p.x), y: Math.round(p.y), a: Number(p.angle.toFixed(2)), hp: Math.round(p.hp) }, final)
        .then((r) => {
          if (!r.success) return;
          groupKills = r.data.groupKills;
          const seen = new Set<string>();
          for (const o of r.data.peers) {
            if (o.isMe) continue;
            seen.add(o.id);
            const cur = peers.get(o.id);
            if (cur) Object.assign(cur, { tx: o.x, ty: o.y, ta: o.a, hp: o.hp, dead: o.dead, name: o.name });
            else peers.set(o.id, { name: o.name, x: o.x, y: o.y, a: o.a, tx: o.x, ty: o.y, ta: o.a, hp: o.hp, dead: o.dead, color: colorFor(o.id) });
          }
          for (const id of [...peers.keys()]) if (!seen.has(id)) peers.delete(id);
        })
        .catch(() => {})
        .finally(() => {
          reporting = false;
        });
      return res;
    };

    // Klaviatura
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
        if (down) keys.add(k);
        else keys.delete(k);
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // Sichqoncha va barmoq
    const onDown = (e: PointerEvent) => {
      unlockSound();
      if (e.pointerType === "mouse") {
        const w = toWorld(e.clientX, e.clientY);
        input.aimX = w.x;
        input.aimY = w.y;
        mouseFire = true;
        return;
      }
      setTouch(true);
      const r = canvas.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 2 && !stick) stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      else {
        fireId = e.pointerId;
        touchFire = true;
      }
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        const w = toWorld(e.clientX, e.clientY);
        input.aimX = w.x;
        input.aimY = w.y;
        return;
      }
      if (stick && e.pointerId === stick.id) {
        stick.x = e.clientX;
        stick.y = e.clientY;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        mouseFire = false;
        return;
      }
      if (stick && e.pointerId === stick.id) stick = null;
      if (e.pointerId === fireId) {
        fireId = null;
        touchFire = false;
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    const burst = (x: number, y: number, color: string, n = 14) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 80 + Math.random() * 260;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, color });
      }
    };

    const draw = () => {
      const { scale, ox, oy, w, h, dpr } = view;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fon butun maydonga (chetlarda bo'sh joy ko'rinmaydi)
      ctx.fillStyle = "#070b18";
      ctx.fillRect(0, 0, w, h);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      // Panjara
      ctx.strokeStyle = "rgba(99,102,241,0.12)";
      ctx.lineWidth = 1;
      for (let gx = -400; gx <= ARENA_W + 400; gx += 50) {
        ctx.beginPath();
        ctx.moveTo(gx, -400);
        ctx.lineTo(gx, ARENA_H + 400);
        ctx.stroke();
      }
      for (let gy = -400; gy <= ARENA_H + 400; gy += 50) {
        ctx.beginPath();
        ctx.moveTo(-400, gy);
        ctx.lineTo(ARENA_W + 400, gy);
        ctx.stroke();
      }
      // Arena chegarasi
      ctx.shadowColor = "#a855f7";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(168,85,247,0.8)";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);
      // Devorlar
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 14;
      for (const wl of WALLS) {
        ctx.fillStyle = "#111c33";
        ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
        ctx.strokeStyle = "rgba(56,189,248,0.85)";
        ctx.lineWidth = 3;
        ctx.strokeRect(wl.x, wl.y, wl.w, wl.h);
      }
      ctx.shadowBlur = 0;
      // Qutilar
      for (const k of state.pickups) {
        const pulse = 1 + Math.sin(state.t * 8) * 0.08;
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.scale(pulse, pulse);
        ctx.shadowColor = k.kind === "ammo" ? "#facc15" : "#4ade80";
        ctx.shadowBlur = 16;
        ctx.fillStyle = k.kind === "ammo" ? "#facc15" : "#22c55e";
        if (k.kind === "ammo") {
          ctx.fillRect(-12, -12, 24, 24);
          ctx.fillStyle = "#422006";
          ctx.fillRect(-6, -8, 4, 16);
          ctx.fillRect(2, -8, 4, 16);
        } else {
          ctx.fillRect(-4, -13, 8, 26);
          ctx.fillRect(-13, -4, 26, 8);
        }
        ctx.restore();
      }
      // Dronlar
      for (const d of state.drones) {
        const def = DRONE[d.kind];
        const sides = d.kind === "scout" ? 3 : d.kind === "grunt" ? 6 : 8;
        const ang = Math.atan2(state.player.y - d.y, state.player.x - d.x);
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(ang);
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = d.flash > 0 ? "#ffffff" : def.color;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * def.r, Math.sin(a) * def.r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0b1020";
        ctx.beginPath();
        ctx.arc(def.r * 0.25, 0, def.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f87171";
        ctx.beginPath();
        ctx.arc(def.r * 0.32, 0, def.r * 0.14, 0, Math.PI * 2);
        ctx.fill();
        if (d.kind === "tank") {
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, def.r + 5, -1, 1);
          ctx.stroke();
        }
        ctx.restore();
      }
      // O'qlar
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 12;
      for (const b of state.bullets) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // Zarrachalar
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
      // Boshqa ishtirokchilar (sheriklar): o'z rangida, tepasida ismi
      for (const o of peers.values()) {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.globalAlpha = o.dead ? 0.35 : 0.9;
        ctx.rotate(o.a);
        ctx.shadowColor = o.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = o.dead ? "#475569" : o.color;
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(13, -4, 14, 8);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(0, 0, 11, -0.6, 0.6);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        nameTag(ctx, o.dead ? `💀 ${o.name}` : o.name, o.x, o.y - 34, o.color, o.hp);
      }
      ctx.globalAlpha = 1;

      // O'yinchi: visorli robot
      const pl = state.player;
      ctx.save();
      ctx.translate(pl.x, pl.y);
      if (pl.armor > 0) {
        ctx.strokeStyle = `rgba(56,189,248,${0.35 + Math.min(pl.armor, 150) / 300})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, pl.r + 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(pl.angle);
      ctx.shadowColor = "#e2e8f0";
      ctx.shadowBlur = 16;
      ctx.fillStyle = pl.hurt > 0 && Math.floor(pl.hurt * 20) % 2 === 0 ? "#f87171" : "#e2e8f0";
      ctx.beginPath();
      ctx.arc(0, 0, pl.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#334155";
      ctx.fillRect(pl.r - 4, -4, 16, 8);
      ctx.fillStyle = "#22d3ee";
      ctx.beginPath();
      ctx.arc(0, 0, pl.r * 0.7, -0.6, 0.6);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      nameTag(ctx, `${myName} (siz)`, pl.x, pl.y - 36, "#22d3ee", pl.hp);
      // Sensorli joystik
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (stick) {
        const r = canvas.getBoundingClientRect();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(stick.ox - r.left, stick.oy - r.top, 54, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        const dx = Math.max(-54, Math.min(54, stick.x - stick.ox));
        const dy = Math.max(-54, Math.min(54, stick.y - stick.oy));
        ctx.beginPath();
        ctx.arc(stick.ox - r.left + dx, stick.oy - r.top + dy, 24, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      setPhase("done");
      doneRef.current(report(true));
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = timing.current!;
      if (now < t.start) {
        setIntro(Math.ceil((t.start - now) / 1000));
        draw();
        raf = requestAnimationFrame(loop);
        return;
      }
      setPhase((p) => (p === "intro" ? "play" : p));

      // Kiritish
      let mx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let my = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      if (stick) {
        mx = Math.max(-1, Math.min(1, (stick.x - stick.ox) / 54));
        my = Math.max(-1, Math.min(1, (stick.y - stick.oy) / 54));
      }
      input.mx = mx;
      input.my = my;
      input.fire = mouseFire || touchFire || keys.has(" ");
      const ax = input.aimX;
      const ay = input.aimY;
      // Sensorli ekranda — avtomatik nishon
      if (touchFire || stick) {
        input.aimX = null;
        input.aimY = null;
      }
      const ev = stepArena(state, input, dt);
      if (touchFire || stick) {
        input.aimX = ax;
        input.aimY = ay;
      }
      for (const e of ev) {
        if (e === "shot" && sound && now - lastShotSound > 70) {
          lastShotSound = now;
          playShot();
        }
        if (e === "kill") {
          if (sound) playBoom();
          haptic([15]);
        }
        if (e === "hurt") {
          if (sound) playHurt();
          haptic([60]);
          burst(state.player.x, state.player.y, "#f87171", 8);
        }
        if (e === "pickup") haptic([10, 30, 10]);
      }
      // Portlash effekti: yo'qolgan dronlar o'rnida
      if (ev.includes("kill")) {
        const alive = new Set(state.drones.map((d) => d.id));
        for (const [id, d] of prevDrones) if (!alive.has(id)) burst(d.x, d.y, DRONE[d.kind].color);
      }
      prevDrones = new Map(state.drones.map((d) => [d.id, { x: d.x, y: d.y, kind: d.kind }]));
      if (state.wave !== prevWave && !state.won) {
        prevWave = state.wave;
        setBanner(`${state.wave + 1}-to'lqin!`);
        setTimeout(() => setBanner(null), 1400);
      }
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life -= dt;
      }
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);

      // Sheriklar silliq harakatlanadi
      const k = Math.min(1, dt * 8);
      for (const o of peers.values()) {
        o.x += (o.tx - o.x) * k;
        o.y += (o.ty - o.y) * k;
        // Burchak — eng qisqa yo'l bilan (±π chegarasida aylanib ketmasin)
        const da = Math.atan2(Math.sin(o.ta - o.a), Math.cos(o.ta - o.a));
        o.a += da * k;
      }
      draw();
      if (now - lastHud > 100) {
        lastHud = now;
        setHud({
          hp: state.player.hp,
          armor: state.player.armor,
          ammo: state.player.ammo,
          wave: Math.min(state.wave + 1, WAVES.length),
          kills: state.kills,
          left: Math.max(0, Math.ceil((t.end - now) / 1000)),
          group: Math.max(groupKills, state.kills),
          peers: peers.size,
        });
      }
      // Joylashuv va natija har yarim soniyada (javobda — boshqalarning joylashuvi)
      if (now - lastReport > 500) {
        lastReport = now;
        report(false);
      }
      if (state.won || state.dead || now >= t.end) {
        finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    let prevDrones = new Map<number, { x: number; y: number; kind: keyof typeof DRONE }>();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      // Yopilganda faqat oraliq natija: yakuniy natija o'yin haqiqatan tugaganda (g'alaba, yiqilish yoki vaqt) yuboriladi
      if (!finished && state.t > 0) report(false);
    };
    // O'yin bir marta yaratiladi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full min-h-[280px] w-full flex-1 select-none overflow-hidden rounded-2xl touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair" />
      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 p-2 text-white sm:p-3">
        <div className="flex items-center gap-2 rounded-xl bg-black/50 px-3 py-1.5 text-sm font-black backdrop-blur">
          <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
          <span className="h-2.5 w-20 overflow-hidden rounded-full bg-white/15 sm:w-28">
            <span className="block h-full rounded-full bg-rose-500 transition-[width]" style={{ width: `${hud.hp}%` }} />
          </span>
          {hud.armor > 0 && (
            <span className="inline-flex items-center gap-1 text-sky-300">
              <Shield className="h-4 w-4" />
              {Math.round(hud.armor)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm font-black">
          <span className="hidden rounded-xl bg-black/50 px-3 py-1.5 text-emerald-300 backdrop-blur sm:inline">
            Guruh: {hud.group} dron{hud.peers > 0 ? ` · ${hud.peers + 1} kishi` : ""}
          </span>
          <span className="rounded-xl bg-black/50 px-3 py-1.5 backdrop-blur">{hud.wave}/{WAVES.length}-to&apos;lqin</span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-black/50 px-3 py-1.5 backdrop-blur">
            <Skull className="h-4 w-4" /> {hud.kills}
          </span>
          <span className={cn("inline-flex items-center gap-1 rounded-xl bg-black/50 px-3 py-1.5 backdrop-blur", hud.ammo === 0 && "text-rose-300")}>
            <Zap className="h-4 w-4 text-yellow-300" /> {hud.ammo}
          </span>
          <span className={cn("rounded-xl bg-black/50 px-3 py-1.5 font-mono backdrop-blur", hud.left <= 10 && "text-rose-300")}>{hud.left}s</span>
        </div>
      </div>
      {phase === "intro" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-center text-white backdrop-blur-sm">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-fuchsia-300">Kiber arena</p>
          <span key={intro} className="quiz-count font-mono text-8xl font-black">
            {Math.max(1, intro)}
          </span>
          <p className="max-w-md px-4 text-sm text-slate-200">
            {touch ? "Chap tomon — yurish, o'ng tomonni bosib turing — otish" : "WASD / strelkalar — yurish, sichqoncha — nishon va otish (Space ham)"}
          </p>
          <p className="text-sm font-bold text-yellow-200">
            <Crosshair className="mr-1 inline h-4 w-4" /> {loadout.ammo} o&apos;q · <Shield className="mr-1 inline h-4 w-4" /> {loadout.armor} zirh
          </p>
        </div>
      )}
      {banner && phase === "play" && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
          <span className="live-banner rounded-2xl bg-fuchsia-600 px-6 py-3 text-3xl font-black text-white">{banner}</span>
        </div>
      )}
      {phase === "done" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Trophy className="h-16 w-16 text-amber-300" />
        </div>
      )}
    </div>
  );
}

const PEER_COLORS = ["#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#facc15", "#60a5fa", "#f87171", "#2dd4bf", "#e879f9", "#a3e635"];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

/** Robot tepasidagi ism va kichik sog'liq chizig'i */
export function nameTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, hp: number) {
  ctx.save();
  ctx.font = "bold 21px ui-sans-serif, system-ui, sans-serif";
  const label = text.length > 18 ? `${text.slice(0, 17)}…` : text;
  const w = ctx.measureText(label).width + 18;
  ctx.fillStyle = "rgba(2,6,23,0.75)";
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 16, w, 28, 9);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y - 2);
  // Sog'liq
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(x - 20, y + 15, 40, 5);
  ctx.fillStyle = hp > 50 ? "#4ade80" : hp > 25 ? "#facc15" : "#f87171";
  ctx.fillRect(x - 20, y + 15, (40 * Math.max(0, hp)) / 100, 5);
  ctx.restore();
}
