// Chibi 3D character model (three.js), built procedurally from the student's look.
// Style target: stylized "3D render" figurines — big head (~43% of height), small stocky body, chunky boots,
// big glossy eyes with lids, soft PBR materials (fabric sheen, leather, metal), hair in shaped locks.
// The model is a skeleton of groups (hips → spine → chest → neck → head, shoulder → elbow → hand,
// hip → knee → ankle) driven by the shared rig poses (lib/game/rig.ts) — used by the profile scene and,
// later, to render sprites for the 2D games.

import type * as T from "three";
import { DEFAULT_LOOK, OUTFIT_COLORS, type GameLook } from "@/lib/character/catalog";
import type { FaceKey, Pose } from "@/lib/game/rig";
import { COSTUMES, type Costume } from "../character-svg";

type Three = typeof import("three");

const SKIN: Record<string, string> = {
  peach: "#f6cfb0",
  tan: "#e8b98a",
  brown: "#b9814f",
  cocoa: "#7f4f2a",
  mint: "#a7f3d0",
  sky: "#bae6fd",
  lilac: "#ddd6fe",
  gold: "#fcd34d",
  galaxy: "#a78bfa",
};

/** Body measurements (units ≈ the old 3D scene; feet at y = 0) */
export const CHAR_H = 2.32;
const HIP_Y = 0.78;
const HEAD_R = 0.5;

export interface CharModel {
  root: T.Group;
  /** Called every frame: face expression, blinking, eye gaze, cape/wings follow-through, fire flicker */
  pose(p: Pose, t: number, gaze?: { x: number; y: number }): void;
  dispose(): void;
}

