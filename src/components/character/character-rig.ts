"use client";

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { DEFAULT_LOOK, tierOf, type GameLook } from "@/lib/character/catalog";
import { FACE_KEYS, type FaceKey, type Pose } from "@/lib/game/rig";
import { skinFx } from "@/lib/game/skins";
import { theme } from "@/lib/game/theme";
import { CharacterSvgDrawing as CharacterSvg, type CharMood, type RigLayer } from "./character-svg";

// Canvas character rig. The student's SVG character is baked ONCE into a small atlas of separate parts
// (legs, torso, arms, back item, pet, aura and one head per face expression), each with a dark-indigo outline.
// Every frame the parts are drawn around their pivots (hip, shoulder, neck) from a Pose — so limbs swing,
// the body squashes and stretches and the face changes, while drawing stays cheap (a few drawImage calls).

type Box = { x: number; y: number; w: number; h: number };
type PartKey = Exclude<RigLayer, "head"> | `head:${FaceKey}`;

/** Part bounds in the SVG viewBox (0 0 100 124) — generous enough for every item the part can hold */
const BOXES: Record<RigLayer, Box> = {
  aura: { x: -4, y: -4, w: 108, h: 124 },
  back: { x: -2, y: 44, w: 104, h: 74 },
  legL: { x: 32, y: 91, w: 21, h: 22 },
  legR: { x: 47, y: 91, w: 21, h: 22 },
  torso: { x: 26, y: 45, w: 48, h: 53 },
  armL: { x: 18, y: 54, w: 20, h: 44 },
  armR: { x: 50, y: 34, w: 48, h: 70 },
  head: { x: 12, y: -6, w: 76, h: 70 },
  pet: { x: -6, y: 76, w: 36, h: 40 },
};

const PIVOT = {
  legL: [42.2, 94],
  legR: [57.8, 94],
  armL: [28.6, 59.5],
  armR: [71.4, 59.5],
  head: [50, 56],
  back: [50, 62],
} as const;

/** Soles of the shoes in viewBox units: the rig's root pivot */
const FEET_X = 50;
const FEET_Y = 111;
const FRAME_H = 124;

const FACE_MOODS: Record<FaceKey, { mood: CharMood; blink?: boolean }> = {
  idle: { mood: "idle" },
  blink: { mood: "idle", blink: true },
  happy: { mood: "cheer" },
  sad: { mood: "sad" },
  hit: { mood: "hit" },
  think: { mood: "think" },
};

const BODY_LAYERS: Exclude<RigLayer, "head">[] = ["aura", "back", "legL", "legR", "torso", "armL", "armR", "pet"];

export interface RigSprite {
  atlas: HTMLCanvasElement;
  parts: Partial<Record<PartKey, { sx: number; sy: number; sw: number; sh: number }>>;
  /** Celebration style + skin effects */
  fx: ReturnType<typeof skinFx>;
  tierGlow: string;
}

/** Bake resolutions (px per viewBox unit) — the smallest one that is sharp enough is used */
const BUCKETS = [0.5, 1, 1.6];

const cache = new Map<string, RigSprite | "loading" | "failed">();
const queue: { key: string; look: Partial<GameLook>; p: number }[] = [];
let pumping = false;

/** Rig for a look at a display height (device px). Returns null until baked; baking is queued and spread over frames. */
export function characterRig(look: Partial<GameLook> | null | undefined, displayH: number): RigSprite | null {
  if (typeof document === "undefined") return null;
  const need = displayH / FRAME_H;
  const p = BUCKETS.find((b) => b >= need) ?? BUCKETS[BUCKETS.length - 1];
  const l = look ?? DEFAULT_LOOK;
  const key = `${p}:${JSON.stringify(l)}`;
  const c = cache.get(key);
  if (c && c !== "loading" && c !== "failed") return c;
  if (!c) {
    cache.set(key, "loading");
    queue.push({ key, look: l, p });
    void pump();
  }
  // While a sharper bake is pending, a smaller one already baked is better than nothing
  for (const b of BUCKETS) {
    const other = cache.get(`${b}:${JSON.stringify(l)}`);
    if (other && other !== "loading" && other !== "failed") return other;
  }
  return null;
}

