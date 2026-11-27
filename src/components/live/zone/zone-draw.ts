// "Yashil zona" field renderer (canvas 2D), shared by the student phone and the projector.
// Coordinates are field units (FIELD.w × FIELD.h) mapped to the screen. The floor is pre-rendered once.
// Visual only: game rules, timings and network state come from the caller unchanged.
// Style: shared ITXiva theme (lib/game/theme.ts) — indigo outlines, 3-tone shading, light from top-left,
// students' own characters as animated rigs (components/character/character-rig.ts).

import { FIELD, ROBOT_R, STAR_R, ZAP_PERIOD_MS, zapActive, type ZoneWave } from "@/lib/live-game/zone";
import type { GameLook } from "@/lib/character/catalog";
import { characterRig, drawRig } from "@/components/character/character-rig";
import { ease, clamp01 } from "@/lib/game/easing";
import { FloatTextPool, HitStop, ParticlePool, RingPool, Shake, groundShadow, starPath, type ParticleKind } from "@/lib/game/fx";
import { GAME_FONT } from "@/lib/game/font";
import { motionScale, reducedMotion } from "@/lib/game/motion";
import { RigActor, newPose, type Pose } from "@/lib/game/rig";
import { skinFx } from "@/lib/game/skins";
import { alpha, theme, tone3 } from "@/lib/game/theme";

const Z = theme.zone;
const P = theme.palette;

export interface DrawRobot {
  id: string;
  name: string;
  x: number;
  y: number;
  color: number;
  out: boolean;
  me?: boolean;
  /** Move direction (faces that way) */
  dx?: number;
  dy?: number;
  /** Seat: 0 — not in a zone, z+1 — seated, -(z+1) — zone was full */
  seat: number;
  stunned?: boolean;
  moving?: boolean;
  /** Student's character; undefined = not loaded yet (a robot is drawn meanwhile) */
  look?: GameLook | null;
}

export interface DrawState {
  wave: ZoneWave | null;
  /** Since wave start (ms) — zone appear and electric traps */
  sinceWaveMs: number;
  /** Share of wave time left (1 → 0); null — countdown or over */
  timeLeft: number | null;
  lock: boolean;
  stars: ZoneWave["stars"];
  robots: DrawRobot[];
  /** Name tags: projector — everyone, phone — nearby only */
  labels: "all" | "near";
  /** Own robot: path to the nearest free zone */
  guide?: { x: number; y: number } | null;
  /** Tapped point (phone) */
  target?: { x: number; y: number } | null;
  t: number;
  fx: ZoneFx;
  /** Device pixel ratio (screen shake is specified in CSS px) */
  dpr?: number;
}

interface ZoneActor {
  rig: RigActor;
  pose: Pose;
  seat: number;
  out: boolean;
  stunned: boolean;
  nextZap: number;
  fallDir: 1 | -1;
  cheer: number;
}

/** Effects + per-character animation state (field units) */
export class ZoneFx {
  particles = new ParticlePool(150);
  texts = new FloatTextPool(24);
  rings = new RingPool(16);
  shake = new Shake();
  hitStop = new HitStop();
  actors = new Map<string, ZoneActor>();
  /** Visual dt of the current frame (0 during hit-stop) */
  vdt = 0;
  /** Bumped by the game when a wave is survived — alive characters celebrate */
  cheer = 0;

  burst(x: number, y: number, color: string, n = 16, speed = 18, kind: ParticleKind = "dot") {
    this.particles.emit(x, y, { color, n, speed, kind, size: kind === "spark" ? 0.5 : 0.42, life: 0.75 });
  }

  sparkle(x: number, y: number, color: string = Z.starLight, n = 10) {
    this.particles.emit(x, y, { kind: "star", color, n, speed: 12, size: 0.45, life: 0.7, drag: 4 });
  }

  confetti(x: number, y: number, n = 18) {
    const colors = [P.accent, P.success, P.primaryLight, P.danger, P.info];
    for (let i = 0; i < colors.length; i++) {
      this.particles.emit(x, y, { kind: "confetti", color: colors[i], n: Math.ceil(n / colors.length), speed: 20, dir: -Math.PI / 2, spread: 2.2, gravity: 34, drag: 1.6, size: 0.45, life: 1.1 });
    }
  }

