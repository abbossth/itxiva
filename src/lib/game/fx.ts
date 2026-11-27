// Game feel ("juice") for canvas games: pooled particles, floating text, rings, hit-stop and screen shake.
// Units are whatever the game uses (field units, px…); drawing takes a mapper to screen pixels.
// Everything is object-pooled — no allocations in the hot loop — and respects prefers-reduced-motion.

import { ease, clamp01 } from "./easing";
import { reducedMotion } from "./motion";
import { alpha, theme } from "./theme";

export type ParticleKind = "dot" | "spark" | "star" | "dust" | "confetti";

interface Particle {
  alive: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  rot: number;
  vr: number;
  color: string;
}

export interface EmitOptions {
  kind?: ParticleKind;
  color: string;
  /** Count before reduced-motion scaling */
  n?: number;
  speed?: number;
  /** Direction (rad) and spread (rad); default: all around */
  dir?: number;
  spread?: number;
  size?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  grow?: number;
}

/** Fixed-size particle pool (max ~150 alive). When full, the oldest particle is reused. */
export class ParticlePool {
  private items: Particle[];
  private cursor = 0;
  alive = 0;

  constructor(readonly capacity = 150) {
    this.items = Array.from({ length: capacity }, () => ({
      alive: false,
      kind: "dot" as ParticleKind,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      gravity: 0,
      drag: 0,
      life: 0,
      max: 1,
      size: 1,
      grow: 0,
      rot: 0,
      vr: 0,
      color: theme.palette.white,
    }));
  }

  private take(): Particle {
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      if (!this.items[idx].alive) {
        this.cursor = (idx + 1) % this.capacity;
        return this.items[idx];
      }
    }
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    this.alive--;
    return p;
  }

  emit(x: number, y: number, o: EmitOptions) {
    const reduce = reducedMotion();
    // Reduced motion: ~30% of the particles (small emits become a chance instead of always one)
    const raw = (o.n ?? 12) * (reduce ? 0.3 : 1);
    const n = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0);
    if (n <= 0) return;
    const speed = o.speed ?? 10;
    const spread = o.spread ?? Math.PI * 2;
    const dir = o.dir ?? 0;
    for (let i = 0; i < n; i++) {
      const p = this.take();
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.65);
      const life = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      p.alive = true;
      p.kind = o.kind ?? "dot";
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 3;
      p.life = life;
      p.max = life;
      p.size = (o.size ?? 0.5) * (0.6 + Math.random() * 0.7);
      p.grow = o.grow ?? 0;
      p.rot = Math.random() * Math.PI * 2;
      p.vr = (Math.random() - 0.5) * 12;
      p.color = o.color;
      this.alive++;
    }
  }

  step(dt: number) {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.alive--;
        continue;
      }
      const k = 1 - Math.min(1, dt * p.drag);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
    }
  }

  clear() {
    for (const p of this.items) p.alive = false;
    this.alive = 0;
  }

  /** px = unit → pixel scale; X/Y map game units to screen */
  draw(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, px: number) {
    if (this.alive <= 0) return;
    const prevAlpha = ctx.globalAlpha;
    for (const p of this.items) {
      if (!p.alive) continue;
      const t = p.life / p.max;
      const x = X(p.x);
      const y = Y(p.y);
      const s = Math.max(0.5, p.size * px);
      switch (p.kind) {
        case "dust": {
          ctx.globalAlpha = prevAlpha * t * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "spark": {
          ctx.globalAlpha = prevAlpha * Math.min(1, t * 1.6);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, s * 0.55);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * px * 0.04, y - p.vy * px * 0.04);
          ctx.stroke();
          break;
        }
        case "star": {
          ctx.globalAlpha = prevAlpha * Math.min(1, t * 1.6);
          ctx.fillStyle = p.color;
          starPath(ctx, x, y, s * 1.4, p.rot);
          ctx.fill();
          break;
        }
        case "confetti": {
          ctx.globalAlpha = prevAlpha * Math.min(1, t * 2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.rot * 1.7));
          ctx.fillRect(-s, -s * 0.5, s * 2, s);
          ctx.restore();
          break;
        }
        default: {
          ctx.globalAlpha = prevAlpha * t;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.lineCap = "butt";
  }
}

export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

interface FloatText {
  alive: boolean;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

/** Floating text ("+30", "Zo'r!"): pops in with outBack, rises and fades */
export class FloatTextPool {
  private items: FloatText[];
  constructor(readonly capacity = 24) {
    this.items = Array.from({ length: capacity }, () => ({ alive: false, x: 0, y: 0, text: "", color: theme.palette.white, size: 1, life: 0, max: 1 }));
  }