const idle = () =>
  new Promise<void>((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 120 });
    else setTimeout(resolve, 16);
  });

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        cache.set(job.key, await bake(job.look, job.p));
      } catch {
        cache.set(job.key, "failed");
      }
      await idle();
    }
  } finally {
    pumping = false;
  }
}

function renderSvg(look: Partial<GameLook>, mood: CharMood, blink: boolean): SVGSVGElement {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(CharacterSvg, { look, size: 100, still: true, pedestal: false, mood, blink })));
  const svg = host.querySelector("svg");
  root.unmount();
  if (!svg) throw new Error("no svg");
  return svg as SVGSVGElement;
}

/** Keep only `layer` (plus <defs>): drop every other drawable element */
function prune(node: Element, layer: RigLayer) {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "defs" || tag === "title") continue;
    const own = child.getAttribute("data-layer");
    if (own) {
      if (own !== layer) child.remove();
      continue;
    }
    if (child.querySelector(`[data-layer="${layer}"]`)) prune(child, layer);
    else child.remove();
  }
}

function layerImage(src: SVGSVGElement, layer: RigLayer, p: number): Promise<HTMLImageElement> | null {
  const svg = src.cloneNode(true) as SVGSVGElement;
  prune(svg, layer);
  const kept = Array.from(svg.querySelectorAll(`[data-layer="${layer}"]`));
  if (!kept.some((k) => k.querySelector("path, circle, ellipse, rect, polygon, line, text"))) return null;
  const b = BOXES[layer];
  const ns = "http://www.w3.org/2000/svg";
  svg.setAttribute("xmlns", ns);
  svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.w} ${b.h}`);
  svg.setAttribute("width", String(Math.ceil(b.w * p)));
  svg.setAttribute("height", String(Math.ceil(b.h * p)));
  svg.removeAttribute("class");
  svg.removeAttribute("style");
  // Shared outline: dilate the silhouette and fill it with the theme outline color (aura stays soft)
  if (layer !== "aura") {
    const outlinePx = p <= 0.5 ? 0.9 : p <= 1 ? 1.2 : 1.6;
    let defs = svg.querySelector(":scope > defs");
    if (!defs) {
      defs = document.createElementNS(ns, "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    const f = document.createElementNS(ns, "filter");
    f.setAttribute("id", "rigOutline");
    f.setAttribute("x", "-10%");
    f.setAttribute("y", "-10%");
    f.setAttribute("width", "120%");
    f.setAttribute("height", "120%");
    f.innerHTML = `<feMorphology in="SourceAlpha" operator="dilate" radius="${(outlinePx / p).toFixed(2)}" result="d"/><feFlood flood-color="${theme.outline}"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>`;
    defs.appendChild(f);
    const g = document.createElementNS(ns, "g");
    g.setAttribute("filter", "url(#rigOutline)");
    for (const child of Array.from(svg.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag !== "defs" && tag !== "title") g.appendChild(child);
    }
    svg.appendChild(g);
  }
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.decoding = "async";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return img.decode().then(() => img);
}

async function bake(look: Partial<GameLook>, p: number): Promise<RigSprite> {
  const jobs: { key: PartKey; img: Promise<HTMLImageElement> }[] = [];
  const base = renderSvg(look, "idle", false);
  for (const layer of BODY_LAYERS) {
    const img = layerImage(base, layer, layer === "aura" ? p * 0.5 : p);
    if (img) jobs.push({ key: layer, img });
  }
  for (const face of FACE_KEYS) {
    await idle();
    const v = FACE_MOODS[face];
    const svg = face === "idle" ? base : renderSvg(look, v.mood, Boolean(v.blink));
    const img = layerImage(svg, "head", p);
    if (img) jobs.push({ key: `head:${face}`, img });
  }
  const imgs = await Promise.all(jobs.map((j) => j.img));
  // Pack horizontally into one atlas canvas
  const pad = 2;
  let w = pad;
  let h = 0;
  for (const im of imgs) {
    w += im.width + pad;
    h = Math.max(h, im.height);
  }
  const atlas = document.createElement("canvas");
  atlas.width = Math.max(1, w);
  atlas.height = Math.max(1, h + pad * 2);
  const ctx = atlas.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  const parts: RigSprite["parts"] = {};
  let x = pad;
  imgs.forEach((im, i) => {
    ctx.drawImage(im, x, pad);
    parts[jobs[i].key] = { sx: x, sy: pad, sw: im.width, sh: im.height };
    x += im.width + pad;
  });
  const l = { ...DEFAULT_LOOK, ...look } as GameLook;
  return { atlas, parts, fx: skinFx(l.costume), tierGlow: tierOf(l.level ?? 1).light };
}

export interface RigDrawOptions {
  alpha?: number;
  /** Seconds — for pet hop and idle particles */
  t: number;
  /** Fall direction when knocked out */
  fallDir?: 1 | -1;
}

/**
 * Draw a rigged character. (cx, by) — point under the feet; h — full frame height in px
 * (same sizing as the old single sprite, so layouts don't change).
 */
export function drawRig(ctx: CanvasRenderingContext2D, rig: RigSprite, pose: Pose, cx: number, by: number, h: number, o: RigDrawOptions) {
  const u = h / FRAME_H;
  const prevAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.globalAlpha = prevAlpha * (o.alpha ?? 1);
  ctx.translate(cx + pose.shakeX * h, by - pose.y * h);
  const face = pose.facing < 0 ? Math.min(-0.12, pose.facing) : Math.max(0.12, pose.facing);
  if (pose.down > 0) ctx.rotate(pose.down * 1.38 * (o.fallDir ?? 1));
  if (pose.lean) ctx.rotate(pose.lean * Math.sign(face));
  ctx.scale(pose.sx * face, pose.sy);

  const part = (key: PartKey, box: Box, pivot?: readonly [number, number], rot = 0, dy = 0) => {
    const s = rig.parts[key];
    if (!s) return;
    if (!pivot || (!rot && !dy)) {
      ctx.drawImage(rig.atlas, s.sx, s.sy, s.sw, s.sh, (box.x - FEET_X) * u, (box.y - FEET_Y) * u + dy * h, box.w * u, box.h * u);
      return;
    }
    const px = (pivot[0] - FEET_X) * u;
    const py = (pivot[1] - FEET_Y) * u + dy * h;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.drawImage(rig.atlas, s.sx, s.sy, s.sw, s.sh, (box.x - pivot[0]) * u, (box.y - pivot[1]) * u, box.w * u, box.h * u);
    ctx.restore();
  };

  // Aura (level / legendary skin): soft pulse behind the body
  if (rig.parts.aura) {
    const k = 0.96 + pose.glow * 0.06;
    ctx.save();
    ctx.globalAlpha *= 0.7 + pose.glow * 0.3;
    ctx.translate(0, (62 - FEET_Y) * u);
    ctx.scale(k, k);
    ctx.translate(0, -(62 - FEET_Y) * u);
    part("aura", BOXES.aura);
    ctx.restore();
  }
  part("back", BOXES.back, PIVOT.back, pose.back * 0.6);
  part("legL", BOXES.legL, PIVOT.legL, pose.legL);
  part("legR", BOXES.legR, PIVOT.legR, pose.legR);
  part("torso", BOXES.torso);
  part("armL", BOXES.armL, PIVOT.armL, pose.armL);
  part("armR", BOXES.armR, PIVOT.armR, -pose.armR);
  const headKey: PartKey = rig.parts[`head:${pose.face}`] ? `head:${pose.face}` : "head:idle";
  part(headKey, BOXES.head, PIVOT.head, pose.head, pose.headY);
  if (rig.parts.pet) {
    const hop = -Math.abs(Math.sin(o.t * 4.6)) * 3 * u;
    ctx.save();
    ctx.translate(0, hop);
    part("pet", BOXES.pet);
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = prevAlpha;
}