  dust(x: number, y: number, color: string = Z.tileLight) {
    this.particles.emit(x, y, { kind: "dust", color, n: 1, speed: 3, dir: -Math.PI / 2, spread: 2.4, size: 0.35, grow: 1.6, life: 0.45, drag: 5 });
  }

  text(x: number, y: number, text: string, color: string, size = 1) {
    this.texts.add(x, y, text, color, size);
  }

  ring(x: number, y: number, color: string, r = 6) {
    this.rings.add(x, y, color, r);
  }

  /** Call once per frame with the real dt; game simulation must keep using the real dt */
  step(dt: number) {
    this.vdt = this.hitStop.filter(dt);
    this.particles.step(this.vdt);
    this.texts.step(this.vdt);
    this.rings.step(this.vdt);
    this.shake.step(dt);
  }
}

// ---- Floor (cached) ----
let bgCache: { w: number; h: number; c: HTMLCanvasElement } | null = null;

function background(width: number, height: number): HTMLCanvasElement {
  if (bgCache && bgCache.w === width && bgCache.h === height) return bgCache.c;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  const fw = FIELD.w * k;
  const fh = FIELD.h * k;
  const rr = Math.min(fw, fh) * 0.04;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ox, oy, fw, fh, rr);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, oy, 0, oy + fh);
  bg.addColorStop(0, Z.fieldTop);
  bg.addColorStop(0.5, Z.fieldMid);
  bg.addColorStop(1, Z.fieldBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(ox, oy, fw, fh);
  // Hex floor plates: faint fill + soft top-left bevel, low contrast so characters pop
  const hs = 4 * k;
  const hw = Math.sqrt(3) * hs;
  ctx.lineWidth = Math.max(1, k * 0.12);
  for (let row = 0, y = oy; y < oy + fh + hs * 2; row++, y += hs * 1.5) {
    for (let x = ox + (row % 2 ? hw / 2 : 0), col = 0; x < ox + fw + hw; x += hw, col++) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        ctx.lineTo(x + Math.cos(a) * hs * 0.94, y + Math.sin(a) * hs * 0.94);
      }
      ctx.closePath();
      ctx.fillStyle = alpha(Z.tile, (row + col) % 3 === 0 ? 0.035 : 0.018);
      ctx.fill();
      ctx.strokeStyle = alpha(Z.tile, 0.07);
      ctx.stroke();
      // bevel highlight on the top-left edges
      ctx.strokeStyle = alpha(Z.tileLight, 0.05);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos((7 * Math.PI) / 6) * hs * 0.9, y + Math.sin((7 * Math.PI) / 6) * hs * 0.9);
      ctx.lineTo(x + Math.cos((3 * Math.PI) / 2) * hs * 0.9, y + Math.sin((3 * Math.PI) / 2) * hs * 0.9);
      ctx.stroke();
    }
  }
  // Light from top-left, vignette at the edges
  const light = ctx.createRadialGradient(ox + fw * 0.18, oy + fh * 0.1, 0, ox + fw * 0.18, oy + fh * 0.1, Math.max(fw, fh) * 0.7);
  light.addColorStop(0, alpha(Z.tileLight, 0.09));
  light.addColorStop(1, alpha(Z.tileLight, 0));
  ctx.fillStyle = light;
  ctx.fillRect(ox, oy, fw, fh);
  const vg = ctx.createRadialGradient(ox + fw / 2, oy + fh / 2, Math.min(fw, fh) * 0.35, ox + fw / 2, oy + fh / 2, Math.max(fw, fh) * 0.72);
  vg.addColorStop(0, alpha(theme.outline, 0));
  vg.addColorStop(1, alpha(theme.outline, 0.55));
  ctx.fillStyle = vg;
  ctx.fillRect(ox, oy, fw, fh);
  ctx.restore();
  bgCache = { w: width, h: height, c };
  return c;
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, size: number, bg: string, fg: string, weight = 900) {
  ctx.font = `${weight} ${size.toFixed(1)}px ${GAME_FONT}`;
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.55;
  ctx.fillStyle = alpha(theme.outline, 0.9);
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 1.5, y - h / 2 - 1.5, w + 3, h + 3, h / 2 + 1.5);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + size * 0.06);
}

