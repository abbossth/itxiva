"use client";

// Renders the 3D chibi character (char-model.ts) into sprite sheets so every 2D place — DOM lists,
// boards, podium, shop tiles, and the canvas games — shows the same 3D-quality character.
// One shared off-screen WebGL renderer; looks are baked one at a time during idle time and cached.
// Sheet layout: rows = animation states, 6 columns = frames. Cell = 100:124 (same frame as the old SVG,
// feet at y = 111/124), the head row holds square portraits (one per face expression).
// No WebGL → `failed`, and callers keep using the SVG drawing.

import type * as T from "three";
import type { GameLook } from "@/lib/character/catalog";
import { DEFAULT_LOOK } from "@/lib/character/catalog";
import { RigActor, newPose, type CharState, type FaceKey } from "@/lib/game/rig";
import { skinFx } from "@/lib/game/skins";
import { theme } from "@/lib/game/theme";
import { buildCharModel } from "./char-model";

export type SheetRow = "idle" | "run" | "celebrate" | "jump" | "hit" | "sad" | "think" | "head";
export const SHEET_ROWS: SheetRow[] = ["idle", "run", "celebrate", "jump", "hit", "sad", "think", "head"];
export const SHEET_COLS = 6;
/** Seconds one row's loop takes (frames are evenly spread over it) */
export const ROW_SECONDS: Record<SheetRow, number> = { idle: 3.4, run: 0.48, celebrate: 0.8, jump: 0.72, hit: 0.3, sad: 3.4, think: 3.4, head: 1 };
export const HEAD_FACES: FaceKey[] = ["idle", "blink", "happy", "sad", "hit", "think"];

export interface CharSheet {
  canvas: HTMLCanvasElement;
  /** Object URL of the sheet PNG (for CSS backgrounds) */
  url: string | null;
  fw: number;
  fh: number;
}

type Entry = { state: "loading" } | { state: "ready"; sheet: CharSheet } | { state: "failed" };

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const queue: { key: string; look: Partial<GameLook>; fw: number; holding: string | null }[] = [];
let pumping = false;
let webglOk: boolean | null = null;

/** Frame widths baked (px); the smallest that is sharp enough is chosen */
const BUCKETS = [64, 128, 192];

export const sheetBucket = (displayW: number) => BUCKETS.find((b) => b >= displayW) ?? BUCKETS[BUCKETS.length - 1];

const keyOf = (look: Partial<GameLook> | null | undefined, fw: number, holding: string | null) => `${fw}:${holding ?? ""}:${JSON.stringify(look ?? DEFAULT_LOOK)}`;

export function subscribeSheets(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Cached sheet or null (queues a bake). `holding` — e.g. "pickaxe" in the gold mine. */
export function charSheet(look: Partial<GameLook> | null | undefined, displayW: number, holding: string | null = null): CharSheet | null {
  if (typeof document === "undefined" || webglOk === false) return null;
  const fw = sheetBucket(displayW);
  const key = keyOf(look, fw, holding);
  const e = cache.get(key);
  if (e?.state === "ready") return e.sheet;
  if (!e) {
    cache.set(key, { state: "loading" });
    queue.push({ key, look: look ?? DEFAULT_LOOK, fw, holding });
    void pump();
  }
  // A smaller/bigger bake of the same look is better than nothing while this one bakes
  for (const b of BUCKETS) {
    const other = cache.get(keyOf(look, b, holding));
    if (other?.state === "ready") return other.sheet;
  }
  return null;
}

/** Sheets can't be made on this device (no WebGL) */
export const sheetsUnavailable = () => webglOk === false;

const idle = () =>
  new Promise<void>((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 24);
  });

interface Studio {
  THREE: typeof import("three");
  renderer: T.WebGLRenderer;
  scene: T.Scene;
  body: T.OrthographicCamera;
  head: T.OrthographicCamera;
}
let studio: Promise<Studio | null> | null = null;