interface Joints {
  hips: T.Group;
  spine: T.Group;
  chest: T.Group;
  neck: T.Group;
  head: T.Group;
  shoulderL: T.Group;
  shoulderR: T.Group;
  elbowL: T.Group;
  elbowR: T.Group;
  hipL: T.Group;
  hipR: T.Group;
  kneeL: T.Group;
  kneeR: T.Group;
  ankleL: T.Group;
  ankleR: T.Group;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildCharModel(THREE: Three, raw: Partial<GameLook> | null | undefined, opts: { holding?: string | null } = {}): CharModel {
  const look = { ...DEFAULT_LOOK, color: 0, level: 1, ...(raw ?? {}) } as GameLook;
  const cos: Costume | undefined = look.costume && look.costume !== "none" ? COSTUMES[look.costume] : undefined;
  const disposables: { dispose: () => void }[] = [];
  const track = <X extends { dispose: () => void }>(x: X) => {
    disposables.push(x);
    return x;
  };
  const C = (hex: string) => new THREE.Color(hex);
  const lighten = (hex: string, k: number) => C(hex).lerp(new THREE.Color("#ffffff"), k);

  // ---- Materials ----
  const fabric = (hex: string, opts: Partial<T.MeshPhysicalMaterialParameters> = {}) =>
    track(new THREE.MeshPhysicalMaterial({ color: C(hex), roughness: 0.82, sheen: 1, sheenRoughness: 0.55, sheenColor: lighten(hex, 0.45), ...opts }));
  const leather = (hex: string) => track(new THREE.MeshPhysicalMaterial({ color: C(hex), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.5 }));
  const metal = (hex: string, rough = 0.28) => track(new THREE.MeshPhysicalMaterial({ color: C(hex), metalness: 0.9, roughness: rough, clearcoat: 0.4 }));
  const gloss = (hex: string) => track(new THREE.MeshPhysicalMaterial({ color: C(hex), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }));
  const glow = (hex: string, k = 1.4) => track(new THREE.MeshStandardMaterial({ color: C(hex), emissive: C(hex), emissiveIntensity: k }));
  const basic = (hex: string, opts: Partial<T.MeshBasicMaterialParameters> = {}) => track(new THREE.MeshBasicMaterial({ color: C(hex), ...opts }));

  const skinHex = cos?.skin ?? SKIN[look.skin] ?? SKIN.peach;
  const skin =
    look.skin === "gold"
      ? metal("#f5c542", 0.3)
      : track(
          new THREE.MeshPhysicalMaterial({
            color: C(skinHex),
            roughness: 0.58,
            sheen: 0.6,
            sheenRoughness: 0.7,
            sheenColor: C("#ffb4a8"),
            // a touch of warm self-light fakes subsurface scattering
            emissive: C(skinHex).multiplyScalar(0.07),
            ...(look.skin === "galaxy" ? { emissive: C("#4c1d95"), emissiveIntensity: 0.35 } : {}),
          })
        );
  const skinShade = track(new THREE.MeshPhysicalMaterial({ color: C(skinHex).multiplyScalar(0.86), roughness: 0.6, sheen: 0.4, sheenColor: C("#ff9b8f") }));
  const hairHex = look.hair === "fire" ? "#f97316" : look.skin === "galaxy" ? "#2e1065" : look.hair === "mohawk" ? "#db2777" : "#3b2314";
  const hair =
    look.hair === "fire"
      ? track(new THREE.MeshStandardMaterial({ color: C("#fb923c"), emissive: C("#f97316"), emissiveIntensity: 0.9, roughness: 0.5 }))
      : track(new THREE.MeshPhysicalMaterial({ color: C(hairHex), roughness: 0.62, sheen: 0.8, sheenRoughness: 0.45, sheenColor: lighten(hairHex, 0.35) }));
  const main = OUTFIT_COLORS[look.color % OUTFIT_COLORS.length] ?? OUTFIT_COLORS[0];
  const outfit = (() => {
    if (cos) return { body: cos.body, trim: cos.trim, legs: cos.legs, boots: "#3f2a1d", kind: "costume" as const };
    switch (look.outfit) {
      case "school":
        return { body: "#1e3a8a", trim: "#f8fafc", legs: "#1e293b", boots: "#111827", kind: look.outfit };
      case "ninja":
        return { body: "#1f2937", trim: "#ef4444", legs: "#111827", boots: "#0f172a", kind: look.outfit };
      case "armor":
        return { body: "#94a3b8", trim: "#facc15", legs: "#475569", boots: "#334155", kind: look.outfit };
      case "space":
        return { body: "#f1f5f9", trim: "#f97316", legs: "#e2e8f0", boots: "#cbd5e1", kind: look.outfit };
      case "hero":
        return { body: main, trim: "#facc15", legs: main, boots: "#7c2d12", kind: look.outfit };
      case "royal":
        return { body: "#6d28d9", trim: "#fbbf24", legs: "#4c1d95", boots: "#3f2a1d", kind: look.outfit };
      case "hoodie":
        return { body: main, trim: "#f8fafc", legs: "#334155", boots: "#1f2937", kind: look.outfit };
      default:
        return { body: main, trim: "#f8fafc", legs: "#1e40af", boots: "#5b3a24", kind: "tee" as const };
    }
  })();
  const bodyM = outfit.kind === "armor" ? metal(outfit.body, 0.32) : fabric(outfit.body);
  const trimM = outfit.kind === "armor" || outfit.kind === "royal" ? metal(outfit.trim, 0.25) : fabric(outfit.trim);
  const legM = fabric(outfit.legs, { roughness: 0.88 });
  const bootM = leather(outfit.boots);
  const soleM = track(new THREE.MeshPhysicalMaterial({ color: C("#2a211c"), roughness: 0.85 }));
  const buckleM = metal("#d6b25e", 0.3);

  // ---- Geometry helpers ----
  const geo = <G extends T.BufferGeometry>(g: G) => track(g);
  const mesh = (g: T.BufferGeometry, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  /** Rotationally symmetric shape from [radius, y] points */
  const lathe = (pts: [number, number][], seg = 40) => geo(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg));
  /** Tapered limb hanging down from y = 0 to y = -len, rounded ends */
  const limb = (r1: number, r2: number, len: number, seg = 28) => {
    const pts: [number, number][] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      pts.push([r2 * Math.sin(a), -len - r2 * 0.6 * Math.cos(a) + r2 * 0.6]);
    }
    pts.push([r2 * 1.02, -len * 0.55]);
    pts.push([r1, -len * 0.1]);
    for (let i = n; i >= 0; i--) {
      const a = (i / n) * (Math.PI / 2);
      pts.push([r1 * Math.sin(a), r1 * 0.6 * Math.cos(a)]);
    }
    return lathe(pts, seg);
  };
  const group = (parent: T.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    draw(cv.getContext("2d")!);
    const tex = track(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  // ---- Skeleton ----
  const root = new THREE.Group();
  const hips = group(root, 0, HIP_Y, 0);
  const spine = group(hips, 0, 0.05, 0);
  const chest = group(spine, 0, 0, 0);
  const neck = group(chest, 0, 0.5, 0);
  const head = group(neck, 0, HEAD_R - 0.02, 0.02);
  const shoulderL = group(chest, -0.31, 0.4, 0);
  const shoulderR = group(chest, 0.31, 0.4, 0);
  const elbowL = group(shoulderL, 0, -0.22, 0);
  const elbowR = group(shoulderR, 0, -0.22, 0);
  const hipL = group(hips, -0.13, -0.04, 0);
  const hipR = group(hips, 0.13, -0.04, 0);
  const kneeL = group(hipL, 0, -0.23, 0);
  const kneeR = group(hipR, 0, -0.23, 0);
  const ankleL = group(kneeL, 0, -0.22, 0);
  const ankleR = group(kneeR, 0, -0.22, 0);
  for (const j of [shoulderL, shoulderR, hipL, hipR]) j.rotation.order = "ZXY";

  // ---- Torso: chest, waist, hips (stocky), slightly flattened front-to-back ----
  const torso = mesh(
    lathe([
      [0.0, -0.04],
      [0.22, -0.035],
      [0.27, 0.0],
      [0.285, 0.08],
      [0.29, 0.18],
      [0.305, 0.3],
      [0.3, 0.38],
      [0.26, 0.45],
      [0.17, 0.5],
      [0.1, 0.52],
      [0.0, 0.53],
    ]),
    bodyM,
    chest
  );
  torso.scale.set(1, 1, 0.78);
  // Shoulders (deltoids) — round, under the sleeves
  for (const sh of [shoulderL, shoulderR]) mesh(geo(new THREE.SphereGeometry(0.08, 24, 18)), bodyM, sh, 0, 0.0, 0).scale.set(1, 0.95, 0.9);
  // Pelvis / shorts top
  const pelvis = mesh(lathe([[0, -0.12], [0.2, -0.13], [0.26, -0.08], [0.275, 0.0], [0.27, 0.06], [0, 0.07]]), legM, hips);
  pelvis.scale.set(1, 1, 0.8);
  // Belt with buckle
  const belt = mesh(geo(new THREE.TorusGeometry(0.272, 0.028, 10, 48)), leather(outfit.kind === "costume" ? cos?.accent ?? "#3f2a1d" : "#3f2a1d"), hips, 0, 0.06, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.8, 1.7);
  mesh(geo(new THREE.BoxGeometry(0.09, 0.07, 0.03)), buckleM, hips, 0, 0.06, 0.225);
  // Neck
  mesh(geo(new THREE.CylinderGeometry(0.075, 0.085, 0.12, 20)), skinShade, neck, 0, -0.01, 0);

  // ---- Outfit details ----
  const collar = (m: T.Material, r = 0.12, tube = 0.03) => {
    const c = mesh(geo(new THREE.TorusGeometry(r, tube, 10, 32)), m, chest, 0, 0.5, 0);
    c.rotation.x = Math.PI / 2;
    return c;
  };
  const chestDecal = (draw: (c: CanvasRenderingContext2D) => void, w = 0.26, h = 0.26, y = 0.27) => {
    const tex = canvasTex(256, 256, draw);
    const m = track(new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.7, sheen: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const pl = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h, 8, 8)), m);
    // bend the plane onto the chest curve
    const pos = pl.geometry.attributes.position as T.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, -x * x * 1.6);
    }
    pl.geometry.computeVertexNormals();
    pl.position.set(0, y, 0.305 * 0.78 + 0.004);
    chest.add(pl);
    return pl;
  };
  const star = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, stroke = "rgba(0,0,0,0.35)") => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = stroke;
    c.stroke();
  };
  if (!cos) {
    switch (outfit.kind) {
      case "tee":
        collar(trimM, 0.12, 0.028);
        break;
      case "hoodie": {
        const hood = mesh(geo(new THREE.TorusGeometry(0.16, 0.08, 14, 32)), bodyM, chest, 0, 0.47, -0.05);
        hood.rotation.x = Math.PI / 2.4;
        const pocket = mesh(geo(new THREE.BoxGeometry(0.28, 0.12, 0.04)), fabric(outfit.body, { color: C(outfit.body).multiplyScalar(0.85) }), chest, 0, 0.12, 0.215);
        pocket.rotation.x = -0.08;
        for (const x of [-0.05, 0.05]) mesh(geo(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6)), basic("#f8fafc"), chest, x, 0.38, 0.235);
        break;
      }
      case "school": {
        collar(fabric("#f8fafc"), 0.115, 0.032);
        const tie = mesh(geo(new THREE.ConeGeometry(0.045, 0.22, 4)), gloss("#dc2626"), chest, 0, 0.34, 0.235);
        tie.rotation.x = Math.PI;
        tie.rotation.y = Math.PI / 4;
        tie.scale.set(1, 1, 0.35);
        for (const y of [0.18, 0.08]) mesh(geo(new THREE.SphereGeometry(0.014, 8, 6)), buckleM, chest, 0, y, 0.236);
        break;
      }
      case "ninja": {
        const wrap = mesh(geo(new THREE.TorusGeometry(0.29, 0.035, 10, 40)), fabric(outfit.trim), chest, 0, 0.12, 0);
        wrap.rotation.x = Math.PI / 2;
        wrap.scale.set(1, 0.78, 1);
        collar(fabric("#374151"), 0.13, 0.04);
        break;
      }
      case "armor": {
        const plate = mesh(geo(new THREE.SphereGeometry(0.3, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2)), metal("#cbd5e1", 0.22), chest, 0, 0.18, 0.02);
        plate.scale.set(0.95, 0.75, 0.82);
        for (const sh of [shoulderL, shoulderR]) mesh(geo(new THREE.SphereGeometry(0.12, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2)), metal("#cbd5e1", 0.22), sh, 0, 0.02, 0).scale.set(1.05, 0.8, 1);
        mesh(geo(new THREE.SphereGeometry(0.04, 16, 12)), metal(outfit.trim, 0.2), chest, 0, 0.3, 0.245);
        break;
      }
      case "space": {
        collar(gloss("#cbd5e1"), 0.15, 0.05);
        mesh(geo(new THREE.BoxGeometry(0.2, 0.12, 0.04)), gloss("#cbd5e1"), chest, 0, 0.26, 0.22);
        ["#ef4444", "#22c55e", "#3b82f6"].forEach((c, i) => mesh(geo(new THREE.SphereGeometry(0.016, 10, 8)), glow(c, 0.8), chest, -0.05 + i * 0.05, 0.26, 0.245));
        const stripe = mesh(geo(new THREE.TorusGeometry(0.295, 0.016, 8, 40)), fabric(outfit.trim), chest, 0, 0.06, 0);
        stripe.rotation.x = Math.PI / 2;
        stripe.scale.set(1, 0.78, 1);
        break;
      }
      case "hero":
        collar(fabric(outfit.trim), 0.12, 0.03);
        chestDecal((c) => star(c, 128, 128, 100, "#facc15"));
        break;
      case "royal": {
        collar(metal(outfit.trim, 0.22), 0.125, 0.032);
        mesh(geo(new THREE.BoxGeometry(0.05, 0.42, 0.02)), metal(outfit.trim, 0.22), chest, 0, 0.25, 0.235);
        mesh(geo(new THREE.OctahedronGeometry(0.035)), gloss("#ef4444"), chest, 0, 0.3, 0.255);
        break;
      }
    }
  } else {
    collar(fabric(cos.trim), 0.12, 0.03);
    const em = cos.emblem;
    if (em === "belly") {
      const b = mesh(geo(new THREE.SphereGeometry(0.22, 24, 18)), fabric(cos.trim), chest, 0, 0.17, 0.06);
      b.scale.set(0.9, 1.05, 0.75);
    } else if (em === "star") chestDecal((c) => star(c, 128, 128, 96, "#fde047"));
    else if (em === "moon")
      chestDecal((c) => {
        c.fillStyle = "#fbbf24";
        c.beginPath();
        c.arc(128, 128, 90, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = cos.body;
        c.beginPath();
        c.arc(96, 110, 80, 0, Math.PI * 2);
        c.fill();
      });
    else if (em === "hex" || em === "tile")
      chestDecal((c) => {
        c.lineWidth = 14;
        c.strokeStyle = em === "tile" ? cos.trim : "#22d3ee";
        c.fillStyle = em === "tile" ? cos.accent ?? "#f8fafc" : "#052e16";
        c.beginPath();
        for (let i = 0; i < (em === "tile" ? 16 : 6); i++) {
          const n = em === "tile" ? 16 : 6;
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const r = em === "tile" ? (i % 2 ? 60 : 105) : 100;
          c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
        }
        c.closePath();
        c.fill();
        c.stroke();
        if (em === "hex") {
          c.fillStyle = "#4ade80";
          c.beginPath();
          c.arc(128, 128, 40, 0, Math.PI * 2);
          c.fill();
        }
      });
    else if (em === "ten")
      chestDecal((c) => {
        c.font = "900 170px system-ui, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineWidth = 16;
        c.strokeStyle = cos.accent ?? "#14532d";
        c.strokeText("10", 128, 136);
        c.fillStyle = cos.trim;
        c.fillText("10", 128, 136);
      });
    else if (em === "stripes")
      chestDecal(
        (c) => {
          [40, 90, 166, 216].forEach((x, i) => {
            c.fillStyle = i % 2 ? cos.accent ?? cos.trim : cos.trim;
            c.fillRect(x, 0, 18, 256);
          });
        },
        0.42,
        0.46,
        0.24
      );
    else if (em === "sash") {
      const sash = mesh(geo(new THREE.TorusGeometry(0.285, 0.05, 10, 40)), fabric(cos.accent ?? cos.trim), hips, 0, 0.08, 0);
      sash.rotation.x = Math.PI / 2;
      sash.scale.set(1, 0.8, 1.3);
      mesh(geo(new THREE.SphereGeometry(0.05, 14, 10)), fabric(cos.trim), hips, 0.12, 0.06, 0.22);
    } else if (em === "skull" || em === "snow" || em === "wind" || em === "leaf")
      chestDecal((c) => {
        c.lineWidth = 18;
        c.lineCap = "round";
        c.strokeStyle = em === "snow" ? "#0ea5e9" : cos.trim;
        c.beginPath();
        if (em === "snow") for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          c.moveTo(128 - Math.cos(a) * 90, 128 - Math.sin(a) * 90);
          c.lineTo(128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90);
        }
        else if (em === "wind") for (let i = 0; i < 3; i++) {
          c.moveTo(50, 70 + i * 55);
          c.quadraticCurveTo(170, 50 + i * 55, 200, 90 + i * 55);
        }
        else if (em === "leaf") {
          c.moveTo(128, 30);
          c.quadraticCurveTo(220, 128, 128, 226);
          c.quadraticCurveTo(36, 128, 128, 30);
        } else {
          c.arc(128, 110, 60, 0, Math.PI * 2);
          c.moveTo(100, 190);
          c.lineTo(156, 190);
        }
        c.stroke();
      });
  }

  // ---- Arms: sleeve upper arm, forearm (sleeve or skin), cuffs, mitten hands with a thumb ----
  const shortSleeve = !cos && outfit.kind === "tee";
  const gloved = (!cos && (outfit.kind === "ninja" || outfit.kind === "armor" || outfit.kind === "space")) || Boolean(cos?.helmet);
  const handM = gloved ? (outfit.kind === "armor" ? metal("#94a3b8", 0.3) : leather(outfit.kind === "space" ? "#e2e8f0" : "#1f2937")) : skin;
  const handR = { L: null as T.Group | null, R: null as T.Group | null };
  for (const side of ["L", "R"] as const) {
    const sh = side === "L" ? shoulderL : shoulderR;
    const el = side === "L" ? elbowL : elbowR;
    mesh(limb(0.082, 0.072, 0.22), shortSleeve ? skin : bodyM, sh);
    if (shortSleeve) {
      const sl = mesh(limb(0.098, 0.09, 0.1), bodyM, sh);
      sl.position.y = 0.02;
    }
    mesh(geo(new THREE.SphereGeometry(0.072, 16, 12)), shortSleeve ? skin : bodyM, el);
    mesh(limb(0.07, 0.058, 0.19), shortSleeve ? skin : bodyM, el);
    if (!shortSleeve) {
      const cuff = mesh(geo(new THREE.TorusGeometry(0.064, 0.018, 8, 24)), trimM, el, 0, -0.18, 0);
      cuff.rotation.x = Math.PI / 2;
    }
    const hand = group(el, 0, -0.245, 0.005);
    const palm = mesh(geo(new THREE.SphereGeometry(0.076, 20, 16)), handM, hand);
    palm.scale.set(0.95, 1.1, 0.78);
    const thumb = mesh(geo(new THREE.CapsuleGeometry(0.022, 0.04, 4, 10)), handM, hand, side === "L" ? 0.05 : -0.05, 0.015, 0.035);
    thumb.rotation.z = side === "L" ? -0.6 : 0.6;
    handR[side] = hand;
  }

  // ---- Legs: short thighs and shins, chunky boots ----
  for (const side of ["L", "R"] as const) {
    const hp = side === "L" ? hipL : hipR;
    const kn = side === "L" ? kneeL : kneeR;
    const an = side === "L" ? ankleL : ankleR;
    mesh(limb(0.105, 0.088, 0.23), legM, hp);
    mesh(geo(new THREE.SphereGeometry(0.088, 18, 14)), legM, kn);
    mesh(limb(0.088, 0.08, 0.2), legM, kn);
    // Boot: shaft, rounded foot, sole, toe cap, laces
    mesh(geo(new THREE.CylinderGeometry(0.098, 0.105, 0.17, 24)), bootM, an, 0, 0.02, 0);
    const cuffTop = mesh(geo(new THREE.TorusGeometry(0.098, 0.02, 8, 24)), bootM, an, 0, 0.105, 0);
    cuffTop.rotation.x = Math.PI / 2;
    const foot = mesh(geo(new THREE.SphereGeometry(0.12, 28, 20)), bootM, an, 0, -0.12, 0.06);
    foot.scale.set(0.95, 0.72, 1.45);
    const sole = mesh(geo(new THREE.CylinderGeometry(0.125, 0.125, 0.045, 28)), soleM, an, 0, -0.195, 0.06);
    sole.scale.set(0.95, 1, 1.5);
    const toe = mesh(geo(new THREE.SphereGeometry(0.075, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2)), leather(outfit.kind === "space" ? "#94a3b8" : "#2a1d15"), an, 0, -0.16, 0.18);
    toe.scale.set(1.2, 0.8, 0.9);
    for (let i = 0; i < 3; i++) {
      const lace = mesh(geo(new THREE.TorusGeometry(0.03, 0.007, 6, 12)), basic("#e7e5e4"), an, 0, 0.04 - i * 0.045, 0.1 + i * 0.012);
      lace.rotation.x = 0.3;
      lace.scale.set(1.2, 0.5, 1);
    }
  }

  // ---- Head: sculpted sphere — big cranium, full cheeks, soft small chin ----
  const headGeo = geo(new THREE.SphereGeometry(HEAD_R, 72, 56));
  {
    const pos = headGeo.attributes.position as T.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const ny = y / HEAD_R;
      const nz = z / HEAD_R;
      // Lower face narrows to a soft chin
      if (ny < 0) {
        const k = smooth(0, -1, ny);
        x *= 1 - 0.16 * k * k;
        z *= 1 - 0.05 * k;
        y *= 1 - 0.08 * k;
      }
      // Full cheeks (front-lower sides)
      const cheek = Math.exp(-((ny + 0.32) ** 2) / 0.05) * smooth(0.1, 0.7, nz) * smooth(0.25, 0.75, Math.abs(x / HEAD_R));
      x *= 1 + 0.06 * cheek;
      z *= 1 + 0.03 * cheek;
      // Slightly flatter face, rounder back of the head
      if (nz > 0.5) z *= 1 - 0.04 * smooth(0.5, 1, nz);
      if (nz < 0 && ny > -0.2) z *= 1 + 0.05 * smooth(0, -1, nz);
      pos.setXYZ(i, x, y * 1.02, z * 0.96);
    }
    headGeo.computeVertexNormals();
  }
  mesh(headGeo, skin, head);
  // Ears
  for (const s of [-1, 1]) {
    const ear = mesh(geo(new THREE.SphereGeometry(0.075, 16, 12)), skin, head, s * 0.47, -0.04, -0.02);
    ear.scale.set(0.45, 1, 0.75);
    const inner = mesh(geo(new THREE.SphereGeometry(0.045, 12, 10)), skinShade, head, s * 0.495, -0.04, -0.005);
    inner.scale.set(0.3, 0.9, 0.6);
  }
  // Nose: small soft button
  const nose = mesh(geo(new THREE.SphereGeometry(0.04, 18, 14)), skinShade, head, 0, -0.13, 0.478);
  nose.scale.set(1.1, 0.8, 0.75);
  // Blush
  const blushTex = canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(251,113,133,0.55)");
    g.addColorStop(1, "rgba(251,113,133,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const blushM = track(new THREE.MeshBasicMaterial({ map: blushTex, transparent: true, depthWrite: false }));
  for (const s of [-1, 1]) {
    const b = mesh(geo(new THREE.PlaneGeometry(0.14, 0.09)), blushM, head, s * 0.27, -0.17, 0.405);
    b.rotation.y = s * 0.55;
    b.castShadow = false;
  }

  // ---- Eyes: glossy sclera, painted iris with pupil and catch-lights, eyelids (blink, moods), lash line ----
  const irisHex = look.eyes === "fire" ? "#ea580c" : look.skin === "galaxy" ? "#7c3aed" : look.eyes === "star" ? "#facc15" : "#6b3f1d";
  const irisTex = canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 118, 10, 128, 128, 120);
    g.addColorStop(0, lighten(irisHex, 0.55).getStyle());
    g.addColorStop(0.55, irisHex);
    g.addColorStop(0.92, C(irisHex).multiplyScalar(0.45).getStyle());
    g.addColorStop(1, "#140b06");
    c.fillStyle = g;
    c.beginPath();
    c.arc(128, 128, 124, 0, Math.PI * 2);
    c.fill();
    // fibers
    c.strokeStyle = "rgba(255,255,255,0.12)";
    c.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      c.beginPath();
      c.moveTo(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52);
      c.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
      c.stroke();
    }
    if (look.eyes === "star") {
      c.fillStyle = "#1c1206";
      star(c, 128, 128, 56, "#1c1206", "rgba(0,0,0,0)");
    } else {
      c.fillStyle = "#0b0705";
      c.beginPath();
      c.arc(128, 132, 50, 0, Math.PI * 2);
      c.fill();
    }
    // catch-lights
    c.fillStyle = "rgba(255,255,255,0.95)";
    c.beginPath();
    c.ellipse(88, 82, 30, 24, -0.5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(164, 172, 13, 0, Math.PI * 2);
    c.fill();
  });
  const sclera = track(new THREE.MeshPhysicalMaterial({ color: C("#fbfbfd"), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const irisM = track(new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true }));
  const lidM = skin;
  const lashM = basic("#1c1310");
  const eyes: { lid: T.Group; low: T.Group; iris: T.Mesh; brow: T.Mesh; side: number }[] = [];
  const covered = look.eyes === "shades" || look.eyes === "visor";
  for (const s of [-1, 1]) {
    const eye = group(head, s * 0.195, -0.045, 0.4);
    eye.rotation.y = s * 0.3;
    eye.rotation.x = -0.05;
    const ball = mesh(geo(new THREE.SphereGeometry(0.11, 32, 24)), sclera, eye);
    ball.scale.set(1, 1.14, 0.72);
    const iris = mesh(geo(new THREE.CircleGeometry(0.084, 40)), irisM, eye, 0, -0.006, 0.0795);
    iris.scale.y = 1.12;
    // Upper lid: a dome over the top of the eye that rotates down to blink
    const lid = group(eye, 0, 0, 0);
    const lidMesh = mesh(geo(new THREE.SphereGeometry(0.117, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), lidM, lid);
    lidMesh.scale.set(1, 1.14, 0.8);
    lidMesh.rotation.x = 0;
    const lash = mesh(geo(new THREE.TorusGeometry(0.114, 0.016, 8, 32, Math.PI)), lashM, lid, 0, 0, 0.004);
    lash.rotation.x = 0;
    lash.scale.set(1, 0.8, 1);
    lash.castShadow = false;
    // Lower lid (rises for a happy squint)
    const low = group(eye, 0, 0, 0);
    const lowMesh = mesh(geo(new THREE.SphereGeometry(0.116, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), lidM, low);
    lowMesh.scale.set(1, 1.14, 0.78);
    low.rotation.x = 1.25;
    // Brow
    const brow = mesh(geo(new THREE.CapsuleGeometry(0.027, 0.13, 6, 12)), track(new THREE.MeshStandardMaterial({ color: C(look.skin === "galaxy" ? "#2e1065" : "#3b2314"), roughness: 0.7 })), head, s * 0.2, 0.135, 0.458);
    brow.rotation.z = Math.PI / 2;
    brow.rotation.y = s * 0.3;
    eyes.push({ lid, low, iris, brow, side: s });
    if (covered) eye.visible = false;
  }
  if (look.eyes === "shades") {
    const g = group(head, 0, -0.03, 0.44);
    for (const s of [-1, 1]) {
      const lens = mesh(geo(new THREE.SphereGeometry(0.11, 24, 16)), gloss("#0f172a"), g, s * 0.19, 0, 0);
      lens.scale.set(1.15, 0.85, 0.35);
      lens.rotation.y = s * 0.3;
    }
    mesh(geo(new THREE.BoxGeometry(0.12, 0.025, 0.03)), metal("#94a3b8"), g, 0, 0.03, 0.02);
  } else if (look.eyes === "visor") {
    const v = mesh(geo(new THREE.TorusGeometry(0.47, 0.055, 12, 48, Math.PI * 0.7)), glow("#22d3ee", 0.9), head, 0, -0.03, 0);
    v.rotation.z = Math.PI * 0.15 + Math.PI;
    v.rotation.x = Math.PI / 2;
    v.rotation.order = "XZY";
  }
  if (look.eyes === "fire") {
    for (const s of [-1, 1]) {
      const f = mesh(geo(new THREE.ConeGeometry(0.03, 0.09, 10)), glow("#f97316", 1.6), head, s * 0.3, 0.06, 0.38);
      f.rotation.z = -s * 0.6;
    }
  }

  // ---- Mouth: painted expressions on a small patch (swapped per mood) ----
  const mouthDraw: Record<FaceKey, (c: CanvasRenderingContext2D) => void> = {
    idle: (c) => {
      c.strokeStyle = "#6b2a2a";
      c.lineWidth = 10;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(88, 60);
      c.quadraticCurveTo(128, 84, 168, 60);
      c.stroke();
    },
    blink: (c) => mouthDraw.idle(c),
    happy: (c) => {
      c.fillStyle = "#5b1a1d";
      c.beginPath();
      c.moveTo(70, 44);
      c.quadraticCurveTo(128, 50, 186, 44);
      c.quadraticCurveTo(178, 118, 128, 120);
      c.quadraticCurveTo(78, 118, 70, 44);
      c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.moveTo(80, 48);
      c.quadraticCurveTo(128, 56, 176, 48);
      c.lineTo(172, 66);
      c.quadraticCurveTo(128, 72, 84, 66);
      c.closePath();
      c.fill();
      c.fillStyle = "#f87171";
      c.beginPath();
      c.ellipse(128, 104, 30, 14, 0, 0, Math.PI * 2);
      c.fill();
    },
    sad: (c) => {
      c.strokeStyle = "#6b2a2a";
      c.lineWidth = 10;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(94, 84);
      c.quadraticCurveTo(128, 56, 162, 84);
      c.stroke();
    },
    hit: (c) => {
      c.fillStyle = "#5b1a1d";
      c.beginPath();
      c.ellipse(128, 72, 26, 32, 0, 0, Math.PI * 2);
      c.fill();
    },
    think: (c) => {
      c.strokeStyle = "#6b2a2a";
      c.lineWidth = 10;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(100, 72);
      c.quadraticCurveTo(130, 74, 160, 60);
      c.stroke();
    },
  };
  const mouthTex: Partial<Record<FaceKey, T.Texture>> = {};
  for (const k of Object.keys(mouthDraw) as FaceKey[]) mouthTex[k] = canvasTex(256, 128, mouthDraw[k]);
  const mouthM = track(new THREE.MeshBasicMaterial({ map: mouthTex.idle, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  const mouth = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.24, 0.12, 6, 3)), mouthM);
  {
    const pos = mouth.geometry.attributes.position as T.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, -(pos.getX(i) ** 2) * 2.2);
  }
  mouth.position.set(0, -0.25, 0.418);
  mouth.rotation.x = -0.32;
  if (look.mouth !== "mask") head.add(mouth);
  else {
    const mask = mesh(geo(new THREE.SphereGeometry(HEAD_R * 1.01, 48, 24, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.27)), fabric("#1f2937"), head);
    mask.scale.set(1, 1.02, 0.96);
  }

  // ---- Hair ----
  const lockGeo = (len: number, w: number) => {
    const g = lathe(
      [
        [0, 0],
        [w * 0.8, len * 0.08],
        [w, len * 0.3],
        [w * 0.75, len * 0.62],
        [w * 0.35, len * 0.88],
        [0, len],
      ],
      16
    );
    // curl the lock forward so tips sweep
    const p = g.attributes.position as T.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / len;
      p.setZ(i, p.getZ(i) + y * y * len * 0.35);
    }
    g.computeVertexNormals();
    return g;
  };
  const addLock = (parent: T.Object3D, len: number, w: number, x: number, y: number, z: number, rx: number, rz: number, ry = 0) => {
    const l = mesh(lockGeo(len, w), hair, parent, x, y, z);
    // tilt sideways (z), then point down/forward (x), then fan around the head (y)
    l.rotation.order = "YXZ";
    l.rotation.set(rx, ry, rz);
    return l;
  };
  const flames: T.Object3D[] = [];
  const hideHair = cos ? Boolean(cos.noHair) : look.head === "astro" || look.head === "helmet";
  if (!hideHair) {
    const hairRoot = group(head, 0, 0, 0);
    // Base cap: covers the top and back of the head, leaving the forehead
    const cap = mesh(geo(new THREE.SphereGeometry(HEAD_R * 1.05, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.47)), hair, hairRoot, 0, 0.02, -0.01);
    cap.rotation.x = -0.5;
    cap.scale.set(1.02, 1.06, 1.02);
    // Back of the head down to the nape (sphere phi = 1.5π points to −z)
    mesh(geo(new THREE.SphereGeometry(HEAD_R * 1.04, 48, 32, Math.PI * 0.95, Math.PI * 1.1, Math.PI * 0.2, Math.PI * 0.55)), hair, hairRoot);
    const style = look.hair;
    if (style === "spiky" || style === "fire") {
      for (let i = 0; i < 9; i++) {
        const a = -1.1 + (i / 8) * 2.2;
        const l = addLock(hairRoot, 0.34, 0.09, Math.sin(a) * 0.36, 0.36 + Math.cos(a) * 0.06, Math.cos(a) * 0.12 - 0.05, -0.5, -a * 0.8);
        if (style === "fire") flames.push(l);
      }
    } else if (style === "mohawk") {
      for (let i = 0; i < 6; i++) addLock(hairRoot, 0.3, 0.07, 0, 0.44 - i * 0.02, 0.3 - i * 0.12, -0.3 - i * 0.25, 0);
    } else if (style === "curly") {
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const ring = i % 2 ? 0.38 : 0.28;
        const c = mesh(geo(new THREE.SphereGeometry(0.11, 18, 14)), hair, hairRoot, Math.cos(a) * ring, 0.4 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * ring - 0.04);
        c.scale.setScalar(0.9 + ((i * 37) % 10) / 30);
      }
      for (let i = 0; i < 6; i++) mesh(geo(new THREE.SphereGeometry(0.09, 16, 12)), hair, hairRoot, -0.3 + i * 0.12, 0.28, 0.34);
    } else {
      // Fringe: locks sweeping over the forehead
      const sideSweep = style === "side" ? 1 : 0;
      const LEN = [0.2, 0.24, 0.21, 0.26, 0.22, 0.25, 0.2];
      for (let i = 0; i < 7; i++) {
        const u = -1 + (i / 6) * 2;
        const a = u * 0.95;
        // root on the hairline, chunky soft lock sweeping onto the forehead (ends above the brows)
        addLock(hairRoot, LEN[i] - Math.abs(u) * 0.02, 0.095, Math.sin(a) * 0.4, 0.34 - Math.abs(u) * 0.05, Math.cos(a) * 0.29, Math.PI - 0.95, u * 0.3 + sideSweep * 0.45, a);
      }
      // Side locks in front of the ears
      for (const s of [-1, 1]) addLock(hairRoot, 0.24, 0.065, s * 0.45, 0.16, 0.1, Math.PI - 0.2, s * -0.12);
      if (style === "long") {
        const sheet = mesh(lathe([[0, -0.62], [0.3, -0.6], [0.44, -0.3], [0.5, 0.0], [0.47, 0.25], [0, 0.3]], 40), hair, hairRoot, 0, -0.05, -0.1);
        sheet.scale.set(1.05, 1, 0.75);
        for (const s of [-1, 1]) addLock(hairRoot, 0.5, 0.1, s * 0.42, -0.05, 0.12, Math.PI - 0.1, s * -0.1);
      }
      if (style === "bun") {
        mesh(geo(new THREE.SphereGeometry(0.17, 24, 18)), hair, hairRoot, 0, 0.52, -0.18);
        const tie = mesh(geo(new THREE.TorusGeometry(0.1, 0.02, 8, 20)), gloss("#f472b6"), hairRoot, 0, 0.45, -0.14);
        tie.rotation.x = 1.1;
      }
    }
  }

  // ---- Head items and costume heads (built around a head of radius 0.58, scaled to fit) ----
  const items = group(head, 0, 0, 0);
  items.scale.setScalar(HEAD_R / 0.58);
  const spin: T.Object3D[] = [];
  const it = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0) => mesh(geo(g), m, items, x, y, z);
  if (cos) {
    if (cos.hood) {
      const m = fabric(cos.hood);
      const hood = it(new THREE.SphereGeometry(0.66, 40, 28, 0, Math.PI * 2, 0, Math.PI * 0.6), m, 0, 0.02, -0.04);
      hood.rotation.x = -0.85;
      if (cos.ears === "cat") for (const s of [-1, 1]) it(new THREE.ConeGeometry(0.17, 0.36, 12), m, s * 0.36, 0.62, -0.02).rotation.z = -s * 0.35;
      if (cos.ears === "horns") for (const s of [-1, 1]) it(new THREE.ConeGeometry(0.07, 0.34, 14), gloss("#fef3c7"), s * 0.28, 0.72, -0.05).rotation.z = -s * 0.4;
      if (cos.ears === "spikes") for (let i = 0; i < 4; i++) it(new THREE.ConeGeometry(0.08, 0.24, 10), fabric(cos.trim), 0, 0.66 - i * 0.12, -0.12 - i * 0.16).rotation.x = -0.4 - i * 0.35;
    }
    if (cos.helmet && cos.helmetStyle === "astro") {
      it(new THREE.SphereGeometry(0.86, 48, 32), track(new THREE.MeshPhysicalMaterial({ color: C("#e0f2fe"), transmission: 0.9, roughness: 0.03, thickness: 0.05, transparent: true, opacity: 0.35 })), 0, 0, 0);
      it(new THREE.TorusGeometry(0.66, 0.08, 12, 48), gloss(cos.trim), 0, -0.6, 0).rotation.x = Math.PI / 2;
    } else if (cos.helmet) {
      it(new THREE.SphereGeometry(0.7, 48, 32), metal(cos.body, 0.25), 0, 0.02, 0);
      if (cos.helmetStyle === "knight") {
        it(new THREE.BoxGeometry(0.86, 0.09, 0.12), basic("#0f172a"), 0, 0.1, 0.62);
        it(new THREE.ConeGeometry(0.1, 0.42, 12), gloss("#dc2626"), 0, 0.86, 0);
      } else it(new THREE.BoxGeometry(0.86, 0.2, 0.12), glow("#22d3ee", 0.9), 0, 0.05, 0.62);
    }
    if (cos.mask) it(new THREE.TorusGeometry(0.585, 0.08, 10, 48), fabric(cos.mask), 0, 0.04, 0).rotation.x = Math.PI / 2;
    const hatHex = cos.hatColor;
    if (cos.hat === "pirate") {
      it(new THREE.CylinderGeometry(0.82, 0.82, 0.06, 3), leather("#111827"), 0, 0.42, 0);
      it(new THREE.SphereGeometry(0.46, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), leather("#111827"), 0, 0.42, 0);
    }
    if (cos.hat === "wizard") {
      it(new THREE.CylinderGeometry(0.86, 0.86, 0.05, 40), fabric("#4c1d95"), 0, 0.42, 0);
      const cone = it(new THREE.ConeGeometry(0.48, 1.05, 32), fabric("#6d28d9"), 0, 0.95, -0.05);
      cone.rotation.x = -0.18;
      spin.push(it(new THREE.OctahedronGeometry(0.08), glow("#fde047", 1.2), 0.18, 0.78, 0.3));
    }
    if (cos.hat === "ice") for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      it(new THREE.ConeGeometry(0.06, 0.3, 8), gloss("#e0f2fe"), Math.sin(a) * 0.4, 0.72, Math.cos(a) * 0.4);
    }
    if (cos.hat === "leaf") for (let i = 0; i < 5; i++) it(new THREE.SphereGeometry(0.12, 14, 10), fabric(i % 2 ? "#84cc16" : "#65a30d"), -0.36 + i * 0.18, 0.66, 0).scale.set(0.6, 1.6, 0.4);
    if (cos.hat === "doppi") {
      it(new THREE.CylinderGeometry(0.5, 0.57, 0.28, 4), fabric(hatHex ?? "#111827"), 0, 0.5, 0).rotation.y = Math.PI / 4;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        it(new THREE.SphereGeometry(0.07, 10, 8), fabric(cos.hatTrim ?? "#f8fafc"), Math.sin(a) * 0.41, 0.52, Math.cos(a) * 0.41).scale.set(1, 1.4, 0.4);
      }
    }
    if (cos.hat === "chugirma") {
      const fur = fabric(hatHex ?? "#f5f5f4", { roughness: 1, sheen: 1, sheenRoughness: 0.9 });
      it(new THREE.SphereGeometry(0.76, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), fur, 0, 0.22, 0).scale.set(1.05, 1.15, 1.05);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        it(new THREE.SphereGeometry(0.15, 12, 10), fur, Math.sin(a) * 0.64, 0.42 + (i % 3) * 0.1, Math.cos(a) * 0.64);
      }
    }
    if (cos.hat === "guard") {
      it(new THREE.ConeGeometry(0.7, 0.92, 32), metal("#a3acb9", 0.22), 0, 0.74, 0);
      it(new THREE.TorusGeometry(0.64, 0.065, 10, 40), gloss(cos.hatTrim ?? "#22d3ee"), 0, 0.33, 0).rotation.x = Math.PI / 2;
    }
    if (cos.eyepatch) it(new THREE.SphereGeometry(0.11, 14, 10), leather("#111827"), 0.22, 0.0, 0.55).scale.set(1.1, 1, 0.4);
  } else {
    const mainHex = main;
    switch (look.head) {
      case "cap": {
        it(new THREE.SphereGeometry(0.63, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.4), fabric(mainHex), 0, 0.05, 0);
        const b = it(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 32, 1, false, 0, Math.PI), fabric(mainHex), 0, 0.28, 0.32);
        b.rotation.y = -Math.PI / 2;
        it(new THREE.SphereGeometry(0.05, 10, 8), fabric(mainHex), 0, 0.62, 0);
        break;
      }
      case "beanie":
        it(new THREE.SphereGeometry(0.64, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.44), fabric("#0f766e", { roughness: 1 }), 0, 0.04, 0);
        it(new THREE.TorusGeometry(0.56, 0.07, 10, 40), fabric("#134e4a"), 0, 0.2, 0).rotation.x = Math.PI / 2;
        break;
      case "headphones": {
        const band = it(new THREE.TorusGeometry(0.65, 0.05, 10, 40, Math.PI), gloss("#1f2937"), 0, 0.02, 0);
        band.rotation.y = Math.PI / 2;
        for (const x of [-0.65, 0.65]) it(new THREE.CylinderGeometry(0.18, 0.18, 0.15, 24), gloss("#ef4444"), x, 0, 0).rotation.z = Math.PI / 2;
        break;
      }
      case "band":
        it(new THREE.TorusGeometry(0.6, 0.06, 10, 40), fabric("#dc2626"), 0, 0.22, 0).rotation.x = Math.PI / 2;
        break;
      case "helmet":
        it(new THREE.SphereGeometry(0.69, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.62), metal("#94a3b8", 0.25), 0, 0, 0);
        it(new THREE.BoxGeometry(0.8, 0.06, 0.1), basic("#334155"), 0, 0.1, 0.62);
        it(new THREE.ConeGeometry(0.1, 0.35, 10), gloss("#dc2626"), 0, 0.78, 0);
        break;
      case "wizard": {
        it(new THREE.CylinderGeometry(0.86, 0.86, 0.05, 40), fabric("#4c1d95"), 0, 0.38, 0);
        const c = it(new THREE.ConeGeometry(0.5, 1.1, 32), fabric("#6d28d9"), 0, 0.92, 0);
        c.rotation.z = -0.15;
        spin.push(it(new THREE.OctahedronGeometry(0.1), glow("#facc15", 1), 0.05, 0.85, 0.42));
        break;
      }
      case "astro":
        it(new THREE.SphereGeometry(0.84, 48, 32), track(new THREE.MeshPhysicalMaterial({ color: C("#e0f2fe"), transmission: 0.9, roughness: 0.03, thickness: 0.05, transparent: true, opacity: 0.35 })), 0, 0, 0);
        it(new THREE.TorusGeometry(0.66, 0.07, 10, 40), gloss("#cbd5e1"), 0, -0.6, 0).rotation.x = Math.PI / 2;
        break;
      case "crown": {
        const gold = metal("#fbbf24", 0.2);
        it(new THREE.CylinderGeometry(0.42, 0.45, 0.22, 32, 1, true), gold, 0, 0.6, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          it(new THREE.ConeGeometry(0.07, 0.22, 10), gold, Math.sin(a) * 0.42, 0.8, Math.cos(a) * 0.42);
        }
        it(new THREE.OctahedronGeometry(0.06), gloss("#ef4444"), 0, 0.6, 0.46);
        break;
      }
      case "halo": {
        const h = it(new THREE.TorusGeometry(0.42, 0.05, 12, 48), glow("#fde047", 1.5), 0, 0.85, 0);
        h.rotation.x = Math.PI / 2;
        spin.push(h);
        break;
      }
    }
  }

  // ---- Hand items (right hand) ----
  const hr = handR.R!;
  const inHand = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0) => mesh(geo(g), m, hr, x, y, z);
  const handKind = opts.holding ?? cos?.hand ?? look.hand;
  switch (handKind) {
    case "pencil": {
      const p = inHand(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 10), gloss("#facc15"), 0, 0, 0.06);
      p.rotation.x = Math.PI / 2.3;
      break;
    }
    case "book":
      inHand(new THREE.BoxGeometry(0.22, 0.28, 0.06), leather("#2563eb"), 0, -0.04, 0.09);
      break;
    case "laptop":
      inHand(new THREE.BoxGeometry(0.34, 0.22, 0.03), metal("#475569", 0.35), 0, -0.02, 0.12);
      inHand(new THREE.BoxGeometry(0.3, 0.18, 0.005), glow("#22d3ee", 0.7), 0, -0.02, 0.137);
      break;
    case "sword": {
      inHand(new THREE.BoxGeometry(0.045, 0.62, 0.012), metal("#e2e8f0", 0.12), 0, 0.36, 0.07);
      inHand(new THREE.BoxGeometry(0.2, 0.035, 0.04), metal("#a16207", 0.3), 0, 0.04, 0.07);
      inHand(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), leather("#451a03"), 0, -0.02, 0.07);
      break;
    }
    case "wand":
      inHand(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 8), leather("#78350f"), 0, 0.15, 0.07);
      spin.push(inHand(new THREE.OctahedronGeometry(0.06), glow("#fde047", 1.5), 0, 0.37, 0.07));
      break;
    case "trophy": {
      const gold = metal("#fbbf24", 0.18);
      inHand(new THREE.CylinderGeometry(0.12, 0.06, 0.18, 24), gold, 0, 0.08, 0.12);
      inHand(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 16), gold, 0, -0.04, 0.12);
      break;
    }
    case "pickaxe": {
      const pk = group(hr, 0, 0.02, 0.07);
      pk.rotation.z = 0.5;
      mesh(geo(new THREE.CylinderGeometry(0.02, 0.022, 0.5, 8)), leather("#78350f"), pk, 0, 0.2, 0);
      const headP = mesh(geo(new THREE.TorusGeometry(0.16, 0.025, 8, 20, Math.PI * 0.8)), metal("#94a3b8", 0.3), pk, 0, 0.38, 0);
      headP.rotation.z = Math.PI * 0.1;
      break;
    }
    case "dutor": {
      const d = group(hr, 0, 0.05, 0.1);
      d.rotation.z = 0.6;
      const body = mesh(geo(new THREE.SphereGeometry(0.11, 24, 18)), gloss("#b45309"), d, 0, -0.08, 0);
      body.scale.set(1, 1.25, 0.6);
      mesh(geo(new THREE.BoxGeometry(0.035, 0.46, 0.025)), gloss("#92400e"), d, 0, 0.24, 0);
      break;
    }
  }

  // ---- Back items: capes, wings, jetpack, backpack, tails ----
  let cape: T.Object3D | null = null;
  const wings: T.Object3D[] = [];
  const backKind = cos ? (cos.cape ? "cape" : "none") : look.back;
  const capeHex = cos?.cape ?? "#dc2626";
  if (backKind === "cape") {
    const pivot = group(chest, 0, 0.47, -0.17);
    const g = geo(new THREE.CylinderGeometry(0.28, 0.42, 0.72, 28, 6, true, Math.PI * 0.62, Math.PI * 0.76));
    mesh(g, track(new THREE.MeshPhysicalMaterial({ color: C(capeHex), roughness: 0.75, sheen: 1, sheenColor: lighten(capeHex, 0.4), side: THREE.DoubleSide })), pivot, 0, -0.36, 0);
    cape = pivot;
  }
  if (backKind === "backpack") {
    const bp = mesh(geo(new THREE.BoxGeometry(0.4, 0.42, 0.18, 4, 4, 2)), leather("#92400e"), chest, 0, 0.25, -0.3);
    bp.scale.set(1, 1, 1);
    mesh(geo(new THREE.BoxGeometry(0.3, 0.14, 0.06)), leather("#7c2d12"), chest, 0, 0.14, -0.41);
    for (const x of [-0.14, 0.14]) {
      const strap = mesh(geo(new THREE.TorusGeometry(0.2, 0.018, 6, 20, Math.PI)), leather("#451a03"), chest, x, 0.3, -0.04);
      strap.rotation.y = Math.PI / 2;
    }
  }
  if (backKind === "jetpack") {
    for (const x of [-0.13, 0.13]) {
      mesh(geo(new THREE.CylinderGeometry(0.085, 0.085, 0.4, 20)), metal("#64748b", 0.3), chest, x, 0.25, -0.3);
      const f = mesh(geo(new THREE.ConeGeometry(0.07, 0.22, 14)), glow("#f97316", 1.6), chest, x, -0.06, -0.3);
      f.rotation.x = Math.PI;
      flames.push(f);
    }
  }
  if (backKind === "wings" || backKind === "dragon") {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.3, 0.38, 0.85, 0.46, 0.92, 0.08);
    shape.bezierCurveTo(0.7, 0.08, 0.7, -0.22, 0.46, -0.3);
    shape.bezierCurveTo(0.3, -0.22, 0.15, -0.15, 0, 0);
    const wm =
      backKind === "wings"
        ? fabric("#f8fafc", { side: THREE.DoubleSide, sheen: 1, sheenColor: C("#e0f2fe") })
        : track(new THREE.MeshPhysicalMaterial({ color: C("#7c3aed"), side: THREE.DoubleSide, roughness: 0.45, clearcoat: 0.5 }));
    for (const s of [-1, 1]) {
      const pivot = group(chest, s * 0.1, 0.32, -0.24);
      const w = mesh(geo(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2 })), wm, pivot);
      w.scale.set(s, 1, 1);
      pivot.userData.side = s;
      wings.push(pivot);
    }
  }
  if (cos?.tail) {
    const tail = mesh(geo(new THREE.CapsuleGeometry(0.06, 0.36, 6, 12)), fabric(cos.tail), hips, 0.08, -0.04, -0.3);
    tail.rotation.x = -0.9;
    tail.rotation.z = -0.5;
  }

  // ---- Pet ----
  let pet: T.Group | null = null;
  if (look.pet !== "none") {
    pet = group(root, -0.85, 0, 0.35);
    const color = look.pet === "chick" ? "#fde047" : look.pet === "cat" ? "#f59e0b" : look.pet === "drone" ? "#334155" : "#22c55e";
    if (look.pet === "drone") {
      mesh(geo(new THREE.BoxGeometry(0.34, 0.1, 0.26)), metal(color, 0.3), pet, 0, 0.75, 0);
      mesh(geo(new THREE.SphereGeometry(0.05, 12, 10)), glow("#22d3ee", 1), pet, 0, 0.75, 0.14);
      spin.push(mesh(geo(new THREE.BoxGeometry(0.5, 0.015, 0.05)), metal("#94a3b8"), pet, 0, 0.83, 0));
    } else {
      const fur = fabric(color, { roughness: 0.9, sheen: 1, sheenRoughness: 0.8 });
      const body = mesh(geo(new THREE.SphereGeometry(0.19, 24, 18)), fur, pet, 0, 0.18, 0);
      body.scale.set(1, 0.9, 1.1);
      const ph = mesh(geo(new THREE.SphereGeometry(0.15, 24, 18)), fur, pet, 0, 0.4, 0.06);
      ph.scale.set(1.05, 1, 1);
      for (const x of [-0.055, 0.055]) mesh(geo(new THREE.SphereGeometry(0.03, 12, 10)), gloss("#0f172a"), pet, x, 0.43, 0.19);
      if (look.pet === "chick") mesh(geo(new THREE.ConeGeometry(0.035, 0.08, 10)), gloss("#f97316"), pet, 0, 0.38, 0.22).rotation.x = Math.PI / 2;
      if (look.pet === "cat") for (const x of [-0.09, 0.09]) mesh(geo(new THREE.ConeGeometry(0.05, 0.11, 10)), fur, pet, x, 0.56, 0.04);
      if (look.pet === "dragon") for (const s of [-1, 1]) mesh(geo(new THREE.ConeGeometry(0.07, 0.22, 6)), gloss("#15803d"), pet, s * 0.18, 0.26, -0.1).rotation.z = -s * 1.2;
    }
  }

  // ---- Pose ----
  let faceNow: FaceKey = "idle";
  const setFace = (f: FaceKey) => {
    if (f === faceNow) return;
    faceNow = f;
    mouthM.map = mouthTex[f] ?? mouthTex.idle!;
    mouthM.needsUpdate = true;
  };
  // Upper lid angle: negative = open (dome tipped back behind the eye), positive = closing over the front
  const lidFor = (f: FaceKey) => (f === "blink" ? 0.62 : f === "happy" ? -0.18 : f === "sad" ? -0.42 : f === "hit" ? 0.5 : f === "think" ? -0.9 : -1.22);
  // Lower lid: positive = hidden below the eye, smaller = rising (happy squint)
  const lowFor = (f: FaceKey) => (f === "happy" ? 0.5 : f === "hit" ? 0.55 : 1.25);
  const browFor = (f: FaceKey, s: number) =>
    f === "sad" ? { y: 0.11, rz: -s * 0.25 } : f === "hit" ? { y: 0.1, rz: s * 0.3 } : f === "happy" ? { y: 0.15, rz: s * 0.05 } : f === "think" ? { y: s > 0 ? 0.16 : 0.12, rz: s > 0 ? -0.15 : 0.1 } : { y: 0.13, rz: s * 0.06 };
  const lidState = eyes.map(() => ({ lid: -1.22, low: 1.25 }));

  const pose = (p: Pose, t: number, gaze?: { x: number; y: number }) => {
    const sideOf = (v: number) => (v < 0 ? -1 : 1);
    void sideOf;
    root.position.set(p.shakeX * CHAR_H, p.y * CHAR_H, 0);
    root.scale.set(p.sx, p.sy, p.sx);
    root.rotation.z = p.down * 1.35;
    hips.position.y = HIP_Y - p.crouch * 0.11;
    spine.rotation.x = p.lean * 0.9 + p.crouch * 0.18;
    chest.scale.set(1 + p.breath * 0.012, 1 + p.breath * 0.018, 1 + p.breath * 0.012);
    neck.rotation.z = p.head;
    neck.rotation.x = -p.lean * 0.5 - p.crouch * 0.1;
    neck.position.y = 0.5 - p.headY * CHAR_H;
    if (gaze) {
      head.rotation.y += (gaze.x * 0.55 - head.rotation.y) * 0.15;
      head.rotation.x += (gaze.y * 0.3 - head.rotation.x) * 0.15;
    }
    // Arms: raise outward (z), swing forward/back (x), elbow bend — upward when the arm is raised sideways
    const arm = (sh: T.Group, el: T.Group, out: number, swing: number, fore: number, s: number) => {
      sh.rotation.z = s * -out;
      sh.rotation.x = -swing;
      const k = smooth(0.9, 1.5, Math.abs(out));
      el.rotation.x = -fore * (1 - k);
      el.rotation.z = s * -fore * k;
    };
    arm(shoulderL, elbowL, p.armL, p.armSwingL, p.foreL, 1);
    arm(shoulderR, elbowR, p.armR, p.armSwingR, p.foreR, -1);
    // Legs: swing, knee, crouch (knees forward, hips down) — feet kept roughly flat
    const leg = (hp: T.Group, kn: T.Group, an: T.Group, out: number, swing: number, knee: number, s: number) => {
      const thigh = -swing - p.crouch * 0.9;
      const bend = knee + p.crouch * 1.55;
      hp.rotation.x = thigh;
      hp.rotation.z = s * -out * 0.6;
      kn.rotation.x = bend;
      an.rotation.x = -(thigh + bend) * 0.85;
    };
    leg(hipL, kneeL, ankleL, p.legL, p.legSwingL, p.kneeL, 1);
    leg(hipR, kneeR, ankleR, -p.legR, p.legSwingR, p.kneeR, -1);
    // Face: eyelids ease toward the expression, brows, mouth texture, gaze in the eyes
    setFace(p.face);
    eyes.forEach((e, i) => {
      const st = lidState[i];
      const targetLid = lidFor(p.face);
      st.lid += (targetLid - st.lid) * (p.face === "blink" ? 0.7 : 0.25);
      st.low += (lowFor(p.face) - st.low) * 0.25;
      e.lid.rotation.x = st.lid;
      e.low.rotation.x = st.low;
      const b = browFor(p.face, e.side);
      e.brow.position.y += (b.y - e.brow.position.y) * 0.25;
      e.brow.rotation.x = 0;
      e.brow.rotation.z = Math.PI / 2 + b.rz;
      if (gaze) {
        e.iris.position.x = Math.max(-0.02, Math.min(0.02, gaze.x * 0.02));
        e.iris.position.y = -0.004 + Math.max(-0.015, Math.min(0.015, -gaze.y * 0.015));
      }
    });
    // Follow-through and effects
    if (cape) cape.rotation.x = 0.12 + p.back + Math.sin(t * 2.2) * 0.04;
    for (const w of wings) w.rotation.y = w.userData.side * (0.35 + Math.sin(t * 4.5) * 0.25);
    for (const f of flames) f.scale.y = 0.85 + Math.sin(t * 38 + f.id) * 0.2;
    for (const s of spin) s.rotation.y += 0.03;
    if (pet) pet.position.y = Math.abs(Math.sin(t * 3)) * 0.12;
  };

  return {
    root,
    pose,
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

export type { Joints };
