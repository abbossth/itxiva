// Character rig animation: an explicit state machine plus a pose solver. Pure (no DOM) — the canvas renderer
// (components/character/character-rig.ts) turns a Pose into drawn, pivoted body parts.
// Applies squash & stretch, anticipation, follow-through (springs), easing, arcs and secondary motion.

import { Spring, clamp01, ease, lerp, progress } from "./easing";

export type CharState = "idle" | "run" | "jump" | "fall" | "land" | "hit" | "celebrate" | "think" | "sad";

/** Allowed transitions. A request that isn't allowed directly goes through `idle` when idle allows it. */
export const TRANSITIONS: Record<CharState, CharState[]> = {
  idle: ["run", "jump", "hit", "celebrate", "think", "sad"],
  run: ["idle", "jump", "hit"],
  jump: ["fall", "hit"],
  fall: ["land", "hit"],
  land: ["idle", "run"],
  hit: ["idle"],
  celebrate: ["idle"],
  think: ["idle", "celebrate", "sad"],
  sad: ["idle"],
};

/** Minimum time (s) a state plays before it can be left (except to `hit`, which always interrupts) */
const MIN_TIME: Partial<Record<CharState, number>> = { hit: 0.3, land: 0.12, celebrate: 0.8, jump: 0.24, fall: 0.18, sad: 0.6 };

export type FaceKey = "idle" | "blink" | "happy" | "sad" | "hit" | "think";
export const FACE_KEYS: FaceKey[] = ["idle", "blink", "happy", "sad", "hit", "think"];

export interface Pose {
  /** Lift above the ground, fraction of character height (up = positive) */
  y: number;
  sx: number;
  sy: number;
  /** Whole-body rotation (rad) around the feet */
  lean: number;
  head: number;
  /** Head offset, fraction of height (down = positive) */
  headY: number;
  /** Arm raise outward (rad): 0 = hanging */
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  /** Cape / wings / tail follow-through (rad) */
  back: number;
  face: FaceKey;
  /** Ground shadow scale (shrinks when airborne) */
  shadow: number;
  /** Horizontal jitter, fraction of height */
  shakeX: number;
  /** Knocked over 0…1 */
  down: number;
  /** -1…1; passes 0 while turning (paper-turn) */
  facing: number;
  /** Aura pulse 0…1 */
  glow: number;
}

export interface RigInput {
  moving: boolean;
  /** Move direction x (for facing) */
  dirX?: number;
}

export interface RigOptions {
  /** Legendary skins can have their own celebration */
  celebrate?: "cheer" | "flex";
  /** Decorative amplitude (0.3 under reduced motion) */
  amp?: number;
  seed?: number;
}

const TAU = Math.PI * 2;

export class RigActor {
  state: CharState = "idle";
  /** Time in current state (s) */
  t = 0;
  /** Total time alive (s) */
  clock = 0;
  queued: CharState | null = null;
  /** Lying knocked out (kept until revive) */
  down = false;
  /** Set for one update when a foot touches the ground while running (spawn dust) */
  stepped = false;
  /** Set for one update when the character lands */
  landed = false;

  private runPhase = 0;
  private blinkIn: number;
  private blinkT = 0;
  private downT = 0;
  private fidgetIn: number;
  private fidgetT = -1;
  private facing = new Spring(1, 260, 26);
  private headLag = new Spring(0, 90, 11);
  private backLag = new Spring(0, 70, 7);
  private moving = false;
  readonly opts: Required<RigOptions>;

  constructor(opts: RigOptions = {}) {
    const seed = opts.seed ?? Math.random() * 1000;
    this.opts = { celebrate: opts.celebrate ?? "cheer", amp: opts.amp ?? 1, seed };
    this.blinkIn = 2 + rand(seed, 1) * 3;
    this.fidgetIn = 5 + rand(seed, 2) * 5;
    this.clock = rand(seed, 3) * 10;
  }

  can(next: CharState): boolean {
    return TRANSITIONS[this.state].includes(next);
  }

  /** Ask for a state. Returns true if it started now (false = queued or rejected). */
  request(next: CharState): boolean {
    if (next === this.state && next !== "celebrate" && next !== "hit") return false;
    // Knocked-out characters only react to being hit again
    if (this.down && next !== "hit" && next !== "sad") return false;
    const locked = this.t < (MIN_TIME[this.state] ?? 0);
    if (locked && next !== "hit") {
      this.queued = next;
      return false;
    }
    if (this.can(next) || (next === "hit" && this.state !== "hit")) return this.enter(next);
    if (this.state !== "idle" && TRANSITIONS[this.state].includes("idle") && TRANSITIONS.idle.includes(next)) {
      this.enter("idle");
      return this.enter(next);
    }
    if (next === this.state) return this.enter(next);
    return false;
  }

  /** Knock out: hit, then fall over and stay down */
  knockOut() {
    if (this.down) return;
    this.down = true;
    this.downT = 0;
    // Finish any turn instantly so the body doesn't freeze edge-on while lying down
    this.facingTarget = this.facing.value < 0 ? -1 : 1;
    this.facing.set(this.facingTarget);
    this.request("hit");
    this.queued = "sad";
  }