function getStudio(): Promise<Studio | null> {
  if (!studio)
    studio = (async () => {
      try {
        const THREE = await import("three");
        const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.6;
        pmrem.dispose();
        scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3b3f6b, 0.95));
        const key = new THREE.DirectionalLight(0xfff1e0, 2.3);
        key.position.set(-3, 6, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xc7d2fe, 0.7);
        fill.position.set(4, 2.5, 3);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0x99f6e4, 1.5);
        rim.position.set(2.5, 3.5, -4);
        scene.add(rim);
        // Body frame: 100:124 — feet (y = 0) at 111/124 of the height, top at y ≈ 2.64 (room for tall hats)
        const H = 2.95;
        const W = (H * 100) / 124;
        const bottom = -(H * 13) / 124;
        const mid = bottom + H / 2;
        const body = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 30);
        body.position.set(0, mid, 10);
        body.lookAt(0, mid, 0);
        // Head portrait: square around the head
        const hs = 1.5;
        const head = new THREE.OrthographicCamera(-hs / 2, hs / 2, hs / 2, -hs / 2, 0.1, 30);
        head.position.set(0, 1.93, 10);
        head.lookAt(0, 1.93, 0);
        webglOk = true;
        return { THREE, renderer, scene, body, head };
      } catch {
        webglOk = false;
        return null;
      }
    })();
  return studio;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      const st = await getStudio();
      if (!st) {
        cache.set(job.key, { state: "failed" });
        for (const l of listeners) l();
        continue;
      }
      try {
        cache.set(job.key, { state: "ready", sheet: await bake(st, job.look, job.fw, job.holding) });
      } catch {
        cache.set(job.key, { state: "failed" });
      }
      for (const l of listeners) l();
      await idle();
    }
  } finally {
    pumping = false;
  }
}

const ROW_STATE: Record<Exclude<SheetRow, "head">, CharState> = { idle: "idle", run: "run", celebrate: "celebrate", jump: "jump", hit: "hit", sad: "sad", think: "think" };

async function bake(st: Studio, look: Partial<GameLook>, fw: number, holding: string | null): Promise<CharSheet> {
  const { renderer, scene, body: bodyCam, head: headCam } = st;
  const fh = Math.round((fw * 124) / 100);
  const dpr = 1;
  renderer.setPixelRatio(dpr);
  const sheet = document.createElement("canvas");
  sheet.width = fw * SHEET_COLS;
  sheet.height = fh * SHEET_ROWS.length;
  const ctx = sheet.getContext("2d")!;
  const model = buildCharModel(st.THREE, look, { holding });
  // 3/4 view, facing screen-right; feet at y = 0
  model.root.rotation.y = 0.42;
  const holder = new st.THREE.Group();
  holder.add(model.root);
  scene.add(holder);
  // Thin indigo rim around each frame keeps the character readable on any background
  const outline = `drop-shadow(0 0 ${Math.max(0.6, fw / 110).toFixed(2)}px ${theme.outline}) drop-shadow(0 0 ${Math.max(0.4, fw / 160).toFixed(2)}px ${theme.outline})`;
  const blit = (x: number, y: number, w: number, h: number) => {
    ctx.save();
    ctx.filter = outline;
    ctx.drawImage(renderer.domElement, x, y, w, h);
    ctx.restore();
  };
  const pose = newPose();
  const fx = skinFx(look.costume);
  try {
    renderer.setSize(fw, fh, false);
    for (let r = 0; r < SHEET_ROWS.length - 1; r++) {
      const row = SHEET_ROWS[r] as Exclude<SheetRow, "head">;
      const actor = new RigActor({ seed: 2, celebrate: fx.celebrate });
      // warm up so cycles start mid-motion (and springs settle)
      if (row === "run") for (let i = 0; i < 20; i++) actor.update(1 / 60, { moving: true });
      else if (row !== "idle") actor.request(ROW_STATE[row]);
      const step = ROW_SECONDS[row] / SHEET_COLS;
      for (let c = 0; c < SHEET_COLS; c++) {
        if (row === "idle") {
          // idle frames: breathing over the loop; no blink (games/DOM add their own)
          actor.clock = c * step;
        }
        actor.update(c === 0 ? 1 / 60 : step, { moving: row === "run" });
        if (row !== "run" && row !== "idle" && actor.state !== ROW_STATE[row] && (row === "sad" || row === "think")) actor.request(ROW_STATE[row]);
        actor.pose(pose);
        // vertical lift, shake and knock-over are applied live by the 2D drawing, not baked
        pose.y = 0;
        pose.shakeX = 0;
        pose.down = 0;
        if (pose.face === "blink") pose.face = "idle";
        model.pose(pose, c * step);
        renderer.render(scene, bodyCam);
        blit(c * fw, r * fh, fw, fh);
      }
      await idle();
    }
    // Head portraits — one per face, square at the top of each cell
    renderer.setSize(fw, fw, false);
    const still = newPose();
    for (let c = 0; c < SHEET_COLS; c++) {
      still.face = HEAD_FACES[c];
      model.pose(still, 0);
      // settle the eyelid easing
      for (let i = 0; i < 12; i++) model.pose(still, 0);
      renderer.render(scene, headCam);
      blit(c * fw, (SHEET_ROWS.length - 1) * fh, fw, fw);
    }
  } finally {
    scene.remove(holder);
    model.dispose();
  }
  const url = await new Promise<string | null>((resolve) => {
    try {
      sheet.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), "image/png");
    } catch {
      resolve(null);
    }
  });
  return { canvas: sheet, url, fw, fh };
}

