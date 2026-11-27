// "Kiber jang" canvas drawing: map, heroes, shots, pickups. Students and the projector see the same thing.
// Visual only — movement, shots, hits and networking live in pvp-game.tsx / lib/live-game and are unchanged.
// Style: shared ITXiva theme (indigo outlines, 3-tone shading, light from top-left); students' characters are
// animated rigs (components/character/character-rig.ts) driven by a small state machine per player.

import { DEFAULT_MAP, EMOTES, PLAYER_R, POWERS, TELEPORT_R, skinOf, type ArenaMap, type PowerKind, type Shot } from "@/lib/live-game/pvp";
import type { GameLook } from "@/lib/character/catalog";
import { characterRig, drawRig } from "@/components/character/character-rig";
import { FloatTextPool, HitStop, ParticlePool, Shake, groundShadow } from "@/lib/game/fx";
import { GAME_FONT } from "@/lib/game/font";
import { motionScale } from "@/lib/game/motion";
import { RigActor, newPose, type Pose } from "@/lib/game/rig";
import { skinFx } from "@/lib/game/skins";
import { alpha, theme, tone3 } from "@/lib/game/theme";

const A = theme.arena;
const P = theme.palette;

export const PEER_COLORS = theme.players;

interface ArenaActor {
  rig: RigActor;
  pose: Pose;
  out: boolean;
  downed: boolean;
  /** Frame counter when last updated (one update per frame even if drawn twice) */
  frame: number;
}

/**
 * Arena effects and per-player animation state. Replaces the old spark arrays: pooled particles,
 * floating text, small screen shake and hit-stop (visual time only).
 */
export class ArenaFx {
  particles = new ParticlePool(150);
  texts = new FloatTextPool(20);
  shake = new Shake();
  hitStop = new HitStop();
  actors = new Map<string, ArenaActor>();
  /** Visual dt (0 during hit-stop) */
  vdt = 0;
  /** Device px per world unit (camera scale × dpr) — picks the character bake resolution */
  pxScale = 1;
  private frame = 0;
  private pendingHit = new Set<string>();
  private pendingCheer = new Set<string>();

  step(dt: number) {
    this.frame++;
    this.vdt = this.hitStop.filter(Math.min(dt, 1 / 30));
    this.particles.step(this.vdt);
    this.texts.step(this.vdt, 70);
    this.shake.step(dt);
  }

  /** Player got hit (visual reaction on their character) */
  hit(id: string) {
    this.pendingHit.add(id);
  }

  /** Player celebrates (kill, revived, power-up) */
  cheer(id: string) {
    this.pendingCheer.add(id);
  }

  text(x: number, y: number, text: string, color: string, size = 1) {
    this.texts.add(x, y, text, color, size, 1);
  }

  dust(x: number, y: number, color: string = A.dust) {
    this.particles.emit(x, y, { kind: "dust", color, n: 1, speed: 30, dir: -Math.PI / 2, spread: 2, size: 5, grow: 18, life: 0.4, drag: 6 });
  }

  confetti(x: number, y: number, n = 20) {
    const colors = [P.accent, P.success, P.primaryLight, P.danger, P.info];
    for (const c of colors) this.particles.emit(x, y, { kind: "confetti", color: c, n: Math.ceil(n / colors.length), speed: 320, dir: -Math.PI / 2, spread: 2.2, gravity: 620, drag: 1.6, size: 6, life: 1 });
  }

  actor(id: string, look: GameLook | null, seed: number): ArenaActor {
    let a = this.actors.get(id);
    if (!a) {
      a = { rig: new RigActor({ amp: motionScale(), seed, celebrate: skinFx(look?.costume).celebrate }), pose: newPose(), out: false, downed: false, frame: -1 };
      this.actors.set(id, a);
    }
    return a;
  }

  /** Called by drawRobot: advance a player's rig once per frame from what the game state says */
  drive(id: string, a: ArenaActor, r: RobotLook) {
    if (a.frame === this.frame) return;
    a.frame = this.frame;
    const down = Boolean(r.out || r.downed);
    if (down && !(a.out || a.downed)) a.rig.knockOut();
    if (!down && (a.out || a.downed)) {
      a.rig.revive();
      a.rig.request("celebrate");
    }
    a.out = Boolean(r.out);
    a.downed = Boolean(r.downed);
    if (this.pendingHit.delete(id) || r.flash) a.rig.request("hit");
    // Celebrate only when standing still (arms-up while sliding across the map looks wrong)
    if (this.pendingCheer.delete(id) && !r.moving) a.rig.request("celebrate");
    a.rig.update(this.vdt, { moving: Boolean(r.moving) && !down, dirX: Math.cos(r.a) });
    a.rig.pose(a.pose);
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.particles.draw(ctx, ident, ident, 1);
    this.texts.draw(ctx, ident, ident, 11, GAME_FONT);
  }