function actorFor(fx: ZoneFx, r: DrawRobot): ZoneActor {
  let a = fx.actors.get(r.id);
  if (!a) {
    a = {
      rig: new RigActor({ amp: motionScale(), seed: r.color * 7.3 + r.id.length, celebrate: skinFx(r.look?.costume).celebrate }),
      pose: newPose(),
      seat: r.seat,
      out: r.out,
      stunned: false,
      nextZap: 0,
      fallDir: r.color % 2 ? 1 : -1,
      cheer: fx.cheer,
    };
    if (r.out) a.rig.knockOut();
    fx.actors.set(r.id, a);
  }
  return a;
}

export function drawZoneField(ctx: CanvasRenderingContext2D, width: number, height: number, s: DrawState) {
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy + y * k;
  const fw = FIELD.w * k;
  const fh = FIELD.h * k;
  const fx = s.fx;
  const t = s.t;
  const dpr = s.dpr ?? 1;
  const ol = Math.max(1.5, k * 0.32);

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (fx.shake.x || fx.shake.y) ctx.translate(fx.shake.x * dpr, fx.shake.y * dpr);
  ctx.drawImage(background(width, height), 0, 0);

  const wave = s.wave;
  const appear = wave ? clamp01(s.sinceWaveMs / 550) : 0;
  const scale = wave ? ease.outBack(appear) : 0;
  const seated = wave ? wave.zones.map((_, zi) => s.robots.filter((r) => !r.out && r.seat === zi + 1).length) : [];

  // ---- Traps ----
  if (wave) {
    for (const tr of wave.traps) {
      const x = X(tr.x);
      const y = Y(tr.y);
      const r = tr.r * k * scale;
      if (r <= 0) continue;
      if (tr.kind === "slow") {
        // Purple mud: wobbly blob, 3-tone, bubbles that pop
        const tones = tone3(Z.mud);
        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          const rr = r * (1 + Math.sin(a * 5 + t * 2 + tr.id) * 0.05 * motionScale());
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
        g.addColorStop(0, alpha(tones.light, 0.5));
        g.addColorStop(0.55, alpha(Z.mud, 0.42));
        g.addColorStop(1, alpha(tones.shadow, 0.55));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = ol;
        ctx.strokeStyle = alpha(theme.outline, 0.85);
        ctx.stroke();
        for (let b = 0; b < 4; b++) {
          const ph = (t * 0.7 + b / 4 + tr.id * 0.37) % 1;
          const bx = x + Math.cos(b * 2.1 + tr.id) * r * 0.5;
          const by = y + Math.sin(b * 2.1 + tr.id) * r * 0.42;
          const br = k * 0.5 * ease.outCubic(ph);
          ctx.globalAlpha = 1 - ph * ph;
          ctx.fillStyle = alpha(Z.mudLight, 0.7);
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = alpha(Z.mudLight, 0.9);
          ctx.lineWidth = Math.max(1, k * 0.12);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (r > k * 3) {
          ctx.font = `900 ${Math.max(9, k * 1.4).toFixed(1)}px ${GAME_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = alpha(Z.mudLight, 0.8);
          ctx.fillText("LOY", x, y);
        }
      } else {
        // Electric pad: metal hex plate; glows and arcs when on, blinks just before switching on
        const on = zapActive(tr, s.sinceWaveMs);
        const phase = (s.sinceWaveMs + tr.phase) % ZAP_PERIOD_MS;
        const soon = !on && ZAP_PERIOD_MS - phase < 500;
        const hex = (rad: number) => {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
          }
          ctx.closePath();
        };
        if (on) {
          const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.6);
          glow.addColorStop(0, alpha(Z.zap, 0.45));
          glow.addColorStop(1, alpha(Z.zap, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        hex(r);
        const plate = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        plate.addColorStop(0, Z.padMetalLight);
        plate.addColorStop(0.5, Z.padMetal);
        plate.addColorStop(1, Z.padMetalDark);
        ctx.fillStyle = plate;
        ctx.fill();
        ctx.lineWidth = ol;
        ctx.strokeStyle = theme.outline;
        ctx.stroke();
        hex(r * 0.72);
        ctx.fillStyle = on ? alpha(Z.zap, 0.85) : soon && Math.floor(t * 16) % 2 ? alpha(Z.zap, 0.5) : alpha(Z.padMetalDark, 0.9);
        ctx.fill();
        // Bolt icon
        const zz = r * 0.5;
        ctx.beginPath();
        ctx.moveTo(x + zz * 0.15, y - zz);
        ctx.lineTo(x - zz * 0.45, y + zz * 0.1);
        ctx.lineTo(x - zz * 0.02, y + zz * 0.1);
        ctx.lineTo(x - zz * 0.15, y + zz);
        ctx.lineTo(x + zz * 0.45, y - zz * 0.1);
        ctx.lineTo(x + zz * 0.02, y - zz * 0.1);
        ctx.closePath();
        ctx.fillStyle = on ? Z.zapLight : alpha(Z.padMetalLight, 0.85);
        ctx.fill();
        ctx.lineWidth = Math.max(1, ol * 0.6);
        ctx.strokeStyle = theme.outline;
        ctx.stroke();
        if (on) {
          ctx.strokeStyle = alpha(Z.zapLight, 0.95);
          ctx.lineWidth = Math.max(1, k * 0.2);
          ctx.lineCap = "round";
          for (let b = 0; b < 3; b++) {
            const a0 = t * 9 + b * 2.1 + Math.sin(t * 31 + b) * 0.6;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a0) * r * 0.4, y + Math.sin(a0) * r * 0.4);
            for (let j = 1; j <= 3; j++) {
              const rr = r * (0.4 + j * 0.3);
              const aj = a0 + (Math.random() - 0.5) * 0.5;
              ctx.lineTo(x + Math.cos(aj) * rr, y + Math.sin(aj) * rr);
            }
            ctx.stroke();
          }
          ctx.lineCap = "butt";
        }
      }
    }
  }

  // ---- Zone closed: outside turns red ----
  if (wave && s.lock) {
    ctx.fillStyle = alpha(Z.lock, 0.26 + Math.sin(t * 12) * 0.06 * motionScale());
    ctx.beginPath();
    ctx.rect(ox, oy, fw, fh);
    for (const z of wave.zones) {
      ctx.moveTo(X(z.cx) + z.r * k, Y(z.cy));
      ctx.arc(X(z.cx), Y(z.cy), z.r * k, 0, Math.PI * 2, true);
    }
    ctx.fill("evenodd");
  }

  // ---- Safe zones: glowing landing pads ----
  if (wave) {
    wave.zones.forEach((z, zi) => {
      const x = X(z.cx);
      const y = Y(z.cy);
      const r = z.r * k * scale;
      if (r <= 0) return;
      const full = z.cap > 0 && seated[zi] >= z.cap;
      const col = full ? Z.full : Z.safe;
      const tones = tone3(col);
      const pulse = 1 + Math.sin(t * 4 + zi) * 0.018 * motionScale();
      // Light column glow (brighter while appearing)
      const beam = ctx.createRadialGradient(x, y, 0, x, y, r * 1.4);
      beam.addColorStop(0, alpha(tones.light, appear < 1 ? 0.55 : 0.22));
      beam.addColorStop(0.7, alpha(col, 0.16));
      beam.addColorStop(1, alpha(col, 0));
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.4, 0, Math.PI * 2);
      ctx.fill();
      // Pad: 3-tone disk, light from top-left
      ctx.beginPath();
      ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
      const pad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
      pad.addColorStop(0, alpha(tones.light, 0.34));
      pad.addColorStop(0.6, alpha(col, 0.2));
      pad.addColorStop(1, alpha(tones.shadow, 0.32));
      ctx.fillStyle = pad;
      ctx.fill();
      ctx.lineWidth = ol * 1.6;
      ctx.strokeStyle = alpha(theme.outline, 0.9);
      ctx.stroke();
      ctx.lineWidth = Math.max(2, k * 0.45);
      ctx.strokeStyle = s.lock ? Z.safeLight : col;
      ctx.setLineDash([k * 2, k * 1.2]);
      ctx.lineDashOffset = -t * k * 6 * (zi % 2 ? -1 : 1) * motionScale();
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, r * pulse - k * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = alpha(tones.light, 0.3);
      ctx.lineWidth = Math.max(1, k * 0.25);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, t * 1.5, t * 1.5 + Math.PI * 1.3);
      ctx.stroke();
      // Appear shock ring
      if (appear < 1) {
        ctx.strokeStyle = alpha(Z.safeLight, 1 - appear);
        ctx.lineWidth = Math.max(2, k * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, z.r * k * (1 + ease.outCubic(appear) * 1.2)), 0, Math.PI * 2);
        ctx.stroke();
      }
      // Time left: arc around the zone (orange from 30%, red + pulse from 10%)
      if (s.timeLeft !== null && !s.lock) {
        const tl = s.timeLeft;
        const danger = tl <= 0.1;
        const tc = danger ? theme.timer.danger : tl <= 0.3 ? theme.timer.warn : Z.full;
        const w = Math.max(3, k * 0.8) * (danger ? 1 + Math.abs(Math.sin(t * 14)) * 0.5 * motionScale() : 1);
        ctx.lineCap = "round";
        ctx.lineWidth = w + ol;
        ctx.strokeStyle = alpha(theme.outline, 0.85);
        ctx.beginPath();
        ctx.arc(x, y, r + k * 1.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tl);
        ctx.stroke();
        ctx.lineWidth = w;
        ctx.strokeStyle = tc;
        ctx.stroke();
        ctx.lineCap = "butt";
      }
      // Seats: pips on the rim + "3/6" badge above the zone
      const by = Math.max(oy + k * 2.4, y - r - k * 3.4);
      const fs = Math.max(11, k * 2);
      if (z.cap > 0) {
        pill(ctx, x, by, full ? `TO'LA ${z.cap}/${z.cap}` : `${seated[zi]}/${z.cap} joy`, fs, full ? Z.full : Z.safeDark, full ? theme.outline : P.white);
        const n = z.cap;
        const pr = Math.max(1.6, k * 0.48);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const rim = Math.max(0, r - pr * 2.4);
          const px = x + Math.cos(a) * rim;
          const py = y + Math.sin(a) * rim;
          const taken = i < seated[zi];
          ctx.fillStyle = taken ? (full ? Z.full : Z.safe) : alpha(theme.outline, 0.7);
          ctx.strokeStyle = theme.outline;
          ctx.lineWidth = Math.max(1, k * 0.18);
          ctx.beginPath();
          ctx.arc(px, py, taken ? pr * 1.1 : pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (taken) {
            ctx.fillStyle = alpha(P.white, 0.6);
            ctx.beginPath();
            ctx.arc(px - pr * 0.35, py - pr * 0.35, pr * 0.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        pill(ctx, x, by, "HAMMA UCHUN", fs, Z.safeDark, P.white);
      }
    });
  }

  // ---- Guide line to the nearest free zone (own robot) ----
  const mine = s.robots.find((r) => r.me);
  if (s.guide && mine && !mine.out && !s.lock) {
    const d = Math.hypot(s.guide.x - mine.x, s.guide.y - mine.y);
    if (d > 3) {
      ctx.save();
      ctx.strokeStyle = alpha(P.white, 0.55);
      ctx.lineWidth = Math.max(1.5, k * 0.32);
      ctx.lineCap = "round";
      ctx.setLineDash([k * 0.4, k * 1.4]);
      ctx.lineDashOffset = -t * k * 8;
      ctx.beginPath();
      ctx.moveTo(X(mine.x), Y(mine.y));
      ctx.lineTo(X(s.guide.x), Y(s.guide.y));
      ctx.stroke();
      ctx.restore();
    }
  }
  // Tapped point
  if (s.target && mine && !mine.out) {
    const pr = (t * 2) % 1;
    ctx.strokeStyle = alpha(P.white, 0.85 - pr * 0.65);
    ctx.lineWidth = Math.max(1.5, k * 0.25);
    ctx.beginPath();
    ctx.ellipse(X(s.target.x), Y(s.target.y), k * (0.6 + pr * 1.4), k * (0.3 + pr * 0.7), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- Stars: collectibles bob, spin and shine ----
  for (const st of s.stars) {
    const bob = Math.sin(t * ((Math.PI * 2) / 1.5) + st.id) * k * 0.4 * motionScale();
    const x = X(st.x);
    const y = Y(st.y) + bob;
    const rr = STAR_R * k * scale * 1.1;
    if (rr <= 0) continue;
    groundShadow(ctx, X(st.x), Y(st.y) + STAR_R * k * 0.9, rr * 0.7, rr * 0.25, 0.3 + bob / (k * 2));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.2);
    g.addColorStop(0, alpha(Z.star, 0.38));
    g.addColorStop(1, alpha(Z.star, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr * 2.2, 0, Math.PI * 2);
    ctx.fill();
    const rot = Math.sin(t * 1.6 + st.id) * 0.35 * motionScale();
    starPath(ctx, x, y, rr, rot, 0.5);
    const sg = ctx.createLinearGradient(x - rr, y - rr, x + rr, y + rr);
    sg.addColorStop(0, Z.starLight);
    sg.addColorStop(0.45, Z.star);
    sg.addColorStop(1, Z.starDark);
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.2, k * 0.26);
    ctx.strokeStyle = theme.outline;
    ctx.stroke();
    // Shine sweep
    const sw = ((t * 0.6 + st.id * 0.13) % 1.6) - 0.3;
    if (sw > 0 && sw < 1) {
      ctx.save();
      starPath(ctx, x, y, rr * 0.92, rot, 0.5);
      ctx.clip();
      ctx.fillStyle = alpha(P.white, 0.65);
      ctx.translate(x - rr + sw * rr * 2, y);
      ctx.rotate(0.5);
      ctx.fillRect(-rr * 0.15, -rr * 1.5, rr * 0.3, rr * 3);
      ctx.restore();
    }
  }

  // ---- Characters: knocked-out under, own one on top. Phone shows names only nearby ----
  const labelled = (r: DrawRobot) => s.labels === "all" || r.me || (mine !== undefined && Math.hypot(r.x - mine.x, r.y - mine.y) < 22);
  const order = [...s.robots].sort((a, b) => Number(!a.out) - Number(!b.out) || Number(Boolean(a.me)) - Number(Boolean(b.me)) || a.y - b.y);
  const seen = new Set<string>();
  for (const r of order) {
    seen.add(r.id);
    const x = X(r.x);
    const y = Y(r.y);
    const rad = ROBOT_R * k;
    const feet = y + rad * 1.05;
    const h = rad * 3.6;
    const color = theme.players[r.color % theme.players.length];
    const a = actorFor(fx, r);

    // State changes → rig states (visual only)
    if (r.out && !a.out) a.rig.knockOut();
    if (!r.out && a.out) a.rig.revive();
    if (!r.out) {
      if (r.stunned && (!a.stunned || t >= a.nextZap)) {
        a.rig.request("hit");
        a.nextZap = t + 0.34;
      }
      if (r.seat > 0 && a.seat <= 0) a.rig.request("celebrate");
      else if (r.seat < 0 && a.seat >= 0) a.rig.request("sad");
      if (fx.cheer !== a.cheer && (r.seat > 0 || wave?.shared)) a.rig.request("celebrate");
      if (s.lock && r.seat <= 0 && a.rig.state === "idle") a.rig.request("think");
      if (!s.lock && a.rig.state === "think") a.rig.request("idle");
    }
    a.cheer = fx.cheer;
    a.seat = r.seat;
    a.out = r.out;
    a.stunned = Boolean(r.stunned);
    a.rig.update(fx.vdt, { moving: Boolean(r.moving) && !r.out, dirX: r.dx });
    const pose = a.rig.pose(a.pose);
    if (a.rig.stepped && fx.vdt > 0) fx.dust(r.x - (r.dx ?? 0) * 0.05, r.y + ROBOT_R * 1.05);
    if (a.rig.landed) fx.dust(r.x, r.y + ROBOT_R * 1.05);

    // Ground: shadow, seat decal, own marker
    groundShadow(ctx, x, feet, rad * 1.0, rad * 0.34, pose.y * 2.5);
    if (!r.out && r.seat !== 0) {
      const good = r.seat > 0;
      const blink = good || Math.floor(t * 6) % 2 === 0;
      ctx.lineWidth = Math.max(2, k * 0.36);
      ctx.strokeStyle = good ? Z.safe : alpha(Z.lock, blink ? 0.95 : 0.35);
      ctx.beginPath();
      ctx.ellipse(x, feet, rad * 1.45, rad * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (r.me && !r.out) {
      const pr = (t * 1.4) % 1;
      ctx.strokeStyle = alpha(P.white, 0.9 - pr * 0.6);
      ctx.lineWidth = Math.max(2, k * 0.32);
      ctx.beginPath();
      ctx.ellipse(x, feet, rad * (1.25 + pr * 0.6), rad * (0.45 + pr * 0.22), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const rig = r.look !== undefined ? characterRig(r.look, h) : null;
    if (rig) {
      drawRig(ctx, rig, pose, x, feet, h, { alpha: r.out ? 0.55 : 1, t, fallDir: a.fallDir });
      // Skin effects: idle particles (epic/legendary) and golden run trail
      if (!r.out && fx.vdt > 0 && !reducedMotion()) {
        if (rig.fx.particles && Math.random() < fx.vdt * 2.2) fx.particles.emit(r.x + (Math.random() - 0.5) * 3, r.y - 2.5, { kind: "star", color: rig.fx.particles, n: 1, speed: 2, dir: -Math.PI / 2, spread: 1, size: 0.3, life: 0.8, drag: 2 });
        if (rig.fx.trail && r.moving && a.rig.stepped) fx.particles.emit(r.x, r.y + ROBOT_R, { kind: "star", color: rig.fx.trail, n: 1, speed: 2, size: 0.28, life: 0.5 });
      }
    } else {
      drawRobot(ctx, r, pose, x, feet, rad, color, t, ol);
    }

    // Shocked: electric arcs around the body
    if (r.stunned && !r.out) {
      ctx.strokeStyle = Z.zapLight;
      ctx.lineWidth = Math.max(1, k * 0.22);
      ctx.lineCap = "round";
      for (let b = 0; b < 3; b++) {
        const ang = t * 12 + b * 2.1;
        const cy = feet - h * 0.45;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * rad * 1.2, cy + Math.sin(ang) * rad * 1.6);
        ctx.lineTo(x + Math.cos(ang + 0.25) * rad * 1.6, cy + Math.sin(ang + 0.25) * rad * 1.9);
        ctx.lineTo(x + Math.cos(ang + 0.45) * rad * 1.9, cy + Math.sin(ang + 0.45) * rad * 2.1);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    }
    // Knocked out: little dizzy stars
    if (r.out && pose.down > 0.6 && !reducedMotion()) {
      const cx = x + a.fallDir * h * 0.5;
      const cy = feet - rad * 0.9;
      for (let b = 0; b < 3; b++) {
        const ang = t * 3 + (b * Math.PI * 2) / 3;
        ctx.fillStyle = alpha(Z.star, 0.8);
        starPath(ctx, cx + Math.cos(ang) * rad * 0.9, cy + Math.sin(ang) * rad * 0.35, rad * 0.28, ang);
        ctx.fill();
      }
    }

    // Name tag (pill above the head)
    if (labelled(r)) {
      const name = r.me ? "Siz" : r.name.length > 12 ? `${r.name.slice(0, 11)}…` : r.name;
      const fs = Math.max(10, k * (r.me ? 1.9 : 1.6));
      const ty = feet - h * (r.out ? 0.5 : 0.9) - pose.y * h - fs * 0.95;
      ctx.globalAlpha = r.out ? 0.6 : 1;
      pill(ctx, x, ty, name, fs, r.me ? P.primary : alpha(theme.outline, 0.82), r.out ? Z.labelMuted : P.white, 800);
      ctx.globalAlpha = 1;
      if (r.me && !r.out) {
        // Bouncing marker above own name
        const bob = Math.abs(Math.sin(t * 4)) * k * 0.6 * motionScale();
        const my = ty - fs * 1.2 - bob;
        ctx.beginPath();
        ctx.moveTo(x - fs * 0.45, my - fs * 0.45);
        ctx.lineTo(x + fs * 0.45, my - fs * 0.45);
        ctx.lineTo(x, my + fs * 0.1);
        ctx.closePath();
        ctx.fillStyle = P.accent;
        ctx.fill();
        ctx.lineWidth = Math.max(1.2, k * 0.2);
        ctx.strokeStyle = theme.outline;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }
    if (!r.out && r.seat < 0) {
      ctx.font = `900 ${Math.max(10, k * 1.7).toFixed(1)}px ${GAME_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = Math.max(2, k * 0.35);
      ctx.strokeStyle = theme.outline;
      ctx.strokeText("joy yo'q!", x, feet + rad * 0.5);
      ctx.fillStyle = Z.labelBad;
      ctx.fillText("joy yo'q!", x, feet + rad * 0.5);
    }
  }
  // Forget characters that left the game
  if (fx.actors.size > seen.size) for (const id of fx.actors.keys()) if (!seen.has(id)) fx.actors.delete(id);

  // ---- Effects ----
  fx.rings.draw(ctx, X, Y, k);
  fx.particles.draw(ctx, X, Y, k);
  fx.texts.draw(ctx, X, Y, k, GAME_FONT);

  // Border
  ctx.lineWidth = Math.max(2, k * 0.35);
  ctx.strokeStyle = s.lock ? alpha(Z.lock, 0.75) : alpha(Z.safe, 0.5);
  ctx.beginPath();
  ctx.roundRect(ox + 1, oy + 1, fw - 2, fh - 2, Math.min(fw, fh) * 0.04);
  ctx.stroke();
  ctx.restore();
}

/** Fallback while the character rig is baking: a small themed robot that uses the same pose */
function drawRobot(ctx: CanvasRenderingContext2D, r: DrawRobot, pose: Pose, x: number, feet: number, rad: number, color: string, t: number, ol: number) {
  const tones = tone3(r.out ? Z.out : color);
  ctx.save();
  ctx.globalAlpha = r.out ? 0.55 : 1;
  ctx.translate(x + pose.shakeX * rad * 3, feet - pose.y * rad * 3.6);
  if (pose.down) ctx.rotate(pose.down * 1.3);
  ctx.scale(pose.sx, pose.sy);
  const cy = -rad * 1.05;
  // Antenna
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = Math.max(1.5, ol * 0.7);
  ctx.beginPath();
  ctx.moveTo(0, cy - rad * 0.8);
  ctx.lineTo(0, cy - rad * 1.45);
  ctx.stroke();
  ctx.fillStyle = r.out ? Z.out : Math.floor(t * 3 + r.color) % 2 ? Z.zapLight : P.danger;
  ctx.beginPath();
  ctx.arc(0, cy - rad * 1.5, rad * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Body (3-tone)
  const body = ctx.createLinearGradient(-rad, cy - rad, rad, cy + rad);
  body.addColorStop(0, tones.light);
  body.addColorStop(0.45, tones.base);
  body.addColorStop(1, tones.shadow);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-rad, cy - rad * 0.85, rad * 2, rad * 1.7, rad * 0.55);
  ctx.fill();
  ctx.lineWidth = ol;
  ctx.strokeStyle = theme.outline;
  ctx.stroke();
  // Visor + eyes
  ctx.fillStyle = theme.outline;
  ctx.beginPath();
  ctx.roundRect(-rad * 0.75, cy - rad * 0.45, rad * 1.5, rad * 0.75, rad * 0.3);
  ctx.fill();
  const eye = r.out || r.stunned ? (r.out ? P.dangerLight : Z.zapLight) : P.turquoiseLight;
  ctx.fillStyle = eye;
  for (const ex of [-0.35, 0.35]) {
    ctx.beginPath();
    if (pose.face === "blink") ctx.rect(rad * ex - rad * 0.17, cy - rad * 0.1, rad * 0.34, rad * 0.06);
    else ctx.arc(rad * ex, cy - rad * 0.08, rad * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Screen point → field coordinates */
export function toField(width: number, height: number, px: number, py: number): { x: number; y: number } {
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  return { x: Math.max(0, Math.min(FIELD.w, (px - ox) / k)), y: Math.max(0, Math.min(FIELD.h, (py - oy) / k)) };
}