/** Row for a 2D mood name (SVG moods + rig states) */
export function rowOfMood(mood: string): SheetRow {
  switch (mood) {
    case "run":
      return "run";
    case "cheer":
    case "celebrate":
    case "happy-hop":
      return "celebrate";
    case "jump":
    case "fly":
    case "fall":
    case "land":
      return "jump";
    case "hit":
      return "hit";
    case "sad":
      return "sad";
    case "think":
      return "think";
    default:
      return "idle";
  }
}

/** Draw one frame of a sheet on a canvas. (cx, by) — point under the feet; h — full frame height (px). */
export function drawSheetFrame(
  ctx: CanvasRenderingContext2D,
  sheet: CharSheet,
  row: SheetRow,
  t: number,
  cx: number,
  by: number,
  h: number,
  o: { facing?: number; alpha?: number; lift?: number; down?: number; fallDir?: number; shake?: number } = {}
) {
  const r = SHEET_ROWS.indexOf(row);
  const loop = ROW_SECONDS[row];
  const once = row === "hit" || row === "jump" || row === "celebrate";
  const c = once ? Math.min(SHEET_COLS - 1, Math.floor((t / loop) * SHEET_COLS)) : Math.floor(((t % loop) / loop) * SHEET_COLS) % SHEET_COLS;
  const w = (h * 100) / 124;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.translate(cx + (o.shake ?? 0) * h, by - (o.lift ?? 0) * h);
  if (o.down) ctx.rotate(o.down * 1.38 * (o.fallDir ?? 1));
  if ((o.facing ?? 1) < 0) ctx.scale(-1, 1);
  ctx.drawImage(sheet.canvas, c * sheet.fw, r * sheet.fh, sheet.fw, sheet.fh, -w / 2, -(111 / 124) * h, w, h);
  ctx.restore();
}

/** Row for a rig state (games) */
export function rowOfState(state: CharState, down: boolean): SheetRow {
  if (down) return "sad";
  switch (state) {
    case "run":
      return "run";
    case "celebrate":
      return "celebrate";
    case "jump":
    case "fall":
      return "jump";
    case "hit":
      return "hit";
    case "sad":
      return "sad";
    case "think":
      return "think";
    default:
      return "idle";
  }
}