  add(x: number, y: number, text: string, color: string, size = 1, life = 1.1) {
    let slot = this.items.find((t) => !t.alive);
    if (!slot) slot = this.items.reduce((a, b) => (a.life < b.life ? a : b));
    slot.alive = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.color = color;
    slot.size = size;
    slot.life = life;
    slot.max = life;
  }

  step(dt: number, rise = 4) {
    for (const t of this.items) {
      if (!t.alive) continue;
      t.life -= dt;
      if (t.life <= 0) t.alive = false;
      else t.y -= dt * rise * (0.4 + (t.life / t.max) * 0.9);
    }
  }

  draw(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, px: number, font: string) {
    const prevAlpha = ctx.globalAlpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const t of this.items) {
      if (!t.alive) continue;
      const age = 1 - t.life / t.max;
      const pop = ease.outBack(clamp01(age / 0.22));
      const fs = Math.max(12, px * 2.4 * t.size) * (0.55 + pop * 0.45);
      ctx.globalAlpha = prevAlpha * Math.min(1, (t.life / t.max) * 2.2);
      ctx.font = `900 ${fs.toFixed(1)}px ${font}`;
      ctx.lineWidth = Math.max(3, fs * 0.2);
      ctx.strokeStyle = theme.outline;
      ctx.strokeText(t.text, X(t.x), Y(t.y));
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, X(t.x), Y(t.y));
    }
    ctx.globalAlpha = prevAlpha;
  }
}

interface Ring {
  alive: boolean;
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  max: number;
}

/** Expanding shock rings (zone appears, seat taken) */
export class RingPool {
  private items: Ring[];
  constructor(readonly capacity = 16) {
    this.items = Array.from({ length: capacity }, () => ({ alive: false, x: 0, y: 0, r: 1, color: theme.palette.white, life: 0, max: 1 }));
  }
  add(x: number, y: number, color: string, r = 6, life = 0.6) {
    let slot = this.items.find((t) => !t.alive);
    if (!slot) slot = this.items.reduce((a, b) => (a.life < b.life ? a : b));
    Object.assign(slot, { alive: true, x, y, r, color, life, max: life });
  }
  step(dt: number) {
    for (const r of this.items) {
      if (!r.alive) continue;
      r.life -= dt;
      if (r.life <= 0) r.alive = false;
    }
  }
  draw(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, px: number) {
    const prevAlpha = ctx.globalAlpha;
    for (const rg of this.items) {
      if (!rg.alive) continue;
      const p = ease.outCubic(1 - rg.life / rg.max);
      ctx.globalAlpha = prevAlpha * (1 - p);
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = Math.max(2, px * 0.5 * (1 - p * 0.6));
      ctx.beginPath();
      ctx.arc(X(rg.x), Y(rg.y), rg.r * px * (0.3 + p * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = prevAlpha;
  }
}

/** Small, decaying screen shake (2–6 px). Disabled under reduced motion. */
export class Shake {
  private amp = 0;
  private t = 0;
  add(px: number) {
    if (reducedMotion()) return;
    this.amp = Math.min(6, Math.max(this.amp, px));
  }
  step(dt: number) {
    this.t += dt;
    this.amp = Math.max(0, this.amp - dt * 18);
  }
  get x() {
    return this.amp ? Math.sin(this.t * 61) * this.amp : 0;
  }
  get y() {
    return this.amp ? Math.cos(this.t * 47) * this.amp * 0.7 : 0;
  }
}

/**
 * Hit-stop: freezes *visual* time for 60–90 ms on impact. Only animation/effects time is frozen —
 * never the game simulation (movement, timers, network), so gameplay is unchanged.
 */
export class HitStop {
  private left = 0;
  trigger(ms = 70) {
    this.left = Math.max(this.left, Math.min(90, ms) / 1000);
  }
  /** Visual dt for this frame */
  filter(dt: number): number {
    if (this.left <= 0) return dt;
    const used = Math.min(this.left, dt);
    this.left -= used;
    return dt - used;
  }
  get active() {
    return this.left > 0;
  }
}

/** Convenience: soft drop shadow ellipse under objects (shrinks as the object rises) */
export function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, lift01 = 0) {
  const k = 1 - clamp01(lift01) * 0.45;
  ctx.fillStyle = alpha(theme.outline, 0.38 * (0.55 + k * 0.45));
  ctx.beginPath();
  ctx.ellipse(x, y, rx * k, ry * k, 0, 0, Math.PI * 2);
  ctx.fill();
}
