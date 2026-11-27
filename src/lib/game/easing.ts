// Shared easing set and spring helpers. Character motion never uses linear timing.

export const ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1),
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} as const;

export type EaseName = keyof typeof ease;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Progress 0…1 of `t` inside [start, start + duration] */
export const progress = (t: number, start: number, duration: number) => clamp01((t - start) / Math.max(1e-6, duration));

/** Frame-rate independent exponential smoothing toward `target` (lambda ≈ "speed", 1/s) */
export const damp = (cur: number, target: number, lambda: number, dt: number) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

/** Damped spring for follow-through parts (hair, capes, head lag). `vel` is mutated. */
export function spring(cur: number, target: number, vel: { v: number }, k = 120, d = 14, dt = 1 / 60) {
  const f = -k * (cur - target) - d * vel.v;
  vel.v += f * dt;
  return cur + vel.v * dt;
}

/** Spring value holder: `s.to(target, dt)` returns the new value */
export class Spring {
  value: number;
  private vel = { v: 0 };
  constructor(
    initial = 0,
    private k = 120,
    private d = 14
  ) {
    this.value = initial;
  }
  to(target: number, dt: number): number {
    // Sub-step large frames so the spring stays stable on slow phones
    let left = Math.min(dt, 1 / 15);
    while (left > 0) {
      const step = Math.min(left, 1 / 120);
      this.value = spring(this.value, target, this.vel, this.k, this.d, step);
      left -= step;
    }
    return this.value;
  }
  set(v: number) {
    this.value = v;
    this.vel.v = 0;
  }
}

/** Cap delta time so speed is the same on 60 Hz and 120 Hz screens and a stalled tab doesn't jump */
export const capDt = (ms: number, max = 1 / 30) => clamp(ms / 1000, 0, max);