  /** Forget players who left */
  keep(ids: Set<string>) {
    if (this.actors.size > ids.size + 4) for (const id of this.actors.keys()) if (!ids.has(id)) this.actors.delete(id);
  }
}

const ident = (v: number) => v;

/** Static floor: background, bases, tiles, lanes, border (drawn once) */
function drawFloorStatic(ctx: CanvasRenderingContext2D, map: ArenaMap) {
  const { w: W, h: H, theme: mt } = map;
  ctx.fillStyle = mt.floor;
  ctx.fillRect(0, 0, W, H);
  // Stars (space map)
  if (mt.stars) {
    for (let i = 0; i < 260; i++) {
      const x = (i * 7919) % W;
      const y = (i * 104729) % H;
      ctx.fillStyle = alpha(P.white, 0.15 + ((i * 37) % 60) / 100);
      ctx.fillRect(x, y, i % 9 === 0 ? 3 : 2, i % 9 === 0 ? 3 : 2);
    }
  }
  map.bases.forEach((b, i) => {
    const c = mt.bases[i % mt.bases.length];
    const g = ctx.createRadialGradient(b.x, b.y, 10, b.x, b.y, 460);
    g.addColorStop(0, `rgba(${c},0.22)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 460, b.y - 460, 920, 920);
  });
  if (mt.pattern) drawPattern(ctx, map);
  else {
    ctx.strokeStyle = mt.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = 0; y <= H; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  }
  // Light from the top-left over the whole floor, darker bottom-right (low contrast so heroes pop)
  const light = ctx.createLinearGradient(0, 0, W, H);
  light.addColorStop(0, alpha(P.white, 0.05));
  light.addColorStop(0.5, alpha(P.white, 0));
  light.addColorStop(1, alpha(theme.outline, 0.22));
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  // Main lanes (cross through the centre)
  ctx.strokeStyle = `rgba(${mt.wallEdge},0.08)`;
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(240, H / 2);
  ctx.lineTo(W - 240, H / 2);
  ctx.moveTo(W / 2, 160);
  ctx.lineTo(W / 2, H - 160);
  ctx.stroke();
  // Speed lanes: chevrons
  for (const p of map.pads) {
    ctx.fillStyle = `rgba(${mt.pad},0.14)`;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = alpha(theme.outline, 0.7);
    ctx.lineWidth = 6;
    ctx.strokeRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
    ctx.strokeStyle = `rgba(${mt.pad},0.6)`;
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
    ctx.fillStyle = `rgba(${mt.pad},0.45)`;
    const horiz = p.w >= p.h;
    const n = Math.floor((horiz ? p.w : p.h) / 60);
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(horiz ? p.x + 30 + i * 60 : p.x + p.w / 2, horiz ? p.y + p.h / 2 : p.y + 30 + i * 60);
      if (!horiz) ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-10, -12);
      ctx.lineTo(6, 0);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.shadowColor = `rgb(${mt.edge})`;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = `rgba(${mt.edge},0.95)`;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.restore();
}

/** Stable "random" (patterns look the same every time) */
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Floors of the newer maps: lava cracks, sand ripples, water waves, hex plates (drawn once) */
function drawPattern(ctx: CanvasRenderingContext2D, map: ArenaMap) {
  const { w: W, h: H, theme: mt } = map;
  ctx.save();
  if (mt.pattern === "lava") {
    for (let i = 0; i < 46; i++) {
      const cx = hash(i) * W;
      const cy = hash(i + 100) * H;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 90 + hash(i + 7) * 80);
      g.addColorStop(0, alpha(A.lava, 0.16));
      g.addColorStop(1, alpha(A.lava, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - 180, cy - 180, 360, 360);
    }
    ctx.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      let x = hash(i + 200) * W;
      let y = hash(i + 300) * H;
      ctx.strokeStyle = alpha(A.lavaCrack, 0.22 + hash(i + 9) * 0.2);
      ctx.lineWidth = 3 + hash(i + 11) * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (hash(i * 13 + k) - 0.5) * 140;
        y += (hash(i * 17 + k + 50) - 0.5) * 140;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (mt.pattern === "sand" || mt.pattern === "waves") {
    const sand = mt.pattern === "sand";
    ctx.strokeStyle = sand ? alpha(A.sand, 0.07) : alpha(A.water, 0.08);
    ctx.lineWidth = sand ? 3 : 2;
    const step = sand ? 70 : 56;
    const amp = sand ? 16 : 10;
    const period = sand ? 300 : 180;
    for (let y = step / 2, row = 0; y < H; y += step, row++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const yy = y + Math.sin(((x + row * 70) / period) * Math.PI * 2) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    if (!sand) {
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = alpha(A.waterLight, 0.03 + hash(i) * 0.04);
        ctx.beginPath();
        ctx.arc(hash(i + 40) * W, hash(i + 80) * H, 20 + hash(i + 120) * 60, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (mt.pattern === "hex") {
    const r = 46;
    const hw = Math.sqrt(3) * r;
    ctx.strokeStyle = alpha(A.hazard, 0.06);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let row = 0, y = 0; y < H + r; row++, y += r * 1.5) {
      for (let x = row % 2 ? hw / 2 : 0; x < W + hw; x += hw) {
        for (let k = 0; k <= 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
    }
    ctx.stroke();
    ctx.fillStyle = alpha(A.hazard, 0.1);
    for (let x = 0; x < W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x + 40, 14);
      ctx.lineTo(x + 20, 40);
      ctx.lineTo(x - 20, 40);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, H - 14);
      ctx.lineTo(x + 40, H - 14);
      ctx.lineTo(x + 20, H - 40);
      ctx.lineTo(x - 20, H - 40);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Animated floor: centre pulse, teleports and speed-lane shimmer */
function drawFloorLive(ctx: CanvasRenderingContext2D, t: number, map: ArenaMap) {
  const m = motionScale();
  const pulse = 0.14 + Math.sin(t * 2) * 0.05 * m;
  ctx.fillStyle = `rgba(${map.theme.edge},${pulse.toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(map.w / 2, map.h / 2, 160 + Math.sin(t * 2) * 10 * m, 0, Math.PI * 2);
  ctx.fill();
  for (const p of map.pads) {
    const horiz = p.w >= p.h;
    const k = (t * 0.9) % 1;
    ctx.fillStyle = `rgba(${map.theme.pad},0.35)`;
    if (horiz) ctx.fillRect(p.x + k * (p.w - 40), p.y, 40, p.h);
    else ctx.fillRect(p.x, p.y + k * (p.h - 40), p.w, 40);
  }
  for (const tp of map.teleports) {
    for (const p of [tp.a, tp.b]) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = alpha(theme.outline, 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, TELEPORT_R + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tp.color;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, TELEPORT_R - i * 9, t * (2 + i) + i, t * (2 + i) + i + Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      ctx.fillStyle = tp.color;
      ctx.globalAlpha = 0.25 + Math.sin(t * 5) * 0.1;
      ctx.beginPath();
      ctx.arc(0, 0, TELEPORT_R - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Static map layers are pre-rendered: each frame only stamps ready images (fast on phones) */
export interface MapLayers {
  base: HTMLCanvasElement;
  top: HTMLCanvasElement;
  map: ArenaMap;
}
const LAYER_Q = 0.6;
export function makeMapLayers(map: ArenaMap = DEFAULT_MAP, q = LAYER_Q): MapLayers {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = Math.round(map.w * q);
    c.height = Math.round(map.h * q);
    const x = c.getContext("2d")!;
    x.scale(q, q);
    return { c, x };
  };
  const base = mk();
  drawFloorStatic(base.x, map);
  drawWalls(base.x, map);
  const top = mk();
  drawBushes(top.x, 0, map);
  return { base: base.c, top: top.c, map };
}

export function drawFloor(ctx: CanvasRenderingContext2D, t: number, layers: MapLayers) {
  const map = layers.map;
  ctx.fillStyle = A.void;
  ctx.fillRect(-800, -800, map.w + 1600, map.h + 1600);
  ctx.drawImage(layers.base, 0, 0, map.w, map.h);
  drawFloorLive(ctx, t, map);
}

export function drawTop(ctx: CanvasRenderingContext2D, _t: number, layers: MapLayers) {
  ctx.drawImage(layers.top, 0, 0, layers.map.w, layers.map.h);
}

/** Vote card: the whole map as a small picture */
export function drawMapPreview(canvas: HTMLCanvasElement, map: ArenaMap) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const k = Math.min(canvas.width / map.w, canvas.height / map.h);
  ctx.setTransform(k, 0, 0, k, (canvas.width - map.w * k) / 2, (canvas.height - map.h * k) / 2);
  drawFloorStatic(ctx, map);
  drawWalls(ctx, map);
  drawFloorLive(ctx, 0.6, map);
  drawBushes(ctx, 0, map);
}

/** Walls and crates: indigo outline, glowing edge, bevel (light top-left, shade bottom-right) */
export function drawWalls(ctx: CanvasRenderingContext2D, map: ArenaMap = DEFAULT_MAP) {
  const th = map.theme;
  ctx.save();
  for (const w of map.walls) {
    const box = w.w === w.h;
    // Drop shadow toward bottom-right
    ctx.fillStyle = alpha(theme.outline, 0.45);
    ctx.fillRect(w.x + 8, w.y + 10, w.w, w.h);
    ctx.fillStyle = box ? th.box : th.wall;
    ctx.shadowColor = `rgb(${box ? th.boxEdge : th.wallEdge})`;
    ctx.shadowBlur = 16;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.shadowBlur = 0;
    // Bevel
    ctx.lineWidth = 4;
    ctx.strokeStyle = alpha(P.white, 0.16);
    ctx.beginPath();
    ctx.moveTo(w.x + 6, w.y + w.h - 6);
    ctx.lineTo(w.x + 6, w.y + 6);
    ctx.lineTo(w.x + w.w - 6, w.y + 6);
    ctx.stroke();
    ctx.strokeStyle = alpha(theme.outline, 0.35);
    ctx.beginPath();
    ctx.moveTo(w.x + w.w - 6, w.y + 6);
    ctx.lineTo(w.x + w.w - 6, w.y + w.h - 6);
    ctx.lineTo(w.x + 6, w.y + w.h - 6);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${box ? th.boxEdge : th.wallEdge},0.9)`;
    ctx.lineWidth = 4;
    ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    ctx.strokeStyle = theme.outline;
    ctx.lineWidth = 3;
    ctx.strokeRect(w.x - 1.5, w.y - 1.5, w.w + 3, w.h + 3);
    if (box) {
      ctx.strokeStyle = `rgba(${th.boxEdge},0.35)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w.x + 8, w.y + 8);
      ctx.lineTo(w.x + w.w - 8, w.y + w.h - 8);
      ctx.moveTo(w.x + w.w - 8, w.y + 8);
      ctx.lineTo(w.x + 8, w.y + w.h - 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Bushes: leafy blobs with a soft dark rim and a top-left highlight */
export function drawBushes(ctx: CanvasRenderingContext2D, t: number, map: ArenaMap = DEFAULT_MAP) {
  const colors = map.theme.bush;
  ctx.save();
  for (const b of map.bushes) {
    const n = Math.round((b.w * b.h) / 2600);
    const blobs: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
      const fx = ((i * 73) % 97) / 97;
      const fy = ((i * 41) % 89) / 89;
      blobs.push({ x: b.x + 18 + fx * (b.w - 36), y: b.y + 18 + fy * (b.h - 36), r: 26 + ((i * 13) % 14) + Math.sin(t * 2 + i) * 1.5 });
    }
    ctx.fillStyle = alpha(theme.outline, 0.6);
    for (const bl of blobs) {
      ctx.beginPath();
      ctx.arc(bl.x + 2, bl.y + 3, bl.r + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    blobs.forEach((bl, i) => {
      ctx.fillStyle = colors[i % 3];
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = alpha(P.white, 0.08);
    for (const bl of blobs) {
      ctx.beginPath();
      ctx.arc(bl.x - bl.r * 0.3, bl.y - bl.r * 0.35, bl.r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Power-up: outlined 3-tone orb, bobs 4 px over 1.5 s, rotating ring and a shine sweep */
export function drawPickup(ctx: CanvasRenderingContext2D, p: { x: number; y: number; kind: PowerKind }, t: number) {
  const def = POWERS[p.kind];
  const m = motionScale();
  const bob = Math.sin((t * Math.PI * 2) / 1.5 + p.x) * 4 * m;
  const tones = tone3(def.color);
  groundShadow(ctx, p.x, p.y + 30, 22, 7, (bob + 4) / 16);
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(-8, -9, 2, 0, 0, 26);
  g.addColorStop(0, tones.light);
  g.addColorStop(0.55, alpha(def.color, 0.55));
  g.addColorStop(1, alpha(tones.shadow, 0.95));
  ctx.fillStyle = alpha(theme.outline, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.outline;
  ctx.stroke();
  ctx.strokeStyle = tones.light;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 32, t * 3, t * 3 + Math.PI * 1.2);
  ctx.stroke();
  ctx.lineCap = "butt";
  // Shine sweep
  const sw = ((t * 0.7 + p.x * 0.001) % 1.8) - 0.4;
  if (sw > 0 && sw < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = alpha(P.white, 0.4);
    ctx.translate(-26 + sw * 52, 0);
    ctx.rotate(0.5);
    ctx.fillRect(-4, -40, 8, 80);
    ctx.restore();
  }
  ctx.font = `26px ${GAME_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = P.white;
  ctx.fillText(def.icon, 0, 2);
  ctx.restore();
}

export function drawShot(ctx: CanvasRenderingContext2D, s: Shot, color: string) {
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = tone3(color).light;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineCap = "butt";
}

export interface RobotLook {
  x: number;
  y: number;
  a: number;
  skin: string;
  shield?: boolean;
  powers?: PowerKind[];
  /** Just got hit */
  flash?: boolean;
  /** In a bush (semi-transparent) */
  ghost?: boolean;
  /** Downed (team arena, waiting for a revive) */
  downed?: boolean;
  out?: boolean;
  moving?: boolean;
  /** Scale-up (the projector shows the whole map small) */
  size?: number;
  /** Team ring on the ground */
  ring?: string | null;
  /** Just fired (muzzle flash + recoil) */
  fired?: boolean;
  /** Dashing — trail and stretch */
  dash?: boolean;
  /** Student character — drawn as an animated rig instead of the robot */
  look?: GameLook | null;
  /** Player id (for the character rig state) */
  id?: string;
}

export function drawRobot(ctx: CanvasRenderingContext2D, r: RobotLook, t: number, fx?: ArenaFx) {
  const skin = skinOf(r.skin);
  const R = PLAYER_R;
  const size = r.size ?? 1;
  ctx.save();
  ctx.translate(r.x, r.y);
  if (size !== 1) ctx.scale(size, size);
  const baseAlpha = r.out ? 0.35 : r.ghost ? 0.45 : 1;
  ctx.globalAlpha = baseAlpha;
  const trailColor = r.look ? skinFx(r.look.costume).trail ?? skin.body : skin.body;
  // Dash trail
  if (r.dash && !r.out) {
    ctx.fillStyle = trailColor;
    for (let i = 1; i <= 4; i++) {
      ctx.globalAlpha = baseAlpha * (0.28 - i * 0.05);
      ctx.beginPath();
      ctx.arc(-Math.cos(r.a) * i * 16, -Math.sin(r.a) * i * 16, R - i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = baseAlpha;
  }
  const seed = (r.x * 0.013 + r.y * 0.007) % 6.28;
  // Speed trail
  if (r.powers?.includes("speed") && !r.out) {
    ctx.fillStyle = alpha(A.muzzle, 0.35);
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(-Math.cos(r.a) * i * 12, -Math.sin(r.a) * i * 12, R - i * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Team ring on the ground
  if (r.ring && !r.out) {
    ctx.strokeStyle = alpha(theme.outline, 0.8);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.9, R + 10, R * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = r.ring;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  const lookReady = r.look !== undefined;
  const H = R * 3.2;
  const rig = lookReady && fx ? characterRig(r.look ?? null, H * size * fx.pxScale) : null;
  if (rig && fx && r.id) {
    const actor = fx.actor(r.id, r.look ?? null, seed * 31 + R);
    fx.drive(r.id, actor, r);
    const pose = actor.pose;
    groundShadow(ctx, 2, R * 0.95, R * 0.95, R * 0.35, pose.y * 2.4);
    // Dash: stretch along the motion, keep volume
    if (r.dash && !r.out) {
      pose.sx *= 1.16;
      pose.sy /= 1.16;
    }
    // Recoil: lean back a touch when firing
    if (r.fired && !r.out) pose.lean -= 0.05;
    const aimUp = Math.sin(r.a) < 0;
    if (aimUp && !(r.out || r.downed)) drawGun(ctx, r, R, H, pose);
    drawRig(ctx, rig, pose, 0, R * 0.95, H, { alpha: 1, t, fallDir: Math.cos(r.a) < 0 ? 1 : -1 });
    if (!aimUp && !(r.out || r.downed)) drawGun(ctx, r, R, H, pose);
    if (r.flash) {
      ctx.fillStyle = alpha(P.white, 0.4);
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.6, R * 1.1, R * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (r.shield && !r.out) drawShieldBubble(ctx, 0, -R * 0.5, R + 18, t);
    ctx.restore();
    return;
  }

  // ---- Robot fallback (while the character is loading) ----
  ctx.fillStyle = alpha(theme.outline, 0.4);
  ctx.beginPath();
  ctx.ellipse(4, R * 0.9, R * 0.9, R * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  const m = motionScale();
  const bob = r.out ? 0 : r.moving ? -Math.abs(Math.sin(t * 16)) * 3 * m : Math.sin(t * 2.6 + seed) * 1.4 * m;
  const breathe = r.out ? 1 : 1 + Math.sin(t * 2.6 + seed) * 0.03 * m;
  ctx.translate(0, bob);
  ctx.scale(breathe, 1 / breathe);
  ctx.rotate(r.a);
  if (r.moving && !r.out) ctx.rotate(Math.sin(t * 16) * 0.06 * m);
  const step = r.moving ? Math.sin(t * 18) * 5 : 0;
  ctx.fillStyle = skin.accent;
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 2;
  for (const [dx, dy] of [
    [step, -R - 4],
    [-step, R - 4],
  ]) {
    ctx.beginPath();
    ctx.roundRect(-R * 0.6 + dx, dy, R * 0.9, 8, 3);
    ctx.fill();
    ctx.stroke();
  }
  const triple = r.powers?.includes("triple");
  const rapid = r.powers?.includes("rapid");
  ctx.fillStyle = rapid ? A.gunHot : A.gun;
  for (const da of triple ? [-0.35, 0, 0.35] : [0]) {
    ctx.save();
    ctx.rotate(da);
    ctx.beginPath();
    ctx.roundRect(R - 6, -5, 22, 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (r.fired && !r.out) muzzleFlash(ctx, R + 20, 0);
  // Body (3-tone, outlined)
  const tones = tone3(r.out ? theme.palette.mutedDark : skin.body);
  const body = ctx.createLinearGradient(-R, -R, R, R);
  body.addColorStop(0, r.flash ? P.white : tones.light);
  body.addColorStop(0.5, r.flash ? P.white : tones.base);
  body.addColorStop(1, tones.shadow);
  ctx.fillStyle = body;
  ctx.beginPath();
  if (skin.shape === "square") ctx.roundRect(-R, -R, R * 2, R * 2, 8);
  else if (skin.shape === "hex") {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      ctx.lineTo(Math.cos(ang) * (R + 2), Math.sin(ang) * (R + 2));
    }
    ctx.closePath();
  } else ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = A.visor;
  ctx.beginPath();
  ctx.roundRect(R * 0.05, -R * 0.55, R * 0.75, R * 1.1, 6);
  ctx.fill();
  if (r.out) {
    ctx.strokeStyle = A.gunLight;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const ey of [-R * 0.25, R * 0.25]) {
      ctx.moveTo(R * 0.5 - 4, ey - 4);
      ctx.lineTo(R * 0.5 + 4, ey + 4);
      ctx.moveTo(R * 0.5 + 4, ey - 4);
      ctx.lineTo(R * 0.5 - 4, ey + 4);
    }
    ctx.stroke();
  } else {
    const blink = Math.sin(t * 1.7 + seed * 3) > 0.985 ? 0.15 : 1;
    ctx.fillStyle = r.flash ? A.eyeHurt : A.eye;
    ctx.beginPath();
    ctx.ellipse(R * 0.5, -R * 0.25, 4, 5 * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(R * 0.5, R * 0.25, 4, 5 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-R * 0.4, 0);
  ctx.lineTo(-R - 6, Math.sin(t * 6) * 4);
  ctx.stroke();
  ctx.fillStyle = r.out ? A.gunLight : A.antenna;
  ctx.beginPath();
  ctx.arc(-R - 6, Math.sin(t * 6) * 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-r.a);
  if (r.shield && !r.out) drawShieldBubble(ctx, 0, 0, R + 14, t);
  ctx.restore();
}

function muzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = alpha(A.muzzle, 0.95);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? 14 : 6;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.white;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Blaster held at hand height, pointing at the aim; kicks back on each shot */
function drawGun(ctx: CanvasRenderingContext2D, r: RobotLook, R: number, H: number, pose: Pose) {
  ctx.save();
  ctx.translate(pose.shakeX * H, -R * 0.55 - pose.y * H);
  ctx.rotate(r.a);
  const kick = r.fired ? -5 : 0;
  const triple = r.powers?.includes("triple");
  const tones = tone3(r.powers?.includes("rapid") ? A.gunHot : A.gun);
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  for (const da of triple ? [-0.3, 0, 0.3] : [0]) {
    ctx.save();
    ctx.rotate(da);
    const g = ctx.createLinearGradient(0, -6, 0, 6);
    g.addColorStop(0, tones.light);
    g.addColorStop(0.5, tones.base);
    g.addColorStop(1, tones.shadow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(R * 0.2 + kick, -5.5, 28, 11, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = A.myShot;
    ctx.fillRect(R * 0.2 + kick + 22, -2, 4, 4);
    ctx.restore();
  }
  if (r.fired && !r.out) muzzleFlash(ctx, R * 0.2 + 32, 0);
  ctx.restore();
}

/**
 * Shield: its own look, unlike any team color — white-gold glow, rotating rainbow rim,
 * hexagonal energy mesh, a gold shield badge on top and orbiting sparkles.
 */
export function drawShieldBubble(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number) {
  const pulse = 1 + Math.sin(t * 6) * 0.04 * motionScale();
  const rr = radius * pulse;
  ctx.save();
  ctx.translate(cx, cy);
  const glow = ctx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr * 1.15);
  glow.addColorStop(0, alpha(P.white, 0.05));
  glow.addColorStop(0.75, alpha(A.shieldGlow, 0.18));
  glow.addColorStop(1, alpha(A.shieldGlow, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, rr * 1.15, 0, Math.PI * 2);
  ctx.fill();
  const rim: CanvasGradient | string =
    typeof ctx.createConicGradient === "function"
      ? (() => {
          const cg = ctx.createConicGradient(t * 2.2, 0, 0);
          A.shieldRim.forEach((c, i, a) => cg.addColorStop(i / (a.length - 1), c));
          return cg;
        })()
      : A.shieldRim[0];
  ctx.strokeStyle = rim;
  ctx.lineWidth = 5;
  ctx.shadowColor = alpha(A.shieldRim[0], 0.95);
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  const hex = (r: number, rot: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  };
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = alpha(P.white, 0.45 + Math.sin(t * 5) * 0.2);
  hex(rr * 0.86, t * 0.9);
  ctx.stroke();
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = alpha(A.shieldRim[0], 0.6);
  hex(rr * 0.7, -t * 1.3);
  ctx.stroke();
  ctx.setLineDash([]);
  // Gold shield badge
  ctx.save();
  ctx.translate(0, -rr - 4);
  const s = Math.max(7, rr * 0.22);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.9, -s * 0.85, s * 0.9, -s * 0.35);
  ctx.quadraticCurveTo(s * 0.85, s * 0.55, 0, s);
  ctx.quadraticCurveTo(-s * 0.85, s * 0.55, -s * 0.9, -s * 0.35);
  ctx.quadraticCurveTo(-s * 0.9, -s * 0.85, 0, -s);
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, -s, 0, s);
  sg.addColorStop(0, A.shieldGoldLight);
  sg.addColorStop(0.5, A.shieldGold);
  sg.addColorStop(1, A.shieldGoldDark);
  ctx.fillStyle = sg;
  ctx.shadowColor = alpha(A.shieldGold, 0.9);
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = alpha(P.white, 0.85);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(0, s * 0.5);
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 4; i++) {
    const a = t * 2.6 + (i / 4) * Math.PI * 2;
    const tw = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.7);
    ctx.fillStyle = alpha(P.white, 0.5 + tw * 0.5);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.6 + tw * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Emoji reaction bubble (above the name); pops in with a little bounce */
export function drawEmote(ctx: CanvasRenderingContext2D, emote: number, x: number, y: number, t: number, size = 1) {
  const e = EMOTES[emote];
  if (!e) return;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 6) * 3 * motionScale());
  ctx.scale(size, size);
  const bubble = () => {
    ctx.beginPath();
    ctx.roundRect(-26, -26, 52, 46, 16);
    ctx.moveTo(-7, 19);
    ctx.lineTo(0, 30);
    ctx.lineTo(7, 19);
  };
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.strokeStyle = theme.outline;
  bubble();
  ctx.stroke();
  ctx.fillStyle = P.white;
  bubble();
  ctx.fill();
  ctx.font = `30px ${GAME_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, 0, -2);
  ctx.restore();
}

/** Name pill and health above the hero */
export function nameTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, lives: number, maxLives: number, size = 1) {
  ctx.save();
  if (size !== 1) {
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.translate(-x, -y);
  }
  ctx.font = `800 20px ${GAME_FONT}`;
  const label = text.length > 16 ? `${text.slice(0, 15)}…` : text;
  const w = ctx.measureText(label).width + 20;
  ctx.fillStyle = theme.outline;
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 2, y - 32, w + 4, 30, 15);
  ctx.fill();
  ctx.fillStyle = alpha(theme.outline, 0.6);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 30, w, 26, 13);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = P.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y - 16);
  // Health: 0 — hidden; HP (projector) — thin bar; old battles — hearts
  if (maxLives <= 0) {
    ctx.restore();
    return;
  }
  if (maxLives > 10) {
    const bw = 64;
    const k = Math.max(0, Math.min(1, lives / maxLives));
    ctx.fillStyle = theme.outline;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2 - 2, y, bw + 4, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = k > 0.6 ? A.hpGood : k > 0.3 ? A.hpMid : A.hpLow;
    if (k > 0) {
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, y + 2, Math.max(5, bw * k), 5, 2.5);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const n = Math.max(maxLives, lives);
  const gap = 15;
  const start = x - ((n - 1) * gap) / 2;
  ctx.font = `13px ${GAME_FONT}`;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = i < lives ? 1 : 0.25;
    ctx.fillStyle = i < lives ? A.hpLow : P.muted;
    ctx.fillText("❤", start + i * gap, y + 6);
  }
  ctx.restore();
}

export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

/** Impact burst (pooled): streak sparks plus round bits */
export function burst(fx: ArenaFx, x: number, y: number, color: string, n = 14) {
  const half = Math.ceil(n / 2);
  fx.particles.emit(x, y, { kind: "spark", color, n: half, speed: 380, size: 4, life: 0.55, drag: 6 });
  fx.particles.emit(x, y, { kind: "dot", color, n: n - half, speed: 260, size: 3.4, life: 0.6, drag: 6 });
}

export function stepSparks(fx: ArenaFx, dt: number) {
  fx.step(dt);
}

export function drawSparks(ctx: CanvasRenderingContext2D, fx: ArenaFx) {
  fx.draw(ctx);
}

/** Server's "other players' shots": add each once, moved forward by its age */
export function spawnForeignShots(
  into: Shot[],
  seen: Map<string, number>,
  peers: { id: string; shots: { id: number; x: number; y: number; a: number; age: number }[] }[],
  now: number,
  speed: number,
  range: number
) {
  for (const p of peers) {
    for (const s of p.shots) {
      const key = `${p.id}:${s.id}`;
      if (seen.has(key)) continue;
      seen.set(key, now);
      // Flown too far already — skip; otherwise fly it from the start (so it doesn't pass through walls)
      if ((s.age / 1000) * speed > range * 0.8) continue;
      into.push({ id: s.id, owner: p.id, x: s.x, y: s.y, vx: Math.cos(s.a) * speed, vy: Math.sin(s.a) * speed, dist: 0 });
    }
  }
  if (seen.size > 600) for (const [k, at] of seen) if (now - at > 3000) seen.delete(k);
}

/** Shrinking zone (big screen): purple storm outside, glowing edge and the next circle */
export function drawZone(ctx: CanvasRenderingContext2D, zone: { x: number; y: number; r: number; tx: number; ty: number; tr: number }, t: number, map: { w: number; h: number }) {
  const m = motionScale();
  ctx.save();
  ctx.beginPath();
  ctx.rect(-600, -600, map.w + 1200, map.h + 1200);
  ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2, true);
  ctx.fillStyle = alpha(A.storm, 0.2 + Math.sin(t * 2) * 0.04 * m);
  ctx.fill("evenodd");
  ctx.lineWidth = 6;
  ctx.strokeStyle = alpha(A.stormEdge, 0.75 + Math.sin(t * 6) * 0.2 * m);
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
  ctx.stroke();
  if (zone.tr < zone.r - 2) {
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -t * 30;
    ctx.lineWidth = 3;
    ctx.strokeStyle = alpha(P.white, 0.7);
    ctx.beginPath();
    ctx.arc(zone.tx, zone.ty, zone.tr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