  revive() {
    this.down = false;
    this.downT = 0;
    if (this.state === "sad") this.enter("idle");
  }

  private enter(next: CharState): boolean {
    this.state = next;
    this.t = 0;
    if (next === "land") this.landed = true;
    return true;
  }

  update(dt: number, input: RigInput) {
    this.stepped = false;
    this.landed = false;
    this.t += dt;
    this.clock += dt;
    this.moving = input.moving && !this.down;
    if (this.down) this.downT += dt;
    if (input.dirX !== undefined && Math.abs(input.dirX) > 0.05 && !this.down) this.facingTarget = input.dirX < 0 ? -1 : 1;

    // Automatic transitions
    const s = this.state;
    const unlocked = this.t >= (MIN_TIME[s] ?? 0);
    if (unlocked && this.queued) {
      const q = this.queued;
      this.queued = null;
      this.request(q);
    } else if (s === "jump" && this.t >= 0.34) this.enter("fall");
    else if (s === "fall" && this.t >= 0.2) this.enter("land");
    else if (s === "land" && unlocked) this.enter(this.moving ? "run" : "idle");
    else if (s === "hit" && unlocked) this.enter(this.down ? "sad" : "idle");
    else if (s === "celebrate" && unlocked) this.enter("idle");
    else if (s === "sad" && unlocked && !this.down && (this.moving || this.t > 1.4)) this.enter("idle");
    else if (s === "think" && this.moving) this.enter("idle");
    else if (s === "idle" && this.moving) this.enter("run");
    else if (s === "run" && !this.moving) this.enter("idle");

    // Run cycle: two steps per cycle, dust on each contact
    if (this.state === "run") {
      const before = Math.floor(this.runPhase / Math.PI);
      this.runPhase += dt * 13;
      if (Math.floor(this.runPhase / Math.PI) !== before) this.stepped = true;
    }

    // Blink every 2–5 s for 120 ms
    if (this.blinkT > 0) this.blinkT -= dt;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.12;
      this.blinkIn = 2 + Math.random() * 3;
    }
    // Idle fidget (look around) after a while
    if (this.state === "idle") {
      this.fidgetIn -= dt;
      if (this.fidgetIn <= 0 && this.fidgetT < 0) this.fidgetT = 0;
    } else this.fidgetIn = 5 + Math.random() * 5;
    if (this.fidgetT >= 0) {
      this.fidgetT += dt;
      if (this.fidgetT > 1.6) {
        this.fidgetT = -1;
        this.fidgetIn = 5 + Math.random() * 6;
      }
    }

    this.facing.to(this.facingTarget, dt);
    this.lastDt = dt;
  }

  private facingTarget = 1;
  private lastDt = 1 / 60;

  /** Current pose. Pass `into` to reuse an object (no allocation per frame). */
  pose(into?: Pose): Pose {
    const a = this.opts.amp;
    const t = this.t;
    const c = this.clock + this.opts.seed;
    const p = into ?? newPose();
    p.y = 0;
    p.sx = 1;
    p.sy = 1;
    p.lean = 0;
    p.head = 0;
    p.headY = 0;
    p.armL = 0.08;
    p.armR = 0.08;
    p.legL = 0;
    p.legR = 0;
    p.back = 0;
    p.face = "idle";
    p.shadow = 1;
    p.shakeX = 0;
    p.down = 0;
    p.facing = this.facing.value;
    p.glow = 0.5 + Math.sin(c * 2.2) * 0.5;
    // Secondary motion: breathing (scaleY 1 → 1.03 over 2 s) and a slight head bob
    const breath = Math.sin((c * TAU) / 2);
    const breathe = () => {
      p.sy = 1 + 0.015 * a * (breath + 1);
      p.sx = 1 / p.sy;
      p.headY = -0.004 * a * breath;
      p.armL = 0.08 + 0.03 * a * breath;
      p.armR = 0.08 + 0.03 * a * breath;
    };

    switch (this.state) {
      case "idle": {
        breathe();
        if (this.fidgetT >= 0) {
          const f = Math.sin(clamp01(this.fidgetT / 1.6) * Math.PI);
          p.head = Math.sin(this.fidgetT * 4) * 0.12 * f * a;
        }
        break;
      }
      case "run": {
        const ph = this.runPhase;
        const s = Math.sin(ph);
        const contact = 1 - Math.abs(s);
        p.y = Math.abs(s) * 0.045 * a;
        p.sy = 1 + (Math.abs(s) * 0.05 - contact * 0.06) * a;
        p.sx = 1 / p.sy;
        p.lean = 0.07 * a;
        p.legL = s * 0.42 * a;
        p.legR = -s * 0.42 * a;
        p.armL = 0.18 + Math.max(0, -s) * 0.5 * a;
        p.armR = 0.18 + Math.max(0, s) * 0.5 * a;
        p.head = -s * 0.04 * a;
        break;
      }
      case "jump": {
        // Anticipation: crouch for 100 ms, then stretch on take-off and rise along an arc
        if (t < 0.1) {
          const k = ease.outQuad(t / 0.1);
          p.sy = 1 - 0.15 * k * a;
          p.sx = 1 + 0.15 * k * a;
          p.armL = p.armR = 0.08 - 0.1 * k;
        } else {
          const k = progress(t, 0.1, 0.24);
          p.y = ease.outCubic(k) * 0.2 * a;
          const st = 1 - k;
          p.sy = 1 + 0.15 * st * a;
          p.sx = 1 / p.sy;
          p.armL = p.armR = 0.4 + 1.6 * ease.outBack(k) * 0.5;
          p.legL = 0.12 * k;
          p.legR = -0.12 * k;
        }
        break;
      }
      case "fall": {
        const k = progress(t, 0, 0.2);
        p.y = (1 - ease.inQuad(k)) * 0.2 * a;
        p.sy = 1 + 0.07 * a;
        p.sx = 1 / p.sy;
        p.armL = p.armR = 1.1 - k * 0.6;
        break;
      }
      case "land": {
        // Landing squash, keep volume, recover with outBack
        const k = ease.outBack(progress(t, 0, 0.14));
        p.sy = lerp(1 - 0.2 * a, 1, k);
        p.sx = 1 / p.sy;
        p.armL = p.armR = lerp(0.6, 0.08, k);
        break;
      }
      case "celebrate": {
        const dur = 0.8;
        const k = clamp01(t / dur);
        if (this.opts.celebrate === "flex") {
          // Strongman pose: plant, raise both arms bent, pulse
          const up = ease.outBack(clamp01(t / 0.25));
          p.armL = p.armR = up * 2.1;
          const pulse = Math.sin(t * 18) * 0.06 * (1 - k);
          p.sx = 1 + 0.06 * up + pulse;
          p.sy = 1 / p.sx;
          p.y = Math.max(0, Math.sin(clamp01((t - 0.1) / 0.4) * Math.PI)) * 0.06 * a;
        } else {
          // Anticipation crouch, hop on an arc, arms up waving
          if (t < 0.08) {
            const q = t / 0.08;
            p.sy = 1 - 0.12 * q * a;
            p.sx = 1 / p.sy;
          } else {
            const hop = clamp01((t - 0.08) / 0.42);
            p.y = Math.sin(hop * Math.PI) * 0.16 * a;
            p.sy = 1 + (hop < 0.5 ? 0.1 * (1 - hop * 2) : 0) * a;
            p.sx = 1 / p.sy;
            if (hop >= 1) {
              const sq = progress(t, 0.5, 0.15);
              p.sy = lerp(1 - 0.14 * a, 1, ease.outBack(sq));
              p.sx = 1 / p.sy;
            }
          }
          const wave = Math.sin(t * 22) * 0.25;
          p.armL = 2.2 + wave;
          p.armR = 2.2 - wave;
        }
        p.face = "happy";
        break;
      }
      case "hit": {
        const k = progress(t, 0, 0.3);
        const decay = 1 - ease.outCubic(k);
        p.shakeX = Math.sin(t * 70) * 0.025 * decay * a;
        p.lean = -0.16 * decay;
        p.sx = 1 + 0.1 * decay;
        p.sy = 1 / p.sx;
        p.armL = p.armR = 0.9 * decay + 0.1;
        p.face = "hit";
        break;
      }
      case "think": {
        breathe();
        p.head = 0.13;
        p.armR = 2.6;
        p.face = "think";
        break;
      }
      case "sad": {
        p.sy = 0.97;
        p.sx = 1.01;
        p.headY = 0.02;
        p.head = -0.08 + Math.sin(c * 1.4) * 0.03 * a;
        p.armL = p.armR = 0.0;
        p.face = "sad";
        break;
      }
    }

    // Knocked out: topple over sideways with a little bounce, stay down
    if (this.down) {
      const k = ease.outBounce(progress(this.downT, 0.25, 0.5));
      p.down = k;
      p.face = this.state === "hit" ? "hit" : "sad";
    }

    // Follow-through: head lags body lean, back items lag motion
    const leanTarget = p.lean + (this.state === "run" ? 0.05 : 0);
    p.head += (this.headLag.to(leanTarget, this.lastDt) - leanTarget) * -0.8;
    const backTarget = this.state === "run" ? 0.28 * a : this.state === "jump" ? -0.2 * a : this.state === "fall" ? 0.25 * a : 0;
    p.back = this.backLag.to(backTarget, this.lastDt);

    if (p.face === "idle" && this.blinkT > 0) p.face = "blink";
    p.shadow = 1 - Math.min(0.5, p.y * 2.2);
    return p;
  }
}

export function newPose(): Pose {
  return { y: 0, sx: 1, sy: 1, lean: 0, head: 0, headY: 0, armL: 0.08, armR: 0.08, legL: 0, legR: 0, back: 0, face: "idle", shadow: 1, shakeX: 0, down: 0, facing: 1, glow: 0 };
}

/** Deterministic pseudo-random 0…1 from a seed (so each character moves on its own phase) */
function rand(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
