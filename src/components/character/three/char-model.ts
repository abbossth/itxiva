// Chibi 3D character model (three.js), built procedurally from the student's look.
// Style target: collectible vinyl-figure renders — big sculpted head (~43% of height), small stocky body,
// chunky boots, big glossy eyes painted on the head surface with animated lids, hair made of layered
// clumps over a volume shell, lofted clothes with fabric/denim/leather micro-detail, wrapped "subsurface"
// skin shading. The model is a skeleton of groups (hips → spine → chest → neck → head, shoulder → elbow →
// hand, hip → knee → ankle) driven by the shared rig poses (lib/game/rig.ts) — used by the profile scene
// and baked into sprite sheets for every 2D place (char-baker.ts).

import type * as T from "three";
import { DEFAULT_LOOK, OUTFIT_COLORS, type GameLook } from "@/lib/character/catalog";
import type { FaceKey, Pose } from "@/lib/game/rig";
import { COSTUMES, type Costume } from "../character-svg";
import {
  HEAD_R,
  mergeStatic,
  applySkinShading,
  band,
  detailNormal,
  eyeMaterial,
  gridSurface,
  headPatch,
  limbLoft,
  loft,
  makeHeadSurface,
  ringAt,
  ringPoint,
  sculptHead,
  sweep,
  type DetailKind,
  type EyeUniforms,
  type Ring,
} from "./sculpt";

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
/** Piecewise smooth curve through [x, y] keys */
const keys = (k: [number, number][]) => (x: number) => {
  if (x <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++)
    if (x <= k[i][0]) {
      const t = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      const s = t * t * (3 - 2 * t);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * s;
    }
  return k[k.length - 1][1];
};
/** Small deterministic random */
const rnd = (i: number, s = 1) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
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
  const darken = (hex: string, k: number) => C(hex).multiplyScalar(1 - k);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const hs = makeHeadSurface(THREE);

  // ---- Materials (identical requests share one instance — fewer programs/state changes, more merging) ----
  const memo = new Map<string, T.Material>();
  const keyOf = (o: unknown) =>
    JSON.stringify(o, (_k, v) => (v && typeof v === "object" && "isColor" in v ? `#${(v as T.Color).getHexString()}` : v && typeof v === "object" && "isVector2" in v ? [(v as T.Vector2).x, (v as T.Vector2).y] : v));
  const cached = <M extends T.Material>(key: string, make: () => M): M => {
    const hit = memo.get(key);
    if (hit) return hit as M;
    const m = make();
    memo.set(key, m);
    return m;
  };
  const texMemo = new Map<string, T.Texture>();
  const det = (kind: DetailKind, rep: [number, number]) => {
    const k = `${kind}|${rep.join(",")}`;
    let t = texMemo.get(k);
    if (!t) {
      t = track(detailNormal(THREE, kind, rep));
      texMemo.set(k, t);
    }
    return t;
  };
  const fabric = (hex: string, o: Partial<T.MeshPhysicalMaterialParameters> = {}, kind: DetailKind = "weave", rep: [number, number] = [10, 6], k = 0.35) =>
    cached(`fabric|${hex}|${keyOf(o)}|${kind}|${rep.join(",")}|${k}`, () => track(
      new THREE.MeshPhysicalMaterial({
        color: C(hex),
        roughness: 0.84,
        sheen: 1,
        sheenRoughness: 0.6,
        sheenColor: lighten(hex, 0.4),
        normalMap: det(kind, rep),
        normalScale: new THREE.Vector2(k, k),
        ...o,
      })
    ));
  const leather = (hex: string, rep: [number, number] = [4, 4]) =>
    cached(`leather|${hex}|${rep.join(",")}`, () => track(new THREE.MeshPhysicalMaterial({ color: C(hex), roughness: 0.48, clearcoat: 0.45, clearcoatRoughness: 0.4, normalMap: det("leather", rep), normalScale: new THREE.Vector2(0.4, 0.4) })));
  const metal = (hex: string, rough = 0.28) =>
    cached(`metal|${hex}|${rough}`, () => track(new THREE.MeshPhysicalMaterial({ color: C(hex), metalness: 0.95, roughness: rough, clearcoat: 0.5, clearcoatRoughness: 0.15, normalMap: det("metal", [2, 2]), normalScale: new THREE.Vector2(0.25, 0.25) })));
  const gloss = (hex: string) => cached(`gloss|${hex}`, () => track(new THREE.MeshPhysicalMaterial({ color: C(hex), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 })));
  const glow = (hex: string, k = 1.4) => cached(`glow|${hex}|${k}`, () => track(new THREE.MeshStandardMaterial({ color: C(hex), emissive: C(hex), emissiveIntensity: k })));
  const basic = (hex: string, opts: Partial<T.MeshBasicMaterialParameters> = {}) => cached(`basic|${hex}|${keyOf(opts)}`, () => track(new THREE.MeshBasicMaterial({ color: C(hex), ...opts })));
  const rubber = (hex: string) => cached(`rubber|${hex}`, () => track(new THREE.MeshPhysicalMaterial({ color: C(hex), roughness: 0.92, normalMap: det("leather", [8, 2]), normalScale: new THREE.Vector2(0.6, 0.6) })));

  const skinHex = cos?.skin ?? SKIN[look.skin] ?? SKIN.peach;
  const skinMat = (hex: string, extra: Partial<T.MeshPhysicalMaterialParameters> = {}) => {
    const m = track(
      new THREE.MeshPhysicalMaterial({
        color: C(hex),
        roughness: 0.52,
        sheen: 0.35,
        sheenRoughness: 0.55,
        sheenColor: C("#ffd5c8"),
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
        normalMap: det("skin", [5, 3]),
        normalScale: new THREE.Vector2(0.12, 0.12),
        ...(look.skin === "galaxy" ? { emissive: C("#4c1d95"), emissiveIntensity: 0.35 } : {}),
        ...extra,
      })
    );
    if (look.skin !== "galaxy") applySkinShading(THREE, m, ["mint", "sky", "lilac"].includes(look.skin) ? 0.5 : 1);
    return m;
  };
  const skin = look.skin === "gold" ? metal("#f5c542", 0.3) : skinMat(skinHex);
  const skinShade = look.skin === "gold" ? skin : skinMat(C(skinHex).multiplyScalar(0.9).getHexString().replace(/^/, "#"));
  const hairHex = look.hair === "fire" ? "#f97316" : look.skin === "galaxy" ? "#2e1065" : look.hair === "mohawk" ? "#db2777" : "#2c190e";
  const hairMat = (rep: [number, number] = [3, 1]) =>
    look.hair === "fire"
      ? track(
          new THREE.MeshPhysicalMaterial({
            color: C("#fb923c"),
            emissive: C("#f97316"),
            emissiveIntensity: 0.85,
            roughness: 0.45,
            normalMap: det("hair", rep),
            normalScale: new THREE.Vector2(0.5, 0.5),
          })
        )
      : track(
          new THREE.MeshPhysicalMaterial({
            color: C(hairHex),
            roughness: 0.5,
            sheen: 0.4,
            sheenRoughness: 0.4,
            sheenColor: lighten(hairHex, 0.25),
            normalMap: det("hair", rep),
            normalScale: new THREE.Vector2(0.38, 0.38),
            anisotropy: 0.35,
            anisotropyRotation: Math.PI / 2,
          })
        );
  const hair = hairMat();
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
        return { body: main, trim: "#f8fafc", legs: "#2f4f8f", boots: "#6b4428", kind: "tee" as const };
    }
  })();
  const jeans = !cos && (outfit.kind === "tee" || outfit.kind === "hoodie");
  const suit = !cos && (outfit.kind === "space" || outfit.kind === "hero");
  const bodyM =
    outfit.kind === "armor"
      ? metal(outfit.body, 0.32)
      : outfit.kind === "space"
        ? fabric(outfit.body, { roughness: 0.6, sheen: 0.4, clearcoat: 0.25 }, "weave", [14, 8], 0.5)
        : outfit.kind === "hoodie"
          ? fabric(outfit.body, { roughness: 0.92, sheenRoughness: 0.8 }, "knit", [16, 10], 0.18)
          : fabric(outfit.body);
  const trimM = outfit.kind === "armor" || outfit.kind === "royal" ? metal(outfit.trim, 0.25) : fabric(outfit.trim, {}, "knit", [24, 2], 0.4);
  const legM = jeans ? fabric(outfit.legs, { roughness: 0.9, sheen: 0.6 }, "denim", [6, 4], 0.55) : suit ? bodyM : fabric(outfit.legs, { roughness: 0.88 }, "weave", [8, 6]);
  const bootM = leather(outfit.boots);
  const soleM = rubber("#2a211c");
  const buckleM = metal("#d6b25e", 0.25);

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
  const decal = (g: T.BufferGeometry, m: T.Material, parent: T.Object3D) => {
    const o = mesh(geo(g), m, parent);
    o.castShadow = false;
    return o;
  };
  /** Rotationally symmetric shape from [radius, y] points */
  const lathe = (pts: [number, number][], seg = 40) => geo(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg));
  /** Tapered limb hanging down from y = 0 to y = -len, rounded ends (kept for items) */
  const limb = (r1: number, r2: number, len: number, seg = 28) => geo(limbLoft(THREE, [[0, r1], [-len * 0.5, (r1 + r2) / 2 + 0.004], [-len, r2]], { seg }));
  void limb;
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
  /** Rounded box (soft-edged slab) */
  const slab = (w: number, h: number, d: number, r = Math.min(w, h, d) * 0.3) => {
    const rings: Ring[] = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      rings.push({ y: -h / 2 + r - Math.cos(a) * r, rx: w / 2 - r + Math.sin(a) * r, rz: d / 2 - r + Math.sin(a) * r, n: 6 });
    }
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      rings.push({ y: h / 2 - r + Math.sin(a) * r, rx: w / 2 - r + Math.cos(a) * r, rz: d / 2 - r + Math.cos(a) * r, n: 6 });
    }
    rings.unshift({ y: -h / 2, rx: 1e-4, rz: 1e-4, n: 6 });
    rings.push({ y: h / 2, rx: 1e-4, rz: 1e-4, n: 6 });
    return geo(loft(THREE, rings, { seg: 40, rows: rings.length * 2 }));
  };

  // ---- Skeleton ----
  const root = new THREE.Group();
  const hips = group(root, 0, HIP_Y, 0);
  const spine = group(hips, 0, 0.05, 0);
  const chest = group(spine, 0, 0, 0);
  const neck = group(chest, 0, 0.5, 0);
  const head = group(neck, 0, HEAD_R - 0.02, 0.02);
  const shoulderL = group(chest, -0.3, 0.4, 0);
  const shoulderR = group(chest, 0.3, 0.4, 0);
  const elbowL = group(shoulderL, 0, -0.22, 0);
  const elbowR = group(shoulderR, 0, -0.22, 0);
  const hipL = group(hips, -0.13, -0.04, 0);
  const hipR = group(hips, 0.13, -0.04, 0);
  const kneeL = group(hipL, 0, -0.23, 0);
  const kneeR = group(hipR, 0, -0.23, 0);
  const ankleL = group(kneeL, 0, -0.22, 0);
  const ankleR = group(kneeR, 0, -0.22, 0);
  for (const j of [shoulderL, shoulderR, hipL, hipR]) j.rotation.order = "ZXY";

  // ---- Torso: one lofted shape — soft belly, chest, sloped shoulders into the neck ----
  const torsoRings: Ring[] = [
    { y: -0.115, rx: 0.286, rz: 0.216, n: 2.4 },
    { y: -0.06, rx: 0.282, rz: 0.212, n: 2.4, z: 0.002 },
    { y: 0.04, rx: 0.276, rz: 0.207, n: 2.3, z: 0.004 },
    { y: 0.17, rx: 0.276, rz: 0.2, n: 2.4, z: 0.006 },
    { y: 0.3, rx: 0.292, rz: 0.19, n: 2.5, z: 0.004 },
    { y: 0.39, rx: 0.3, rz: 0.178, n: 2.6 },
    { y: 0.455, rx: 0.24, rz: 0.15, n: 2.4 },
    { y: 0.5, rx: 0.13, rz: 0.11, n: 2.1 },
    { y: 0.52, rx: 0.085, rz: 0.08, n: 2 },
  ];
  // soft cloth folds: ripples above the hem and diagonal pulls from the armpits (not on armor / suits)
  const folds = outfit.kind !== "armor" && outfit.kind !== "space";
  const torsoDisp = (th: number, y: number) => {
    if (!folds) return 0;
    const side = Math.abs(Math.cos(th));
    const waist = (1 - smooth(-0.05, 0.08, y)) * smooth(-0.13, -0.08, y) * 0.0045 * Math.sin(y * 95 + Math.sin(th * 3) * 1.8);
    const pit = smooth(0.55, 0.95, side) * smooth(0.12, 0.24, y) * (1 - smooth(0.34, 0.4, y)) * 0.006 * Math.sin((y + (1 - side) * 0.25) * 70);
    const belly = Math.max(0, Math.sin(th)) * smooth(-0.02, 0.06, y) * (1 - smooth(0.12, 0.2, y)) * 0.003 * Math.sin(y * 120 + Math.cos(th) * 4);
    return waist + pit + belly;
  };
  mesh(geo(loft(THREE, torsoRings, { seg: 72, rows: 84, disp: torsoDisp })), bodyM, chest);
  /** Normalised loft height for a y on the torso */
  const torsoV = (y: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (ringAt(torsoRings, mid).y < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  /** Point and outward normal on the torso surface (θ = π/2 → front centre) */
  const torsoFrame = (theta: number, y: number, lift = 0) => {
    const v = torsoV(y);
    const p = ringPoint(ringAt(torsoRings, v), theta, V());
    const e = 0.002;
    const a = ringPoint(ringAt(torsoRings, v), theta + e, V()).sub(ringPoint(ringAt(torsoRings, v), theta - e, V()));
    const b = ringPoint(ringAt(torsoRings, Math.min(1, v + e)), theta, V()).sub(ringPoint(ringAt(torsoRings, Math.max(0, v - e)), theta, V()));
    const n = V().crossVectors(b, a).normalize();
    if (n.dot(V(p.x, 0, p.z)) < 0) n.negate();
    p.addScaledVector(n, lift);
    return { p, n };
  };
  /** Place an object on the torso, facing outward */
  const onTorso = (o: T.Object3D, theta: number, y: number, lift = 0) => {
    const f = torsoFrame(theta, y, lift);
    o.position.copy(f.p);
    o.quaternion.setFromUnitVectors(V(0, 0, 1), f.n);
    chest.add(o);
    return o;
  };
  /** Patch hugging the torso (emblems, pockets, plates): w × h around (θc, yc) */
  const torsoPatch = (thetaC: number, yc: number, w: number, h: number, lift: number, bulge = 0) => {
    const r0 = torsoFrame(thetaC, yc).p;
    const rr = Math.hypot(r0.x, r0.z - 0.004);
    return gridSurface(
      THREE,
      16,
      16,
      (u, v, out) => {
        const a = u * 2 - 1;
        const b = v * 2 - 1;
        const f = torsoFrame(thetaC - (a * w) / 2 / rr, yc + (b * h) / 2, lift + bulge * Math.max(0, 1 - a * a) * Math.max(0, 1 - b * b));
        out.copy(f.p);
      },
      { center: (_u, _v, out) => out.set(0, yc, 0) }
    );
  };
  // Pelvis (trousers / shorts top) — slightly wider than the waist, rounding under into the crotch
  mesh(
    geo(
      loft(
        THREE,
        [
          { y: -0.165, rx: 0.001, rz: 0.001 },
          { y: -0.16, rx: 0.09, rz: 0.08, n: 2.2 },
          { y: -0.13, rx: 0.2, rz: 0.165, n: 2.3 },
          { y: -0.07, rx: 0.262, rz: 0.2, n: 2.4 },
          { y: 0.0, rx: 0.258, rz: 0.195, n: 2.4 },
          { y: 0.1, rx: 0.24, rz: 0.18, n: 2.3 },
          { y: 0.11, rx: 0.001, rz: 0.001 },
        ],
        { seg: 48, rows: 36 }
      )
    ),
    legM,
    hips
  );
  // Neck
  mesh(geo(limbLoft(THREE, [[0.07, 0.075, 0.07], [-0.02, 0.082, 0.078]], { seg: 24 })), skinShade, neck, 0, 0, 0.005);

  // ---- Outfit details ----
  const ringMesh = (g: T.BufferGeometry, m: T.Material, parent: T.Object3D, y: number, z = 0, tilt = 0) => {
    const o = mesh(geo(g), m, parent, 0, y, z);
    o.rotation.x = tilt;
    return o;
  };
  const collar = (m: T.Material, rx = 0.118, rz = 0.105, h = 0.034, th = 0.016) => ringMesh(band(THREE, rx, rz, h, th), m, chest, 0.5, 0.008, 0.22);
  const hem = () => ringMesh(band(THREE, 0.287, 0.217, 0.03, 0.011, { n: 2.4 }), bodyM, chest, -0.1, 0);
  const belt = (hex: string, buckle = true) => {
    ringMesh(band(THREE, 0.27, 0.203, 0.05, 0.014, { n: 2.4 }), leather(hex, [12, 1]), hips, 0.06, 0.002);
    if (buckle) {
      const b = mesh(slab(0.085, 0.065, 0.02, 0.008), buckleM, hips, 0, 0.06, 0.212);
      b.rotation.x = -0.05;
      mesh(slab(0.045, 0.03, 0.022, 0.005), leather(hex), hips, 0, 0.06, 0.214);
    }
  };
  const chestDecal = (draw: (c: CanvasRenderingContext2D) => void, w = 0.24, h = 0.24, y = 0.25) => {
    const tex = canvasTex(256, 256, draw);
    const m = track(new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.65, sheen: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    return decal(torsoPatch(Math.PI / 2, y, w, h, 0.003), m, chest);
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
  const button = (theta: number, y: number, hex = "#f8fafc") => {
    const b = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 16)), gloss(hex));
    b.rotation.x = Math.PI / 2;
    const g = new THREE.Group();
    g.add(b);
    onTorso(g, theta, y, 0.004);
  };
  if (!cos) {
    switch (outfit.kind) {
      case "tee":
        collar(trimM);
        hem();
        break;
      case "hoodie": {
        // hood folded behind the neck: a thick soft roll
        const pts: T.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const a = Math.PI * 0.12 + (i / 10) * Math.PI * 1.76;
          pts.push(V(Math.cos(a + Math.PI / 2) * 0.17, 0.5 + Math.sin(i / 10 * Math.PI) * 0.06, -Math.abs(Math.sin(a + Math.PI / 2)) * 0.15 - 0.02 + (i === 0 || i === 10 ? 0.12 : 0)));
        }
        mesh(geo(sweep(THREE, pts, (t) => [0.075 * (0.75 + 0.25 * Math.sin(Math.PI * t)), 0.05], (p, out) => out.set(p.x, 0.6, p.z).normalize(), { rows: 30, seg: 14 })), bodyM, chest);
        const pocket = fabric(outfit.body, { color: darken(outfit.body, 0.08) }, "knit", [6, 3], 0.18);
        decal(torsoPatch(Math.PI / 2, 0.11, 0.3, 0.14, 0.012, 0.004), pocket, chest).castShadow = true;
        for (const x of [-1, 1]) {
          const s = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.007, 0.13, 4, 8)), gloss("#f8fafc"));
          s.position.set(x * 0.05, 0.4, 0.17);
          s.rotation.x = 0.15;
          chest.add(s);
          const tip = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 10)), metal("#cbd5e1", 0.3));
          tip.position.set(x * 0.05, 0.32, 0.182);
          chest.add(tip);
        }
        hem();
        break;
      }
      case "school": {
        collar(fabric("#f8fafc"), 0.118, 0.106, 0.04, 0.02);
        // tie: knot + tapered blade lying on the chest
        const tie = gloss("#dc2626");
        onTorso(new THREE.Mesh(slab(0.045, 0.035, 0.02, 0.008), tie), Math.PI / 2, 0.47, 0.012);
        const blade = new THREE.Mesh(
          geo(
            loft(THREE, [
              { y: -0.2, rx: 0.001, rz: 0.001 },
              { y: -0.185, rx: 0.04, rz: 0.008, n: 1.2 },
              { y: -0.05, rx: 0.034, rz: 0.008, n: 1.6 },
              { y: 0, rx: 0.02, rz: 0.008, n: 2 },
              { y: 0.002, rx: 0.001, rz: 0.001 },
            ])
          ),
          tie
        );
        const bg = new THREE.Group();
        bg.add(blade);
        blade.position.y = 0;
        onTorso(bg, Math.PI / 2, 0.44, 0.012).rotation.x -= 0.12;
        for (const y of [0.16, 0.06]) button(Math.PI / 2 + 0.25, y, "#e2e8f0");
        belt("#1f1712");
        break;
      }
      case "ninja": {
        ringMesh(band(THREE, 0.272, 0.205, 0.09, 0.016, { n: 2.4 }), fabric(outfit.trim, {}, "weave", [14, 2]), hips, 0.07);
        // knot at the side
        const knot = mesh(geo(new THREE.SphereGeometry(0.04, 16, 12)), fabric(outfit.trim), hips, 0.2, 0.07, 0.15);
        knot.scale.set(1, 0.8, 0.7);
        collar(fabric("#374151"), 0.13, 0.115, 0.06, 0.022);
        // crossed robe lapels
        for (const s of [-1, 1]) {
          const lap = decal(torsoPatch(Math.PI / 2 + s * 0.22, 0.32, 0.05, 0.3, 0.006, 0.003), fabric("#374151"), chest);
          lap.rotation.z = s * 0.35;
        }
        break;
      }
      case "armor": {
        const plateM = metal("#cbd5e1", 0.2);
        decal(torsoPatch(Math.PI / 2, 0.24, 0.42, 0.34, 0.02, 0.02), plateM, chest).castShadow = true;
        for (const sh of [shoulderL, shoulderR]) {
          const pd = mesh(geo(new THREE.SphereGeometry(0.13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), plateM, sh, 0, 0.02, 0);
          pd.scale.set(1.05, 0.75, 1);
          const rim = mesh(geo(new THREE.TorusGeometry(0.13, 0.012, 8, 32)), metal(outfit.trim, 0.2), sh, 0, 0.02, 0);
          rim.rotation.x = Math.PI / 2;
          rim.scale.set(1.05, 1, 1);
        }
        onTorso(new THREE.Mesh(geo(new THREE.SphereGeometry(0.04, 20, 14)), gloss("#dc2626")), Math.PI / 2, 0.3, 0.035);
        belt("#3f2a1d");
        break;
      }
      case "space": {
        collar(gloss("#cbd5e1"), 0.15, 0.14, 0.07, 0.035);
        const panel = new THREE.Mesh(slab(0.2, 0.12, 0.035, 0.012), gloss("#cbd5e1"));
        onTorso(panel, Math.PI / 2, 0.26, 0.012);
        ["#ef4444", "#22c55e", "#3b82f6"].forEach((c, i) => {
          const l = new THREE.Mesh(geo(new THREE.SphereGeometry(0.016, 12, 10)), glow(c, 0.9));
          l.position.set(-0.05 + i * 0.05, 0, 0.02);
          panel.add(l);
        });
        ringMesh(band(THREE, 0.278, 0.207, 0.028, 0.012, { n: 2.4 }), fabric(outfit.trim), chest, 0.04);
        belt("#64748b");
        break;
      }
      case "hero":
        collar(fabric(outfit.trim), 0.12, 0.108, 0.03, 0.014);
        chestDecal((c) => star(c, 128, 128, 100, "#facc15"));
        belt("#facc15");
        break;
      case "royal": {
        collar(metal(outfit.trim, 0.22), 0.125, 0.112, 0.036, 0.018);
        decal(torsoPatch(Math.PI / 2, 0.23, 0.05, 0.42, 0.006, 0.003), metal(outfit.trim, 0.22), chest);
        onTorso(new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.035)), gloss("#ef4444")), Math.PI / 2, 0.3, 0.02);
        for (const y of [0.18, 0.1, 0.02]) button(Math.PI / 2, y, "#fbbf24");
        belt("#3f2a1d");
        break;
      }
    }
  } else {
    collar(fabric(cos.trim));
    hem();
    const em = cos.emblem;
    if (em === "belly") {
      decal(torsoPatch(Math.PI / 2, 0.15, 0.34, 0.36, 0.01, 0.03), fabric(cos.trim), chest).castShadow = true;
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
        0.22
      );
    else if (em === "sash") {
      ringMesh(band(THREE, 0.276, 0.208, 0.08, 0.016, { n: 2.4 }), fabric(cos.accent ?? cos.trim), hips, 0.07);
      mesh(geo(new THREE.SphereGeometry(0.05, 16, 12)), fabric(cos.trim), hips, 0.13, 0.06, 0.2);
    } else if (em === "skull" || em === "snow" || em === "wind" || em === "leaf")
      chestDecal((c) => {
        c.lineWidth = 18;
        c.lineCap = "round";
        c.strokeStyle = em === "snow" ? "#0ea5e9" : cos.trim;
        c.beginPath();
        if (em === "snow")
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI;
            c.moveTo(128 - Math.cos(a) * 90, 128 - Math.sin(a) * 90);
            c.lineTo(128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90);
          }
        else if (em === "wind")
          for (let i = 0; i < 3; i++) {
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

  // ---- Arms: shoulder cap, upper arm, forearm, sleeves with real hems, mitten hands with fingers ----
  const shortSleeve = !cos && outfit.kind === "tee";
  const gloved = (!cos && (outfit.kind === "ninja" || outfit.kind === "armor" || outfit.kind === "space")) || Boolean(cos?.helmet);
  const handM = gloved ? (outfit.kind === "armor" ? metal("#94a3b8", 0.3) : leather(outfit.kind === "space" ? "#e2e8f0" : "#1f2937")) : skin;
  const handR = { L: null as T.Group | null, R: null as T.Group | null };
  const sleeveGeo = (len: number, r: number) =>
    geo(
      loft(
        THREE,
        [
          { y: 0.075, rx: 0.001, rz: 0.001 },
          { y: 0.07, rx: r * 0.55, rz: r * 0.5 },
          { y: 0.045, rx: r * 0.92, rz: r * 0.88 },
          { y: 0.0, rx: r, rz: r * 0.95 },
          { y: -len * 0.6, rx: r * 0.98, rz: r * 0.94 },
          { y: -len, rx: r * 1.03, rz: r * 0.98 },
          { y: -len - 0.012, rx: r * 0.96, rz: r * 0.92 },
          { y: -len - 0.006, rx: r * 0.8, rz: r * 0.76 },
        ],
        { seg: 32, rows: 30 }
      )
    );
  for (const side of ["L", "R"] as const) {
    const s = side === "L" ? -1 : 1;
    const sh = side === "L" ? shoulderL : shoulderR;
    const el = side === "L" ? elbowL : elbowR;
    const armSkin = shortSleeve ? skin : bodyM;
    mesh(geo(limbLoft(THREE, [[0.02, 0.078, 0.074], [-0.11, 0.074, 0.07], [-0.22, 0.066, 0.063]], { seg: 28 })), armSkin, sh);
    if (shortSleeve) mesh(sleeveGeo(0.11, 0.098), bodyM, sh, 0, 0.005, 0);
    else if (outfit.kind !== "armor") mesh(sleeveGeo(0.02, 0.09), bodyM, sh, 0, 0.0, 0);
    mesh(geo(limbLoft(THREE, [[0.03, 0.066, 0.064], [-0.1, 0.062, 0.058], [-0.185, 0.054, 0.05]], { seg: 28 })), armSkin, el);
    if (!shortSleeve) ringMesh(band(THREE, 0.06, 0.056, 0.04, 0.012), trimM, el, -0.175);
    // Hand (origin = palm centre): palm, four short fingers curled forward, thumb
    const hand = group(el, 0, -0.245, 0.005);
    mesh(geo(limbLoft(THREE, [[0.04, 0.046, 0.03], [0.0, 0.056, 0.034], [-0.035, 0.054, 0.033]], { seg: 24, n: 2.4 })), handM, hand);
    for (let i = 0; i < 4; i++) {
      const f = mesh(geo(new THREE.CapsuleGeometry(0.0175, 0.035, 4, 10)), handM, hand, (i - 1.5) * 0.026, -0.072 + Math.abs(i - 1.5) * 0.006, 0.006);
      f.rotation.x = 0.35;
      f.rotation.z = (i - 1.5) * 0.05;
    }
    const thumb = mesh(geo(new THREE.CapsuleGeometry(0.019, 0.04, 4, 10)), handM, hand, -s * 0.038, -0.01, 0.03);
    thumb.rotation.z = -s * 0.55;
    thumb.rotation.x = 0.5;
    handR[side] = hand;
  }

  // ---- Legs: thighs and shins (trousers), chunky lofted boots ----
  const footGeo = (() => {
    const len = 0.36;
    const z0 = -0.12;
    const wx = keys([[0, 0.05], [0.12, 0.092], [0.45, 0.1], [0.75, 0.104], [0.93, 0.085], [1, 0.03]]);
    const ht = keys([[0, 0.06], [0.15, 0.13], [0.4, 0.13], [0.62, 0.075], [0.9, 0.055], [1, 0.02]]);
    const yb = -0.178;
    return gridSurface(
      THREE,
      36,
      28,
      (u, v, out) => {
        const a = u * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const end = Math.pow(Math.sin(Math.PI * Math.max(0.0005, Math.min(0.9995, v))), 0.3);
        const x = wx(v) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.8) * end;
        const y = yb + (sa > 0 ? ht(v) * Math.pow(sa, 0.9) : 0.012 * sa) * end;
        out.set(x, y, z0 + v * len);
      },
      { wrapU: true, center: (_u, v, out) => out.set(0, yb + 0.04, z0 + v * len) }
    );
  })();
  const soleGeo = (() => {
    const shape = new THREE.Shape();
    const pts: [number, number][] = [];
    const wx = keys([[0, 0.06], [0.1, 0.1], [0.45, 0.106], [0.78, 0.112], [0.94, 0.09], [1, 0.035]]);
    for (let i = 0; i <= 24; i++) {
      const v = i / 24;
      pts.push([wx(v), -0.135 + v * 0.38]);
    }
    shape.moveTo(0, pts[0][1] - 0.004);
    for (const [x, z] of pts) shape.lineTo(x, z);
    shape.lineTo(0, pts[24][1] + 0.004);
    for (let i = 24; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 3, curveSegments: 4 });
    g.rotateX(Math.PI / 2);
    g.translate(0, -0.176, 0);
    return geo(g);
  })();
  const shaftGeo = geo(
    loft(
      THREE,
      [
        { y: 0.12, rx: 0.001, rz: 0.001 },
        { y: 0.118, rx: 0.088, rz: 0.084, n: 2.2 },
        { y: 0.1, rx: 0.1, rz: 0.098, n: 2.3 },
        { y: 0.0, rx: 0.1, rz: 0.1, n: 2.3 },
        { y: -0.09, rx: 0.098, rz: 0.11, n: 2.3, z: 0.01 },
        { y: -0.12, rx: 0.09, rz: 0.1, n: 2.3, z: 0.01 },
      ],
      { seg: 32, rows: 24 }
    )
  );
  for (const side of ["L", "R"] as const) {
    const hp = side === "L" ? hipL : hipR;
    const kn = side === "L" ? kneeL : kneeR;
    const an = side === "L" ? ankleL : ankleR;
    mesh(geo(limbLoft(THREE, [[0.05, 0.118, 0.11], [-0.1, 0.112, 0.106], [-0.225, 0.096, 0.094]], { seg: 32 })), legM, hp);
    mesh(geo(limbLoft(THREE, [[0.03, 0.094, 0.092], [-0.08, 0.088, 0.086], [-0.17, 0.09, 0.088]], { seg: 32 })), legM, kn);
    // Boot: shaft with a rolled cuff, foot, rubber sole, toe cap, crossed laces
    mesh(shaftGeo, bootM, an);
    ringMesh(band(THREE, 0.1, 0.098, 0.04, 0.016, { n: 2.3 }), bootM, an, 0.105);
    mesh(footGeo, bootM, an);
    mesh(soleGeo, soleM, an);
    const capM = leather(outfit.kind === "space" ? "#94a3b8" : "#2a1d15");
    const cap = mesh(geo(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), capM, an, 0, -0.17, 0.165);
    cap.scale.set(0.98, 0.55, 0.72);
    const laceM = track(new THREE.MeshPhysicalMaterial({ color: darken(outfit.boots, 0.55), roughness: 0.85, sheen: 0.4 }));
    const eyeletM = metal("#c9a227", 0.3);
    for (let i = 0; i < 3; i++) {
      const y = 0.06 - i * 0.045;
      const z = 0.098 + i * 0.012;
      const bar = mesh(geo(new THREE.CapsuleGeometry(0.0065, 0.05, 3, 8)), laceM, an, 0, y, z);
      bar.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) mesh(geo(new THREE.TorusGeometry(0.009, 0.0035, 6, 12)), eyeletM, an, s * 0.034, y, z - 0.004);
    }
  }

  // ---- Head: sculpted sphere — big cranium, full cheeks, soft small chin ----
  const headGeo = geo(new THREE.SphereGeometry(HEAD_R, 96, 72));
  {
    const pos = headGeo.attributes.position as T.BufferAttribute;
    const q = V();
    for (let i = 0; i < pos.count; i++) {
      sculptHead(pos.getX(i), pos.getY(i), pos.getZ(i), q);
      pos.setXYZ(i, q.x, q.y, q.z);
    }
    headGeo.computeVertexNormals();
  }
  mesh(headGeo, skin, head);
  // Ears: soft C-shaped shell with an inner bowl
  for (const s of [-1, 1]) {
    const f = hs.frame(s * Math.PI * 0.5, 1.66, -0.02);
    const ear = mesh(geo(new THREE.SphereGeometry(0.078, 24, 18)), skin, head, f.p.x, f.p.y, f.p.z);
    ear.scale.set(0.42, 1, 0.78);
    ear.rotation.y = s * -0.25;
    const inner = mesh(geo(new THREE.SphereGeometry(0.05, 16, 12)), skinShade, head, f.p.x + s * 0.026, f.p.y, f.p.z + 0.012);
    inner.scale.set(0.3, 0.85, 0.6);
  }
  // Nose: small soft button
  {
    const f = hs.frame(0, 1.86, -0.012);
    const nose = mesh(geo(new THREE.SphereGeometry(0.036, 20, 16)), skin, head, f.p.x, f.p.y, f.p.z);
    nose.scale.set(1.2, 0.85, 0.85);
  }
  // Blush: soft painted patches on the cheeks
  const blushTex = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(244,114,128,0.5)");
    g.addColorStop(0.55, "rgba(244,114,128,0.22)");
    g.addColorStop(1, "rgba(244,114,128,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const blushM = track(new THREE.MeshPhysicalMaterial({ map: blushTex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }));
  for (const s of [-1, 1]) decal(headPatch(THREE, hs, s * 0.66, 1.95, 0.17, 0.1, { lift: 0.0015, rings: 6, seg: 24 }), blushM, head);

  // ---- Eyes: painted on the head surface, slightly domed; iris follows the gaze; lids in the shader ----
  const irisHex = look.eyes === "fire" ? "#ea580c" : look.skin === "galaxy" ? "#7c3aed" : look.eyes === "star" ? "#f59e0b" : "#6b3f1d";
  const irisTex = canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 150, 6, 128, 128, 128);
    g.addColorStop(0, lighten(irisHex, 0.25).getStyle());
    g.addColorStop(0.45, irisHex);
    g.addColorStop(0.82, C(irisHex).multiplyScalar(0.4).getStyle());
    g.addColorStop(1, "#120a06");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    // warm light pooling in the lower half of the iris
    const lg = c.createRadialGradient(128, 205, 4, 128, 190, 95);
    lg.addColorStop(0, lighten(irisHex, 0.6).getStyle().replace("rgb", "rgba").replace(")", ",0.85)"));
    lg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = lg;
    c.fillRect(0, 0, 256, 256);
    // fibres
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + rnd(i) * 0.05;
      c.strokeStyle = `rgba(${i % 2 ? "255,240,220" : "20,10,5"},${0.08 + rnd(i, 2) * 0.1})`;
      c.lineWidth = 2 + rnd(i, 3) * 2;
      c.beginPath();
      c.moveTo(128 + Math.cos(a) * 50, 128 + Math.sin(a) * 50);
      c.lineTo(128 + Math.cos(a) * (100 + rnd(i, 4) * 20), 128 + Math.sin(a) * (100 + rnd(i, 4) * 20));
      c.stroke();
    }
    // limbal ring
    c.strokeStyle = "rgba(10,5,3,0.85)";
    c.lineWidth = 12;
    c.beginPath();
    c.arc(128, 128, 120, 0, Math.PI * 2);
    c.stroke();
    if (look.eyes === "star") star(c, 128, 128, 62, "#1c1206", "rgba(0,0,0,0)");
    else {
      const pg = c.createRadialGradient(128, 124, 30, 128, 128, 58);
      pg.addColorStop(0, "#050302");
      pg.addColorStop(0.85, "#0b0705");
      pg.addColorStop(1, "rgba(11,7,5,0)");
      c.fillStyle = pg;
      c.beginPath();
      c.arc(128, 128, 58, 0, Math.PI * 2);
      c.fill();
    }
  });
  const covered = look.eyes === "shades" || look.eyes === "visor";
  const EYE_W = 0.215;
  const EYE_H = 0.255;
  const eyeUniforms: { u: EyeUniforms; side: number }[] = [];
  const brows: { g: T.Group; axis: T.Vector3; side: number; y: number; rz: number }[] = [];
  const skinCol = look.skin === "gold" ? C("#e8b53a") : C(skinHex);
  const browHex = look.skin === "galaxy" ? "#2e1065" : look.hair === "fire" ? "#9a3412" : look.hair === "mohawk" ? "#4a1d36" : "#24140b";
  const browM = track(new THREE.MeshPhysicalMaterial({ color: C(browHex), roughness: 0.65, sheen: 0.4, sheenColor: lighten(browHex, 0.3), normalMap: det("hair", [1, 1]), normalScale: new THREE.Vector2(0.4, 0.4) }));
  for (const s of [-1, 1]) {
    if (!covered) {
      const { material, uniforms } = eyeMaterial(THREE, irisTex, skinCol, s, [EYE_W, EYE_H], 0.096, look.eyes === "fire" ? 0.6 : look.skin === "galaxy" ? 0.3 : 0);
      track(material);
      decal(headPatch(THREE, hs, s * 0.465, 1.69, EYE_W, EYE_H, { lift: 0.004, bulge: 0.017, rings: 16, seg: 56 }), material, head);
      eyeUniforms.push({ u: uniforms, side: s });
    }
    // Brow: a tapered stroke hugging the forehead; rotates about the head centre (raise / tilt)
    const pts: T.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(hs.frame(s * (0.3 + 0.36 * t), 1.345 - 0.04 * Math.sin(Math.PI * t) + 0.01 * t, 0.004).p);
    }
    const g = group(head);
    const bm = mesh(geo(sweep(THREE, pts, (t) => [0.025 * (1 - 0.5 * t) * Math.min(1, (t + 0.04) * 5), 0.008], (p, out) => out.copy(p).normalize(), { rows: 18, seg: 10 })), browM, g);
    bm.castShadow = false;
    const axis = hs.frame(s * 0.48, 1.32).p.normalize();
    brows.push({ g, axis, side: s, y: 0, rz: 0 });
  }
  if (look.eyes === "shades") {
    const g = group(head, 0, -0.03, 0.46);
    const lensM = track(new THREE.MeshPhysicalMaterial({ color: C("#0f172a"), roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.5 }));
    for (const s of [-1, 1]) {
      const lens = mesh(geo(new THREE.SphereGeometry(0.11, 32, 20)), lensM, g, s * 0.19, 0, 0);
      lens.scale.set(1.18, 0.86, 0.32);
      lens.rotation.y = s * 0.3;
      const rim = mesh(geo(new THREE.TorusGeometry(0.11, 0.01, 8, 40)), metal("#1f2937", 0.3), g, s * 0.19, 0, 0.01);
      rim.scale.set(1.18, 0.86, 1);
      rim.rotation.y = s * 0.3;
    }
    mesh(geo(new THREE.CapsuleGeometry(0.008, 0.1, 4, 8)), metal("#94a3b8"), g, 0, 0.03, 0.02).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      const arm = mesh(geo(new THREE.CapsuleGeometry(0.008, 0.36, 4, 8)), metal("#1f2937", 0.3), g, s * 0.4, 0.02, -0.18);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.y = s * 0.12;
    }
  } else if (look.eyes === "visor") {
    // wrap-around glass visor hugging the face, with a dark frame and a scan line
    const glass = track(new THREE.MeshPhysicalMaterial({ color: C("#0e7490"), emissive: C("#22d3ee"), emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.92 }));
    mesh(geo(headPatch(THREE, hs, 0, 1.7, 1.45, 0.2, { lift: 0.035, rect: true, rings: 8, seg: 48, bulge: 0.01 })), glass, head);
    mesh(geo(headPatch(THREE, hs, 0, 1.7, 1.52, 0.25, { lift: 0.025, rect: true, rings: 6, seg: 48 })), metal("#1f2937", 0.3), head);
    const scan = mesh(geo(headPatch(THREE, hs, 0, 1.7, 1.4, 0.02, { lift: 0.047, rect: true, rings: 2, seg: 48 })), glow("#a5f3fc", 2), head);
    scan.castShadow = false;
  }
  if (look.eyes === "fire") {
    for (const s of [-1, 1]) {
      const f = mesh(geo(new THREE.ConeGeometry(0.03, 0.09, 12)), glow("#f97316", 1.6), head, s * 0.3, 0.06, 0.38);
      f.rotation.z = -s * 0.6;
    }
  }

  // ---- Mouth: painted expression on a patch that hugs the face (swapped per mood) ----
  const MOUTH: Record<string, string> = { lip: "#8a3a3a", in: "#4a1418", tongue: "#ef7a7a", teeth: "#fffaf3" };
  const smileLine = (c: CanvasRenderingContext2D, x0: number, x1: number, sag: number, y = 100, w = 13, tilt = 0) => {
    c.fillStyle = MOUTH.lip;
    c.beginPath();
    c.moveTo(x0, y - tilt);
    c.quadraticCurveTo(256, y + sag, x1, y + tilt);
    c.quadraticCurveTo(256, y + sag + w, x0, y - tilt);
    c.fill();
    c.lineCap = "round";
    c.lineWidth = w * 0.7;
    c.strokeStyle = MOUTH.lip;
    c.beginPath();
    c.moveTo(x0, y - tilt);
    c.lineTo(x0 + 0.1, y - tilt);
    c.moveTo(x1, y + tilt);
    c.lineTo(x1 - 0.1, y + tilt);
    c.stroke();
  };
  const openMouth = (c: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number, teeth = true, tongue = true) => {
    c.save();
    c.beginPath();
    c.moveTo(x0, top);
    c.quadraticCurveTo(256, top + 10, x1, top);
    c.quadraticCurveTo(x1 - 10, bottom, 256, bottom);
    c.quadraticCurveTo(x0 + 10, bottom, x0, top);
    c.closePath();
    const g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, "#2d0a0d");
    g.addColorStop(1, MOUTH.in);
    c.fillStyle = g;
    c.fill();
    c.clip();
    if (teeth) {
      c.fillStyle = MOUTH.teeth;
      c.beginPath();
      c.ellipse(256, top - 4, (x1 - x0) * 0.42, 20, 0, 0, Math.PI * 2);
      c.fill();
    }
    if (tongue) {
      c.fillStyle = MOUTH.tongue;
      c.beginPath();
      c.ellipse(256, bottom + 6, (x1 - x0) * 0.26, (bottom - top) * 0.45, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.lineWidth = 7;
    c.strokeStyle = MOUTH.lip;
    c.beginPath();
    c.moveTo(x0, top);
    c.quadraticCurveTo(256, top + 10, x1, top);
    c.quadraticCurveTo(x1 - 10, bottom, 256, bottom);
    c.quadraticCurveTo(x0 + 10, bottom, x0, top);
    c.stroke();
  };
  const idleMouth = (c: CanvasRenderingContext2D) => {
    switch (look.mouth) {
      case "grin":
        openMouth(c, 170, 342, 84, 172, true, true);
        break;
      case "open":
        openMouth(c, 214, 298, 92, 168, false, true);
        break;
      case "tongue":
        smileLine(c, 190, 322, 34, 96, 12);
        c.fillStyle = MOUTH.tongue;
        c.beginPath();
        c.ellipse(276, 138, 24, 30, 0.2, 0, Math.PI);
        c.fill();
        c.strokeStyle = "#c95a5a";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(276, 116);
        c.lineTo(276, 150);
        c.stroke();
        break;
      case "smirk":
        smileLine(c, 206, 318, 18, 108, 12, 18);
        break;
      default:
        smileLine(c, 196, 316, 34, 100, 12);
    }
  };
  const mouthDraw: Record<FaceKey, (c: CanvasRenderingContext2D) => void> = {
    idle: idleMouth,
    blink: idleMouth,
    happy: (c) => openMouth(c, 166, 346, 80, 182, true, true),
    sad: (c) => {
      c.save();
      c.translate(0, 236);
      c.scale(1, -1);
      smileLine(c, 206, 306, 26, 108, 12);
      c.restore();
    },
    hit: (c) => openMouth(c, 214, 298, 82, 178, true, false),
    think: (c) => smileLine(c, 216, 304, 4, 112, 11, -8),
  };
  const mouthTex: Partial<Record<FaceKey, T.Texture>> = {};
  for (const k of Object.keys(mouthDraw) as FaceKey[]) mouthTex[k] = canvasTex(512, 256, mouthDraw[k]);
  const mouthM = track(new THREE.MeshPhysicalMaterial({ map: mouthTex.idle, transparent: true, depthWrite: false, roughness: 0.35, clearcoat: 0.4, polygonOffset: true, polygonOffsetFactor: -3 }));
  if (look.mouth !== "mask") decal(headPatch(THREE, hs, 0, 2.08, 0.26, 0.13, { lift: 0.003, rect: true, rings: 8, seg: 20 }), mouthM, head);
  else {
    const mask = mesh(geo(new THREE.SphereGeometry(HEAD_R * 1.02, 64, 24, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.27)), fabric("#1f2937", {}, "weave", [12, 3]), head);
    mask.scale.set(1, 1.02, 0.96);
  }

  // ---- Hair: volume shell (strand normal map, anisotropic sheen) + layered clumps ----
  const flames: T.Object3D[] = [];
  const hideHair = cos ? Boolean(cos.noHair) : look.head === "astro" || look.head === "helmet";
  // under a hat the hair is pressed flat: thin shell, no crown/silhouette clumps, spikes become a fringe
  const hatted = cos ? Boolean(cos.hat && cos.hat !== "leaf" && cos.hat !== "ice") : look.head === "cap" || look.head === "beanie" || look.head === "wizard";
  if (!hideHair) {
    const hairRoot = group(head, 0, 0, 0);
    const style = hatted && look.hair !== "long" && look.hair !== "curly" ? "short" : look.hair;
    const outward = (p: T.Vector3, out: T.Vector3) => out.copy(p).normalize();
    /** Shell from the crown down to the hairline; thickness th(az, pol, 0..1 toward the hairline) */
    const shell = (line: (aAbs: number) => number, th: (az: number, pol: number, f: number) => number, m: T.Material) =>
      mesh(
        geo(
          gridSurface(
            THREE,
            120,
            44,
            (u, v, out) => {
              const az = u * Math.PI * 2 - Math.PI;
              const pl = line(Math.abs(az));
              const vt = Math.min(1, v / 0.88);
              const lip = smooth(0.88, 1, v);
              const pol = Math.max(1e-4, vt * pl) + lip * 0.02;
              out.copy(hs.frame(az, pol, th(az, pol, vt) * (1 - lip * 0.9) - lip * 0.004).p);
            },
            { wrapU: true, center: (_u, _v, out) => out.set(0, 0, 0) }
          )
        ),
        m,
        hairRoot
      );
    /** Clump following the head surface through (az, pol, lift) keys; optional free 3D points after it */
    const clump = (path: [number, number, number][], w: number, thick: number, o: { tail?: T.Vector3[]; m?: T.Material; taper?: number; root?: number } = {}) => {
      const pts = path.map(([az, pol, lift]) => hs.frame(az, pol, lift).p);
      if (o.tail) pts.push(...o.tail);
      const taper = o.taper ?? 1;
      const g = sweep(
        THREE,
        pts,
        (t) => {
          const k = Math.pow(1 - t, 0.75 * taper) * Math.min(1, (t + (o.root ?? 0.02)) * 6);
          return [w * Math.max(0.03, k), thick * Math.max(0.15, Math.sqrt(Math.max(0, 1 - t)))];
        },
        outward,
        { rows: 26, seg: 12, ridge: 0.35 }
      );
      return mesh(geo(g), o.m ?? hair, hairRoot);
    };
    const flickOut = (az: number, pol: number, lift: number) => hs.frame(az, pol, lift).p;
    const shortLine = keys([[0, 0.98], [0.45, 1.02], [0.9, 1.16], [1.06, 1.66], [1.2, 1.66], [1.34, 1.46], [1.62, 1.42], [1.95, 1.62], [2.5, 1.98], [Math.PI, 2.16]]);
    const volume = (base: number, crown: number, back = 0.02) => (az: number, pol: number, f: number) =>
      base + crown * Math.pow(1 - f, 0.6) + back * Math.max(0, -Math.cos(az)) * Math.sin(Math.min(Math.PI, pol * 1.4)) + 0.006 * Math.sin(az * 9 + pol * 4) * f;

    if (style === "mohawk") {
      const stub = track(new THREE.MeshPhysicalMaterial({ color: C(skinHex).lerp(C("#3b2314"), 0.35), roughness: 0.85, normalMap: det("hair", [10, 2]), normalScale: new THREE.Vector2(0.4, 0.4) }));
      shell(shortLine, () => 0.004, stub);
      for (let i = 0; i < 8; i++) {
        const pol = 0.32 + i * 0.22;
        const lift = 0.2 - Math.abs(i - 3) * 0.02;
        clump([[0, pol - 0.12, 0.0], [0, pol, 0.06]], 0.075, 0.05, { tail: [flickOut(0, pol + 0.18, lift)], taper: 0.8 });
      }
    } else if (style === "spiky" || style === "fire") {
      shell(shortLine, volume(0.03, 0.03), hair);
      const fireM = style === "fire" ? hair : undefined;
      // spikes rooted around the crown, pointing up / out / back (anime style); fire flames point up
      const up = V(0, 1, 0);
      const spikes: [number, number, number][] = [];
      for (let i = 0; i < 8; i++) spikes.push([-1.2 + i * 0.34, 0.95 + Math.abs(i - 3.5) * 0.04, 0.24]);
      for (let i = 0; i < 9; i++) spikes.push([Math.PI * (0.45 + (i / 8) * 1.1) - Math.PI * 0.55 + (i % 2 ? 0.12 : -0.12) + Math.PI * 0.5, 0.9 + rnd(i) * 0.5, 0.2]);
      for (let i = 0; i < 4; i++) spikes.push([i * 1.6, 0.35, 0.22]);
      spikes.forEach(([az, pol, len0], i) => {
        const len = len0 + rnd(i, 5) * 0.08;
        const base = hs.frame(az, pol, 0.05);
        const dir = base.n.clone().multiplyScalar(style === "fire" ? 0.45 : 0.75).addScaledVector(up, style === "fire" ? 0.9 : 0.55);
        if (base.p.z > 0.15) dir.z += 0.05;
        else dir.z -= 0.25;
        dir.normalize();
        const tip = base.p.clone().addScaledVector(dir, len);
        const mid = base.p.clone().addScaledVector(dir, len * 0.5).addScaledVector(base.n, 0.02);
        const l = clump([[az, Math.max(0.12, pol - 0.25), 0.02], [az, pol, 0.05]], 0.095, 0.055, { tail: [mid, tip], m: fireM, taper: 0.65, root: 0.12 });
        if (style === "fire") flames.push(l);
      });
    } else if (style === "curly") {
      shell(shortLine, volume(0.06, 0.04, 0.03), hair);
      const curlG = (() => {
        const g = new THREE.IcosahedronGeometry(0.075, 3);
        const p = g.attributes.position as T.BufferAttribute;
        const q = V();
        for (let i = 0; i < p.count; i++) {
          q.fromBufferAttribute(p, i);
          const k = 1 + 0.12 * Math.sin(q.x * 60) * Math.sin(q.y * 55) * Math.sin(q.z * 50);
          p.setXYZ(i, q.x * k, q.y * k, q.z * k);
        }
        g.computeVertexNormals();
        return geo(g);
      })();
      for (let i = 0; i < 96; i++) {
        const az = -Math.PI + (i / 96) * Math.PI * 2 * 4.0 + rnd(i) * 0.35;
        const f = Math.min(1, ((i * 7) % 11) / 10 + rnd(i, 6) * 0.08);
        const pl = shortLine(Math.abs(((az + Math.PI) % (Math.PI * 2)) - Math.PI));
        const pol = 0.15 + f * (pl - 0.12);
        const fr = hs.frame(az, pol, 0.045 + 0.03 * (1 - f));
        const c = mesh(curlG, hair, hairRoot, fr.p.x, fr.p.y, fr.p.z);
        c.scale.setScalar(1.0 + rnd(i, 2) * 0.4);
        c.rotation.set(rnd(i, 3) * 6, rnd(i, 4) * 6, 0);
      }
      for (let i = 0; i < 7; i++) {
        const fr = hs.frame(-0.75 + i * 0.25, 1.08 + (i % 2) * 0.05, 0.035);
        mesh(curlG, hair, hairRoot, fr.p.x, fr.p.y, fr.p.z).scale.setScalar(0.85);
      }
    } else {
      const sleek = style === "bun";
      shell(shortLine, sleek || hatted ? volume(0.022, 0.006, 0.008) : volume(0.035, 0.045), hair);
      // Fringe: clumps from the crown sweeping onto the forehead (side-parted for "side" and "bun")
      const sideSweep = style === "side" ? 0.42 : style === "bun" ? 0.2 : 0.08;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const u = -1 + (i / (n - 1)) * 2;
        const azTip = u * 0.95 + sideSweep * (1 - Math.abs(u) * 0.5);
        const azRoot = (style === "side" ? -0.45 : u * 0.35) + u * 0.25;
        const tipPol = 1.27 + Math.abs(u) * 0.1 + rnd(i, 7) * 0.05 - (style === "side" && u < -0.3 ? 0.1 : 0);
        clump(
          hatted
            ? [
                [azTip * 0.95, 1.12, 0.015],
                [azTip * 0.98, tipPol - 0.08, 0.028],
                [azTip, tipPol, 0.018],
              ]
            : [
                [azRoot, 0.3, 0.02],
                [(azRoot + azTip) / 2, 0.75, 0.06],
                [azTip * 0.98, tipPol - 0.18, 0.045],
                [azTip, tipPol, 0.025],
              ],
          0.1 + rnd(i, 8) * 0.02,
          0.045,
          { root: 0.15, taper: 0.8 }
        );
      }
      // Silhouette clumps around the sides and back: break the dome, tips flick out a little
      if (!sleek && !hatted)
        for (let i = 0; i < 10; i++) {
          const s = i % 2 ? 1 : -1;
          const az = s * (1.25 + (Math.floor(i / 2) / 4) * 1.8);
          const pl = shortLine(Math.abs(az));
          clump(
            [
              [az * 0.9, 0.55, 0.06],
              [az, pl * 0.72, 0.07],
              [az * 1.02, pl + 0.03, 0.04 + rnd(i, 9) * 0.02],
            ],
            0.12,
            0.045,
            { root: 0.12, taper: 0.7 }
          );
        }
      // Side locks in front of the ears
      for (const s of [-1, 1]) clump([[s * 0.95, hatted ? 1.15 : 0.9, hatted ? 0.03 : 0.05], [s * 1.08, 1.4, 0.035], [s * 1.1, 1.78, 0.022]], 0.055, 0.026, { root: 0.2 });
      if (style === "long") {
        // back curtain to the shoulders and two front strands
        for (let i = 0; i < 9; i++) {
          const az = Math.PI + (i - 4) * 0.3;
          const s = Math.sin(az);
          const c = Math.cos(az);
          clump([[az, 1.1, 0.06], [az, 1.75, 0.07], [az, 2.15, 0.08]], 0.11, 0.04, {
            tail: [V(s * 0.5, -0.45, c * 0.42), V(s * 0.47, -0.66 - rnd(i) * 0.06, c * 0.38)],
            root: 0.1,
            taper: 0.6,
          });
        }
        for (const s of [-1, 1])
          clump([[s * 1.15, 1.2, 0.06], [s * 1.3, 1.9, 0.08]], 0.08, 0.035, { tail: [V(s * 0.46, -0.42, 0.14), V(s * 0.42, -0.62, 0.16)], root: 0.15, taper: 0.6 });
      }
      if (style === "bun") {
        const b = hs.frame(Math.PI, 0.55, 0.13).p;
        const bun = mesh(geo(new THREE.SphereGeometry(0.16, 40, 28)), hairMat([3, 1]), hairRoot, b.x, b.y, b.z);
        bun.scale.set(1, 0.92, 0.95);
        const tie = mesh(geo(new THREE.TorusGeometry(0.105, 0.022, 12, 40)), gloss("#f472b6"), hairRoot, b.x * 0.78, b.y * 0.86, b.z * 0.78);
        tie.lookAt(0, 0, 0);
      }
    }
  }

  // ---- Head items (shop) — modelled in head space; costume heads keep the 0.58-radius layout, scaled ----
  const spin: T.Object3D[] = [];
  const hi = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0) => mesh(geo(g), m, head, x, y, z);
  /** Band hugging the head at polar angle `pol` (tilted: front lower/higher), height h, thickness th */
  const headBand = (pol: number, tilt: number, h: number, th: number, lift: number, m: T.Material) =>
    mesh(
      geo(
        gridSurface(
          THREE,
          72,
          12,
          (u, v, out) => {
            const az = u * Math.PI * 2;
            const a = v * Math.PI * 2;
            const pl = pol + tilt * Math.cos(az) + Math.sin(a) * (h / 2 / HEAD_R) * Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.4);
            const f = hs.frame(az, pl, lift + th * Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.45));
            out.copy(f.p);
          },
          { wrapU: true, wrapV: true, center: (u, _v, out) => out.copy(hs.frame(u * Math.PI * 2, pol + tilt * Math.cos(u * Math.PI * 2), lift).p) }
        )
      ),
      m,
      head
    );
  /** Dome over the head down to `pol(az)` at `lift` above the scalp */
  const headDome = (line: (az: number) => number, lift: (az: number, pol: number) => number, m: T.Material, rows = 30) =>
    mesh(
      geo(
        gridSurface(
          THREE,
          72,
          rows,
          (u, v, out) => {
            const az = u * Math.PI * 2 - Math.PI;
            const pol = Math.max(1e-4, v * line(az));
            out.copy(hs.frame(az, pol, lift(az, pol)).p);
          },
          { wrapU: true, center: (_u, _v, out) => out.set(0, 0, 0) }
        )
      ),
      m,
      head
    );
  if (!cos) {
    const mainHex = main;
    switch (look.head) {
      case "cap": {
        const capM = fabric(mainHex, {}, "weave", [8, 4], 0.5);
        headDome((az) => 1.2 + 0.25 * Math.max(0, -Math.cos(az)), (az, pol) => 0.072 + 0.014 * Math.sin(pol * 2.2), capM);
        // panel seams and top button
        for (let i = 0; i < 6; i++) {
          const az = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const pts = [0.05, 0.4, 0.75, 1.16].map((pol) => hs.frame(az, pol, 0.084 + 0.014 * Math.sin(pol * 2.2)).p);
          mesh(geo(sweep(THREE, pts, () => [0.005, 0.003], (p, o) => o.copy(p).normalize(), { rows: 12, seg: 6 })), fabric(mainHex, { color: darken(mainHex, 0.25) }), head);
        }
        const top = hs.frame(0, 0.001, 0.09).p;
        hi(new THREE.SphereGeometry(0.03, 16, 12), capM, top.x, top.y, top.z).scale.set(1, 0.5, 1);
        headBand(1.17, -0.04, 0.05, 0.008, 0.075, fabric(darken(mainHex, 0.15).getStyle(), {}, "weave", [24, 1]));
        // curved brim
        const brim = gridSurface(
          THREE,
          28,
          10,
          (u, v, out) => {
            const x = (u * 2 - 1) * 0.31;
            const r = v * (0.27 - (x * x) / 0.31 ** 2 * 0.17);
            const base = hs.frame(x / 0.5, 1.2, 0.07).p;
            out.set(x * (1 - v * 0.06), base.y - v * 0.06 - Math.abs(x) * 0.05 * v, base.z + r);
          },
          { center: (u, _v, out) => out.set((u * 2 - 1) * 0.3, 0.6, 0.45) }
        );
        const b1 = mesh(geo(brim), track(new THREE.MeshPhysicalMaterial({ color: C(mainHex), roughness: 0.8, sheen: 0.6, side: THREE.DoubleSide })), head);
        b1.position.y = 0.0;
        const logo = canvasTex(128, 128, (c) => star(c, 64, 64, 50, "#f8fafc", "rgba(0,0,0,0.25)"));
        decal(headPatch(THREE, hs, 0, 0.8, 0.14, 0.14, { lift: 0.093 }), track(new THREE.MeshPhysicalMaterial({ map: logo, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 })), head);
        break;
      }
      case "beanie": {
        // Chust do'ppi: four-cornered black skullcap with white "qalampir" (chili) embroidery
        const doppiTex = canvasTex(512, 128, (c) => {
          c.fillStyle = "#121212";
          c.fillRect(0, 0, 512, 128);
          for (let i = 0; i < 5; i++) {
            const cx = i * 128;
            c.save();
            c.translate(cx, 62);
            c.scale(0.95, 1.05);
            c.rotate(-0.5);
            c.fillStyle = "#f5f5f0";
            c.beginPath();
            c.moveTo(0, -46);
            c.bezierCurveTo(30, -30, 28, 30, 0, 46);
            c.bezierCurveTo(-8, 20, -14, -20, 0, -46);
            c.fill();
            c.strokeStyle = "#121212";
            c.lineWidth = 4;
            c.beginPath();
            c.moveTo(4, -30);
            c.bezierCurveTo(16, -10, 14, 14, 4, 30);
            c.stroke();
            c.restore();
            c.fillStyle = "#f5f5f0";
            for (let k = 0; k < 6; k++) c.fillRect(i * 128 + 8 + k * 20, 6, 10, 5);
          }
        });
        const dM = track(new THREE.MeshPhysicalMaterial({ map: doppiTex, roughness: 0.7, sheen: 1, sheenColor: C("#555555"), normalMap: det("weave", [16, 4]), normalScale: new THREE.Vector2(0.5, 0.5) }));
        const topM = fabric("#141414", { sheen: 1, sheenColor: C("#555555") }, "weave", [8, 8], 0.5);
        const dg = group(head, 0, 0, -0.01);
        dg.rotation.x = -0.14;
        // sides: bottom → top (v), embroidered texture wraps around
        mesh(
          geo(
            loft(THREE, [
              { y: 0.255, rx: 0.505, rz: 0.5, n: 3.3 },
              { y: 0.33, rx: 0.5, rz: 0.495, n: 3.4 },
              { y: 0.44, rx: 0.485, rz: 0.48, n: 3.4 },
              { y: 0.52, rx: 0.46, rz: 0.455, n: 3.3 },
            ], { seg: 72, rows: 16 })
          ),
          dM,
          dg
        );
        mesh(
          geo(
            loft(THREE, [
              { y: 0.575, rx: 0.001, rz: 0.001, n: 3 },
              { y: 0.57, rx: 0.25, rz: 0.25, n: 3 },
              { y: 0.55, rx: 0.42, rz: 0.415, n: 3.2 },
              { y: 0.52, rx: 0.462, rz: 0.457, n: 3.3 },
            ], { seg: 72, rows: 12 })
          ),
          topM,
          dg
        );
        // white zig-zag braid along the bottom edge
        mesh(geo(band(THREE, 0.507, 0.502, 0.02, 0.008, { n: 3.3 })), fabric("#f5f5f0", {}, "knit", [40, 1], 0.6), dg, 0, 0.262, 0);
        break;
      }
      case "headphones": {
        const bandM = track(new THREE.MeshPhysicalMaterial({ color: C("#1f2937"), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
        const pts: T.Vector3[] = [];
        for (let i = 0; i <= 12; i++) {
          const a = -Math.PI / 2 + (i / 12) * Math.PI;
          pts.push(hs.frame(a < 0 ? -Math.PI / 2 : Math.PI / 2, Math.abs(a) < 1e-3 ? 1e-3 : Math.abs(a) * 0.98 + 0.0, 0.075).p);
        }
        mesh(geo(sweep(THREE, pts, () => [0.045, 0.016], (p, o) => o.copy(p).normalize(), { rows: 40, seg: 12 })), bandM, head);
        const pad = fabric("#374151", { roughness: 0.95 }, "leather", [6, 1], 0.4);
        const pts2 = pts.slice(3, 10).map((p) => p.clone().multiplyScalar(0.97));
        mesh(geo(sweep(THREE, pts2, () => [0.034, 0.014], (p, o) => o.copy(p).normalize(), { rows: 24, seg: 10 })), pad, head);
        for (const s of [-1, 1]) {
          const cup = group(head, s * 0.52, -0.04, 0);
          cup.rotation.z = (-s * Math.PI) / 2;
          mesh(lathe([[0, -0.05], [0.13, -0.05], [0.15, -0.03], [0.15, 0.02], [0.12, 0.05], [0, 0.055]], 40), gloss("#ef4444"), cup);
          const cushion = mesh(geo(new THREE.TorusGeometry(0.11, 0.035, 14, 40)), pad, cup, 0, -0.055, 0);
          cushion.rotation.x = Math.PI / 2;
          const ring = mesh(geo(new THREE.TorusGeometry(0.105, 0.008, 8, 40)), metal("#e5e7eb", 0.2), cup, 0, 0.05, 0);
          ring.rotation.x = Math.PI / 2;
          mesh(geo(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 24)), metal("#e5e7eb", 0.2), cup, 0, 0.058, 0);
        }
        break;
      }
      case "band": {
        const bandM = fabric("#dc2626", {}, "weave", [24, 1], 0.5);
        headBand(1.12, 0.06, 0.1, 0.012, 0.045, bandM);
        // metal plate on the forehead and two tails from the knot at the back
        const plate = new THREE.Mesh(slab(0.2, 0.08, 0.016, 0.01), metal("#cbd5e1", 0.25));
        const pf = hs.frame(0, 1.06, 0.06);
        plate.position.copy(pf.p);
        plate.lookAt(pf.p.clone().add(pf.n));
        head.add(plate);
        const k = hs.frame(Math.PI, 1.18, 0.06).p;
        mesh(geo(new THREE.SphereGeometry(0.04, 16, 12)), bandM, head, k.x, k.y, k.z);
        for (const s of [-1, 1]) {
          const pts = [k.clone(), k.clone().add(V(s * 0.06, -0.12, -0.08)), k.clone().add(V(s * 0.1, -0.28, -0.1))];
          mesh(geo(sweep(THREE, pts, (t) => [0.035 * (1 - t * 0.3), 0.006], () => undefined as unknown as void, { rows: 14, seg: 8 })), bandM, head);
        }
        break;
      }
      case "helmet": {
        // open-faced knight helmet: polished dome, central ridge, cheek guards, nose bar, rivets, plume
        const steel = metal("#a8b3c2", 0.22);
        headDome((az) => (Math.abs(az) < 0.95 ? 1.18 : 1.95), () => 0.085, steel, 36);
        const rp = [-1.15, -0.6, 0, 0.6, 1.15].map((a) => hs.frame(a < 0 ? Math.PI : 0, Math.abs(a) + 1e-3, 0.1).p);
        mesh(geo(sweep(THREE, rp, () => [0.025, 0.02], (p, o) => o.copy(p).normalize(), { rows: 30, seg: 10 })), steel, head);
        headBand(1.17, 0.0, 0.06, 0.014, 0.09, metal("#d4af37", 0.25));
        for (const s of [-1, 1]) {
          const g = gridSurface(
            THREE,
            12,
            12,
            (u, v, out) => {
              const az = s * (0.95 + u * 0.55);
              const pol = 1.15 + v * (0.8 - u * 0.2);
              out.copy(hs.frame(az, pol, 0.085).p);
            },
            { center: () => undefined }
          );
          mesh(geo(g), steel, head).material = steel;
        }
        const nb = hs.frame(0, 1.18, 0.1);
        const bar = hi(new THREE.BoxGeometry(0.04, 0.22, 0.02), steel, nb.p.x, nb.p.y - 0.1, nb.p.z);
        bar.rotation.x = -0.2;
        for (let i = 0; i < 10; i++) {
          const az = -0.85 + (i % 5) * 0.42 + (i >= 5 ? Math.PI : 0);
          const r = hs.frame(az, 1.17, 0.105).p;
          hi(new THREE.SphereGeometry(0.012, 10, 8), metal("#d4af37", 0.2), r.x, r.y, r.z);
        }
        // plume
        const plumeM = fabric("#dc2626", { roughness: 0.8 }, "fur", [2, 4], 0.8);
        for (let i = 0; i < 5; i++) {
          const b = hs.frame(Math.PI, 0.25 + i * 0.12, 0.1).p;
          const pts = [b, b.clone().add(V((i - 2) * 0.03, 0.18, -0.05)), b.clone().add(V((i - 2) * 0.05, 0.22, -0.28))];
          mesh(geo(sweep(THREE, pts, (t) => [0.05 * (1 - t * 0.7), 0.03 * (1 - t)], (p, o) => o.set(0, 1, 0), { rows: 16, seg: 10 })), plumeM, head);
        }
        break;
      }
      case "wizard": {
        const hatM = fabric("#6d28d9", { roughness: 0.9 }, "weave", [8, 8], 0.4);
        // wavy brim
        mesh(
          lathe(
            [[0.0, 0.0], [0.62, -0.005], [0.78, -0.02], [0.8, 0.0], [0.62, 0.025], [0.44, 0.04], [0.0, 0.04]],
            64
          ),
          fabric("#4c1d95", { side: THREE.DoubleSide }, "weave", [10, 2], 0.4),
          head,
          0,
          0.3,
          -0.02
        ).rotation.x = -0.12;
        // cone that bends back with a crumpled tip
        const pts: T.Vector3[] = [V(0, 0.3, -0.02), V(0, 0.6, -0.05), V(0, 0.85, -0.12), V(0.02, 1.0, -0.3), V(0.04, 0.98, -0.45)];
        const cone = sweep(THREE, pts, (t) => [0.46 * Math.pow(1 - t, 1.15) + 0.006, 0.46 * Math.pow(1 - t, 1.15) + 0.006], (p, o) => o.set(0, 0, 1), { rows: 40, seg: 40 });
        mesh(geo(cone), hatM, head).rotation.x = -0.12;
        const bandH = mesh(geo(band(THREE, 0.43, 0.43, 0.07, 0.012)), fabric("#facc15", {}, "weave", [24, 1]), head, 0, 0.35, -0.03);
        bandH.rotation.x = -0.12;
        const st = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.06)), glow("#fde047", 1.2));
        st.position.set(0, 0.35, 0.42);
        head.add(st);
        spin.push(st);
        break;
      }
      case "astro": {
        hi(
          new THREE.SphereGeometry(0.74, 64, 48),
          track(new THREE.MeshPhysicalMaterial({ color: C("#e0f2fe"), roughness: 0.02, transmission: 0.95, thickness: 0.02, ior: 1.3, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0, depthWrite: false })),
          0,
          0,
          0.02
        );
        const ring = hi(new THREE.TorusGeometry(0.55, 0.07, 16, 64), gloss("#e2e8f0"), 0, -0.55, 0);
        ring.rotation.x = Math.PI / 2;
        const ring2 = hi(new THREE.TorusGeometry(0.55, 0.018, 8, 64), metal("#f97316", 0.3), 0, -0.48, 0);
        ring2.rotation.x = Math.PI / 2;
        break;
      }
      case "crown": {
        const gold = metal("#f6c445", 0.18);
        // velvet cap inside and a band with five points
        headDome(() => 0.6, () => 0.03, fabric("#b91c1c", { roughness: 0.95, sheen: 1, sheenColor: C("#fca5a5") }, "fur", [6, 2], 0.3));
        const crownG = gridSurface(
          THREE,
          160,
          8,
          (u, v, out) => {
            const a = u * Math.PI * 2;
            const peak = Math.pow(Math.abs(Math.cos(a * 2.5)), 6);
            const h = 0.1 + peak * 0.14;
            const r = 0.36 + v * 0.0;
            const y = 0.43 + v * h;
            out.set(Math.sin(a) * (r + 0.02 * (1 - v)), y, Math.cos(a) * (r + 0.02 * (1 - v)));
          },
          { wrapU: true, center: (_u, v, out) => out.set(0, 0.43 + v * 0.1, 0) }
        );
        const cm = mesh(geo(crownG), track(new THREE.MeshPhysicalMaterial({ color: C("#f6c445"), metalness: 0.95, roughness: 0.2, clearcoat: 0.6, side: THREE.DoubleSide })), head);
        cm.rotation.x = -0.12;
        const rimB = mesh(geo(band(THREE, 0.38, 0.38, 0.05, 0.014)), gold, head, 0, 0.45, 0);
        rimB.rotation.x = -0.12;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const tip = new THREE.Mesh(geo(new THREE.SphereGeometry(0.025, 16, 12)), gold);
          tip.position.set(Math.sin(a) * 0.36, 0.69, Math.cos(a) * 0.36);
          const grp = new THREE.Group();
          grp.rotation.x = -0.12;
          grp.add(tip);
          head.add(grp);
          const gem = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.03, 1)), gloss(i % 2 ? "#2563eb" : "#dc2626"));
          gem.position.set(Math.sin(a) * 0.395, 0.47, Math.cos(a) * 0.395);
          gem.scale.set(1, 1.2, 0.6);
          gem.lookAt(Math.sin(a) * 2, 0.47, Math.cos(a) * 2);
          grp.add(gem);
        }
        break;
      }
      case "halo": {
        const hg = group(head, 0, 0.8, 0);
        const h = mesh(geo(new THREE.TorusGeometry(0.36, 0.035, 16, 64)), glow("#fde047", 1.6), hg);
        h.rotation.x = Math.PI / 2;
        const h2 = mesh(geo(new THREE.TorusGeometry(0.36, 0.07, 12, 64)), track(new THREE.MeshBasicMaterial({ color: C("#fef08a"), transparent: true, opacity: 0.25, depthWrite: false })), hg);
        h2.rotation.x = Math.PI / 2;
        h2.castShadow = false;
        spin.push(hg);
        break;
      }
    }
  }
  // Costume heads (built around a head of radius 0.58, scaled to fit)
  const items = group(head, 0, 0, 0);
  items.scale.setScalar(HEAD_R / 0.58);
  const it = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0) => mesh(geo(g), m, items, x, y, z);
  if (cos) {
    if (cos.hood) {
      const m = fabric(cos.hood, { roughness: 0.92 }, "knit", [10, 6], 0.2);
      const hood = it(new THREE.SphereGeometry(0.66, 56, 40, 0, Math.PI * 2, 0, Math.PI * 0.6), m, 0, 0.02, -0.04);
      hood.rotation.x = -0.85;
      const rim = it(new THREE.TorusGeometry(0.5, 0.06, 14, 56), m, 0, -0.06, 0.32);
      rim.rotation.x = -0.4;
      rim.scale.set(1.05, 1.15, 1);
      if (cos.ears === "cat")
        for (const s of [-1, 1]) {
          it(new THREE.ConeGeometry(0.17, 0.36, 24), m, s * 0.36, 0.62, -0.02).rotation.z = -s * 0.35;
          const inner = it(new THREE.ConeGeometry(0.1, 0.24, 20), fabric(cos.trim), s * 0.35, 0.6, 0.06);
          inner.rotation.z = -s * 0.35;
          inner.scale.z = 0.4;
        }
      if (cos.ears === "horns") for (const s of [-1, 1]) it(new THREE.ConeGeometry(0.07, 0.34, 20), gloss("#fef3c7"), s * 0.28, 0.72, -0.05).rotation.z = -s * 0.4;
      if (cos.ears === "spikes") for (let i = 0; i < 4; i++) it(new THREE.ConeGeometry(0.08, 0.24, 16), fabric(cos.trim), 0, 0.66 - i * 0.12, -0.12 - i * 0.16).rotation.x = -0.4 - i * 0.35;
    }
    if (cos.helmet && cos.helmetStyle === "astro") {
      it(new THREE.SphereGeometry(0.86, 64, 48), track(new THREE.MeshPhysicalMaterial({ color: C("#e0f2fe"), transmission: 0.95, roughness: 0.02, thickness: 0.02, transparent: true, opacity: 0.3, clearcoat: 1, depthWrite: false })), 0, 0, 0);
      it(new THREE.TorusGeometry(0.66, 0.08, 16, 64), gloss(cos.trim), 0, -0.6, 0).rotation.x = Math.PI / 2;
    } else if (cos.helmet) {
      it(new THREE.SphereGeometry(0.7, 64, 48), metal(cos.body, 0.25), 0, 0.02, 0);
      if (cos.helmetStyle === "knight") {
        it(new THREE.BoxGeometry(0.86, 0.09, 0.12), basic("#0f172a"), 0, 0.1, 0.62);
        it(new THREE.ConeGeometry(0.1, 0.42, 20), gloss("#dc2626"), 0, 0.86, 0);
      } else {
        const visor = it(new THREE.SphereGeometry(0.705, 48, 16, -0.9, 1.8, Math.PI * 0.42, Math.PI * 0.16), glow("#22d3ee", 0.9), 0, 0.02, 0);
        visor.castShadow = false;
      }
    }
    if (cos.mask) it(new THREE.TorusGeometry(0.585, 0.08, 14, 64), fabric(cos.mask), 0, 0.04, 0).rotation.x = Math.PI / 2;
    const hatHex = cos.hatColor;
    if (cos.hat === "pirate") {
      const felt = fabric("#111827", { roughness: 0.95 }, "fur", [6, 6], 0.2);
      const brimP = it(new THREE.CylinderGeometry(0.82, 0.82, 0.05, 3, 1), felt, 0, 0.42, 0);
      brimP.scale.set(1, 1, 0.75);
      it(new THREE.SphereGeometry(0.46, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), felt, 0, 0.42, 0);
      const skull = canvasTex(128, 128, (c) => {
        c.fillStyle = "#f8fafc";
        c.beginPath();
        c.arc(64, 54, 30, 0, Math.PI * 2);
        c.fill();
        c.fillRect(48, 70, 32, 20);
        c.fillStyle = "#111827";
        c.beginPath();
        c.arc(52, 54, 8, 0, Math.PI * 2);
        c.arc(76, 54, 8, 0, Math.PI * 2);
        c.fill();
      });
      const sk = it(new THREE.PlaneGeometry(0.2, 0.2), track(new THREE.MeshBasicMaterial({ map: skull, transparent: true })), 0, 0.62, 0.43);
      sk.castShadow = false;
    }
    if (cos.hat === "wizard") {
      it(new THREE.CylinderGeometry(0.86, 0.86, 0.05, 48), fabric("#4c1d95"), 0, 0.42, 0);
      const cone = it(new THREE.ConeGeometry(0.48, 1.05, 48), fabric("#6d28d9"), 0, 0.95, -0.05);
      cone.rotation.x = -0.18;
      spin.push(it(new THREE.OctahedronGeometry(0.08), glow("#fde047", 1.2), 0.18, 0.78, 0.3));
    }
    if (cos.hat === "ice")
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        it(new THREE.ConeGeometry(0.06, 0.3, 6), track(new THREE.MeshPhysicalMaterial({ color: C("#e0f2fe"), roughness: 0.05, transmission: 0.6, thickness: 0.1, clearcoat: 1 })), Math.sin(a) * 0.4, 0.72, Math.cos(a) * 0.4);
      }
    if (cos.hat === "leaf") for (let i = 0; i < 5; i++) it(new THREE.SphereGeometry(0.12, 20, 14), fabric(i % 2 ? "#84cc16" : "#65a30d"), -0.36 + i * 0.18, 0.66, 0).scale.set(0.6, 1.6, 0.4);
    if (cos.hat === "doppi") {
      it(new THREE.CylinderGeometry(0.5, 0.57, 0.28, 4), fabric(hatHex ?? "#111827"), 0, 0.5, 0).rotation.y = Math.PI / 4;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        it(new THREE.SphereGeometry(0.07, 14, 10), fabric(cos.hatTrim ?? "#f8fafc"), Math.sin(a) * 0.41, 0.52, Math.cos(a) * 0.41).scale.set(1, 1.4, 0.4);
      }
    }
    if (cos.hat === "chugirma") {
      const fur = fabric(hatHex ?? "#f5f5f4", { roughness: 1, sheen: 1, sheenRoughness: 0.9 }, "fur", [8, 6], 1);
      it(new THREE.SphereGeometry(0.76, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), fur, 0, 0.22, 0).scale.set(1.05, 1.15, 1.05);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        it(new THREE.IcosahedronGeometry(0.15, 2), fur, Math.sin(a) * 0.64, 0.42 + (i % 3) * 0.1, Math.cos(a) * 0.64);
      }
    }
    if (cos.hat === "guard") {
      it(new THREE.ConeGeometry(0.7, 0.92, 48), metal("#a3acb9", 0.22), 0, 0.74, 0);
      it(new THREE.TorusGeometry(0.64, 0.065, 12, 56), gloss(cos.hatTrim ?? "#22d3ee"), 0, 0.33, 0).rotation.x = Math.PI / 2;
    }
    if (cos.eyepatch) {
      it(new THREE.SphereGeometry(0.11, 20, 14), leather("#111827"), 0.22, 0.0, 0.55).scale.set(1.1, 1, 0.4);
      const strap = it(new THREE.TorusGeometry(0.585, 0.012, 8, 64), leather("#111827"), 0, 0.08, 0);
      strap.rotation.x = Math.PI / 2 - 0.35;
      strap.rotation.z = 0.35;
    }
  }

  // ---- Hand items (right hand; origin = palm centre, fingers point down −y, palm faces −x) ----
  const hr = handR.R!;
  const held = group(hr, 0, -0.02, 0.03);
  held.scale.setScalar(1.3);
  const handKind = opts.holding ?? cos?.hand ?? look.hand;
  switch (handKind) {
    case "pencil": {
      const p = group(held, 0, 0, 0.03);
      p.rotation.x = Math.PI / 2.3;
      mesh(geo(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 6)), gloss("#facc15"), p);
      mesh(geo(new THREE.CylinderGeometry(0.0225, 0.0225, 0.04, 20)), metal("#cbd5e1", 0.25), p, 0, -0.17, 0);
      mesh(geo(limbLoft(THREE, [[0, 0.021], [-0.03, 0.02]], { seg: 16 })), track(new THREE.MeshPhysicalMaterial({ color: C("#f9a8d4"), roughness: 0.9 })), p, 0, -0.19, 0);
      mesh(geo(new THREE.ConeGeometry(0.022, 0.06, 6)), track(new THREE.MeshPhysicalMaterial({ color: C("#f3d9b1"), roughness: 0.9 })), p, 0, 0.18, 0);
      mesh(geo(new THREE.ConeGeometry(0.008, 0.022, 10)), track(new THREE.MeshPhysicalMaterial({ color: C("#374151"), roughness: 0.4, metalness: 0.4 })), p, 0, 0.21, 0);
      break;
    }
    case "book": {
      const b = group(held, 0, -0.03, 0.07);
      b.rotation.y = Math.PI / 2;
      const cover = leather("#1d4ed8", [3, 3]);
      mesh(slab(0.24, 0.3, 0.012, 0.005), cover, b, 0, 0, 0.032);
      mesh(slab(0.24, 0.3, 0.012, 0.005), cover, b, 0, 0, -0.032);
      mesh(slab(0.03, 0.3, 0.075, 0.012), cover, b, -0.115, 0, 0);
      const pages = track(new THREE.MeshPhysicalMaterial({ color: C("#fbf6e9"), roughness: 0.9, normalMap: det("denim", [1, 12]), normalScale: new THREE.Vector2(0.4, 0.4) }));
      mesh(slab(0.225, 0.285, 0.052, 0.004), pages, b, 0.006, 0, 0);
      const title = canvasTex(128, 160, (c) => {
        c.strokeStyle = "#fbbf24";
        c.lineWidth = 6;
        c.strokeRect(14, 14, 100, 132);
        c.fillStyle = "#fbbf24";
        c.font = "900 40px system-ui, sans-serif";
        c.textAlign = "center";
        c.fillText("{ }", 64, 92);
      });
      const t = mesh(geo(new THREE.PlaneGeometry(0.2, 0.26)), track(new THREE.MeshPhysicalMaterial({ map: title, transparent: true, metalness: 0.6, roughness: 0.3 })), b, 0, 0, 0.0395);
      t.castShadow = false;
      break;
    }
    case "laptop": {
      const l = group(held, 0, -0.02, 0.12);
      l.rotation.y = Math.PI / 2;
      l.rotation.z = -0.2;
      const alu = metal("#9ca3af", 0.32);
      mesh(slab(0.34, 0.016, 0.24, 0.006), alu, l, 0, 0, 0);
      const keysTex = canvasTex(256, 160, (c) => {
        c.fillStyle = "#1f2937";
        c.fillRect(0, 0, 256, 160);
        c.fillStyle = "#4b5563";
        for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) c.fillRect(10 + k * 20, 12 + r * 22, 16, 16);
        c.fillRect(70, 104, 116, 16);
        c.fillStyle = "#6b7280";
        c.fillRect(96, 128, 64, 26);
      });
      const kb = mesh(geo(new THREE.PlaneGeometry(0.31, 0.2)), track(new THREE.MeshPhysicalMaterial({ map: keysTex, roughness: 0.6 })), l, 0, 0.0085, 0.01);
      kb.rotation.x = -Math.PI / 2;
      const lid = group(l, 0, 0.008, -0.12);
      lid.rotation.x = -1.85;
      mesh(slab(0.34, 0.012, 0.24, 0.006), alu, lid, 0, 0, 0.12);
      const codeTex = canvasTex(256, 160, (c) => {
        c.fillStyle = "#0b1220";
        c.fillRect(0, 0, 256, 160);
        const cols = ["#22d3ee", "#a78bfa", "#4ade80", "#f472b6", "#facc15"];
        for (let r = 0; r < 9; r++) {
          let x = 12 + (r % 3) * 12;
          for (let k = 0; k < 3; k++) {
            const w = 18 + rnd(r * 3 + k) * 50;
            c.fillStyle = cols[(r + k) % cols.length];
            c.fillRect(x, 12 + r * 16, w, 7);
            x += w + 8;
          }
        }
      });
      const scr = mesh(geo(new THREE.PlaneGeometry(0.3, 0.2)), track(new THREE.MeshStandardMaterial({ map: codeTex, emissive: C("#ffffff"), emissiveMap: codeTex, emissiveIntensity: 0.9, roughness: 0.2 })), lid, 0, -0.0065, 0.12);
      scr.rotation.x = Math.PI / 2;
      break;
    }
    case "sword": {
      const sw = group(held, 0, 0, 0.04);
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-0.032, 0);
      bladeShape.lineTo(-0.03, 0.5);
      bladeShape.lineTo(0, 0.6);
      bladeShape.lineTo(0.03, 0.5);
      bladeShape.lineTo(0.032, 0);
      bladeShape.closePath();
      const bladeG = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 1 });
      bladeG.translate(0, 0.06, -0.002);
      mesh(geo(bladeG), metal("#e5e7eb", 0.1), sw);
      mesh(geo(new THREE.BoxGeometry(0.012, 0.42, 0.016)), metal("#94a3b8", 0.2), sw, 0, 0.3, 0);
      const guard = sweep(THREE, [V(-0.12, 0.07, 0), V(-0.06, 0.05, 0), V(0, 0.05, 0), V(0.06, 0.05, 0), V(0.12, 0.07, 0)], (t) => [0.018 * (1 - Math.abs(t - 0.5)), 0.022], () => undefined as unknown as void, { rows: 20, seg: 10 });
      mesh(geo(guard), metal("#d4a017", 0.25), sw);
      mesh(geo(new THREE.CylinderGeometry(0.022, 0.024, 0.13, 16)), leather("#451a03", [2, 6]), sw, 0, -0.02, 0);
      for (let i = 0; i < 4; i++) {
        const w = mesh(geo(new THREE.TorusGeometry(0.024, 0.005, 6, 16)), leather("#2a1205"), sw, 0, -0.07 + i * 0.033, 0);
        w.rotation.x = Math.PI / 2 + 0.3;
      }
      mesh(geo(new THREE.SphereGeometry(0.032, 20, 14)), metal("#d4a017", 0.25), sw, 0, -0.1, 0);
      mesh(geo(new THREE.OctahedronGeometry(0.018)), gloss("#dc2626"), sw, 0, 0.05, 0.024);
      break;
    }
    case "wand": {
      const w = group(held, 0, 0, 0.04);
      const prof: [number, number][] = [];
      for (let i = 0; i <= 30; i++) {
        const y = -0.12 + (i / 30) * 0.48;
        const r = 0.02 - (i / 30) * 0.01 + (i < 10 ? 0.004 * Math.sin(i * 1.6) : 0);
        prof.push([r, y]);
      }
      prof.unshift([0, -0.122]);
      prof.push([0, 0.362]);
      mesh(lathe(prof, 20), leather("#6b3410", [1, 6]), w);
      const st = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.05)), glow("#fde047", 1.6));
      st.position.set(0, 0.4, 0);
      w.add(st);
      spin.push(st);
      const gl = new THREE.Mesh(geo(new THREE.SphereGeometry(0.075, 16, 12)), track(new THREE.MeshBasicMaterial({ color: C("#fef08a"), transparent: true, opacity: 0.25, depthWrite: false })));
      gl.position.copy(st.position);
      w.add(gl);
      break;
    }
    case "trophy": {
      const tr = group(held, 0, 0.02, 0.1);
      const gold = metal("#f6c445", 0.16);
      mesh(lathe([[0, 0], [0.1, 0.0], [0.13, 0.06], [0.135, 0.12], [0.12, 0.17], [0.11, 0.175], [0.105, 0.17], [0.11, 0.12], [0.1, 0.06], [0.04, 0.01], [0, 0.005]], 48), gold, tr, 0, 0.06, 0);
      for (const s of [-1, 1]) {
        const h = mesh(geo(new THREE.TorusGeometry(0.05, 0.012, 10, 24, Math.PI * 1.2)), gold, tr, s * 0.135, 0.17, 0);
        h.rotation.z = s > 0 ? -Math.PI * 0.6 : Math.PI * 0.4 + Math.PI;
      }
      mesh(lathe([[0, 0.0], [0.03, 0.0], [0.022, 0.03], [0.018, 0.06], [0, 0.06]], 24), gold, tr, 0, 0.0, 0);
      mesh(slab(0.15, 0.05, 0.11, 0.01), leather("#3f2a1d"), tr, 0, -0.02, 0);
      const plate = mesh(geo(new THREE.PlaneGeometry(0.08, 0.025)), metal("#f6c445", 0.3), tr, 0, -0.02, 0.0565);
      plate.castShadow = false;
      break;
    }
    case "pickaxe": {
      const pk = group(held, 0, 0.02, 0.05);
      pk.rotation.z = 0.5;
      mesh(geo(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 12)), leather("#78350f", [1, 6]), pk, 0, 0.2, 0);
      const headP = sweep(THREE, [V(-0.18, 0.36, 0), V(-0.08, 0.43, 0), V(0, 0.44, 0), V(0.08, 0.43, 0), V(0.18, 0.36, 0)], (t) => [0.02 + 0.025 * Math.sin(Math.PI * t), 0.016 + 0.012 * Math.sin(Math.PI * t)], () => undefined as unknown as void, { rows: 24, seg: 10 });
      mesh(geo(headP), metal("#94a3b8", 0.3), pk);
      break;
    }
    case "dutor": {
      const d = group(held, 0, 0.05, 0.08);
      d.rotation.z = 0.6;
      const wood = track(new THREE.MeshPhysicalMaterial({ color: C("#a0522d"), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, normalMap: det("metal", [1, 3]), normalScale: new THREE.Vector2(0.3, 0.3) }));
      const bowl = mesh(lathe([[0, -0.2], [0.07, -0.18], [0.11, -0.12], [0.11, -0.05], [0.07, 0.0], [0.03, 0.03], [0, 0.035]], 36), wood, d);
      bowl.scale.z = 0.55;
      mesh(geo(new THREE.BoxGeometry(0.035, 0.5, 0.022)), wood, d, 0, 0.26, 0.01);
      for (let i = 0; i < 6; i++) mesh(geo(new THREE.BoxGeometry(0.04, 0.004, 0.026)), leather("#3f2a1d"), d, 0, 0.08 + i * 0.06, 0.012);
      for (const s of [-1, 1]) {
        mesh(geo(new THREE.CylinderGeometry(0.0018, 0.0018, 0.66, 4)), metal("#e5e7eb", 0.2), d, s * 0.008, 0.16, 0.03);
        mesh(geo(new THREE.CapsuleGeometry(0.008, 0.04, 3, 8)), wood, d, s * 0.03, 0.47, 0.01).rotation.z = Math.PI / 2;
      }
      break;
    }
  }

  // ---- Back items: capes, wings, jetpack, backpack, tails ----
  let cape: T.Object3D | null = null;
  const wings: T.Object3D[] = [];
  const backKind = cos ? (cos.cape ? "cape" : "none") : look.back;
  const capeHex = cos?.cape ?? "#dc2626";
  if (backKind === "cape") {
    const pivot = group(chest, 0, 0.47, -0.13);
    const capeG = gridSurface(
      THREE,
      36,
      30,
      (u, v, out) => {
        const a = (u * 2 - 1) * (0.62 + v * 0.35);
        const r = 0.2 + v * 0.26;
        const fold = 0.025 * Math.sin(u * Math.PI * 7) * v;
        out.set(Math.sin(a) * (r + fold), -v * 0.78 + Math.abs(u * 2 - 1) * 0.05 * v, -Math.cos(a) * (r + fold) - v * 0.06);
      },
      { center: (_u, v, out) => out.set(0, -v * 0.78, 0.2) }
    );
    mesh(
      geo(capeG),
      track(new THREE.MeshPhysicalMaterial({ color: C(capeHex), roughness: 0.7, sheen: 1, sheenRoughness: 0.4, sheenColor: lighten(capeHex, 0.5), side: THREE.DoubleSide, normalMap: det("weave", [10, 10]), normalScale: new THREE.Vector2(0.3, 0.3) })),
      pivot
    );
    for (const s of [-1, 1]) mesh(geo(new THREE.SphereGeometry(0.035, 18, 14)), metal("#d4a017", 0.25), chest, s * 0.17, 0.47, 0.1);
    cape = pivot;
  }
  if (backKind === "backpack") {
    const bp = group(chest, 0, 0.23, -0.27);
    const canvasM = fabric("#b45309", { roughness: 0.85 }, "weave", [8, 8], 0.5);
    mesh(slab(0.4, 0.44, 0.17, 0.07), canvasM, bp);
    mesh(slab(0.3, 0.16, 0.07, 0.035), fabric("#92400e", {}, "weave", [6, 3], 0.5), bp, 0, -0.1, -0.11);
    mesh(slab(0.3, 0.12, 0.2, 0.05), fabric("#92400e", {}, "weave", [6, 3], 0.5), bp, 0, 0.19, -0.01);
    mesh(geo(new THREE.BoxGeometry(0.22, 0.006, 0.01)), metal("#e5e7eb", 0.25), bp, 0, -0.02, -0.147);
    mesh(geo(new THREE.BoxGeometry(0.02, 0.03, 0.01)), metal("#e5e7eb", 0.25), bp, 0.08, -0.04, -0.15);
    const hdl = mesh(geo(new THREE.TorusGeometry(0.05, 0.012, 8, 20, Math.PI)), leather("#451a03"), bp, 0, 0.25, 0);
    hdl.rotation.y = Math.PI / 2;
    for (const x of [-0.14, 0.14]) {
      const pts = [V(x, 0.42, -0.12), V(x * 1.05, 0.5, 0.0), V(x * 1.1, 0.44, 0.17), V(x * 1.15, 0.25, 0.21), V(x * 1.2, 0.08, 0.2)];
      mesh(geo(sweep(THREE, pts, () => [0.028, 0.008], (p, o) => o.set(p.x, 0, p.z + 0.05).normalize(), { rows: 24, seg: 8 })), leather("#451a03", [1, 8]), chest);
    }
  }
  if (backKind === "jetpack") {
    const jp = group(chest, 0, 0.22, -0.28);
    mesh(slab(0.16, 0.3, 0.12, 0.04), metal("#475569", 0.35), jp);
    for (const x of [-0.13, 0.13]) {
      mesh(geo(limbLoft(THREE, [[0.18, 0.08], [0.0, 0.085], [-0.18, 0.08]], { seg: 32 })), metal("#94a3b8", 0.25), jp, x, 0.02, -0.02);
      mesh(geo(band(THREE, 0.086, 0.086, 0.03, 0.008)), metal("#f97316", 0.3), jp, x, 0.1, -0.02);
      mesh(lathe([[0.055, 0], [0.07, -0.06], [0.06, -0.07], [0.04, -0.01]], 24), metal("#334155", 0.3), jp, x, -0.18, -0.02);
      const f = mesh(geo(new THREE.ConeGeometry(0.055, 0.24, 20)), glow("#fb923c", 1.8), jp, x, -0.38, -0.02);
      f.rotation.x = Math.PI;
      f.castShadow = false;
      const f2 = mesh(geo(new THREE.ConeGeometry(0.03, 0.15, 16)), glow("#fef08a", 2.2), jp, x, -0.34, -0.02);
      f2.rotation.x = Math.PI;
      f2.castShadow = false;
      flames.push(f, f2);
    }
  }
  if (backKind === "wings") {
    const feather = (len: number, w: number) => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(w, len * 0.2, w * 0.9, len * 0.8, 0, len);
      s.bezierCurveTo(-w * 0.6, len * 0.75, -w * 0.7, len * 0.2, 0, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 8 });
      return geo(g);
    };
    const featherM = track(new THREE.MeshPhysicalMaterial({ color: C("#f8fafc"), roughness: 0.75, sheen: 1, sheenColor: C("#e0f2fe"), normalMap: det("feather", [1, 1]), normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.DoubleSide }));
    const fLong = feather(0.36, 0.06);
    const fMid = feather(0.24, 0.055);
    const fShort = feather(0.14, 0.05);
    for (const s of [-1, 1]) {
      const pivot = group(chest, s * 0.1, 0.34, -0.22);
      const wing = group(pivot);
      wing.scale.set(s, 1, 1);
      // rows: primaries (long, at the tip), secondaries, coverts
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const f = mesh(i < 5 ? fLong : fMid, featherM, wing, 0.08 + t * 0.55, 0.16 - t * 0.12, -0.02 - t * 0.04);
        f.rotation.z = -Math.PI * 0.85 + t * 0.9;
        f.rotation.y = 0.15;
      }
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const f = mesh(fShort, featherM, wing, 0.06 + t * 0.5, 0.2 - t * 0.08, 0.0);
        f.rotation.z = -Math.PI * 0.8 + t * 0.7;
      }
      const arm = sweep(THREE, [V(0, 0.05, 0), V(0.25, 0.25, -0.02), V(0.55, 0.22, -0.04), V(0.7, 0.12, -0.05)], (t) => [0.04 * (1 - t * 0.6), 0.03 * (1 - t * 0.5)], () => undefined as unknown as void, { rows: 20, seg: 10 });
      mesh(geo(arm), featherM, wing);
      pivot.userData.side = s;
      wings.push(pivot);
    }
  }
  if (backKind === "dragon") {
    const membrane = track(new THREE.MeshPhysicalMaterial({ color: C("#7c3aed"), roughness: 0.5, sheen: 0.6, sheenColor: C("#c4b5fd"), side: THREE.DoubleSide, transmission: 0.25, thickness: 0.02, transparent: true, opacity: 0.95 }));
    const boneM = gloss("#4c1d95");
    for (const s of [-1, 1]) {
      const pivot = group(chest, s * 0.1, 0.34, -0.22);
      const wing = group(pivot);
      wing.scale.set(s, 1, 1);
      const shoulder = V(0, 0.04, 0);
      const elbowP = V(0.3, 0.3, -0.04);
      const tips = [V(0.85, 0.35, -0.08), V(0.78, 0.05, -0.08), V(0.6, -0.18, -0.07), V(0.32, -0.22, -0.05)];
      mesh(geo(sweep(THREE, [shoulder, V(0.15, 0.2, -0.02), elbowP], (t) => [0.03 * (1 - t * 0.4), 0.03 * (1 - t * 0.4)], () => undefined as unknown as void, { rows: 12, seg: 10 })), boneM, wing);
      for (const tp of tips) mesh(geo(sweep(THREE, [elbowP, elbowP.clone().lerp(tp, 0.5).add(V(0, 0.02, 0)), tp], (t) => [0.018 * (1 - t * 0.8), 0.018 * (1 - t * 0.8)], () => undefined as unknown as void, { rows: 12, seg: 8 })), boneM, wing);
      const claw = mesh(geo(new THREE.ConeGeometry(0.02, 0.07, 10)), gloss("#f5f5f4"), wing, elbowP.x, elbowP.y + 0.04, elbowP.z);
      claw.rotation.z = -0.3;
      // membrane between consecutive fingers, scalloped edge
      const edge = [elbowP, ...tips, shoulder];
      const mg = gridSurface(
        THREE,
        40,
        10,
        (u, v, out) => {
          const k = u * (edge.length - 2);
          const i = Math.min(edge.length - 3, Math.floor(k));
          const f = k - i;
          const a = edge[i + 1];
          const b = edge[i + 2];
          const e = a.clone().lerp(b, f);
          // scallop: pull the edge toward the elbow between bones
          e.lerp(elbowP, Math.sin(Math.PI * f) * 0.18 * (i < 3 ? 1 : 0.3));
          out.copy(elbowP).lerp(e, v);
          out.z -= Math.sin(Math.PI * v) * 0.02;
        },
        { center: (_u, _v, out) => out.set(0.3, 0.1, 0.3) }
      );
      mesh(geo(mg), membrane, wing);
      pivot.userData.side = s;
      wings.push(pivot);
    }
  }
  if (cos?.tail) {
    const pts = [V(0, -0.02, -0.18), V(0.05, -0.08, -0.32), V(0.12, -0.04, -0.45), V(0.2, 0.06, -0.5)];
    mesh(geo(sweep(THREE, pts, (t) => [0.06 * (1 - t * 0.7), 0.06 * (1 - t * 0.7)], () => undefined as unknown as void, { rows: 24, seg: 14 })), fabric(cos.tail), hips);
  }

  // ---- Pet ----
  let pet: T.Group | null = null;
  if (look.pet !== "none") {
    pet = group(root, -0.85, 0, 0.35);
    pet.rotation.y = 0.5;
    const petEye = (parent: T.Object3D, x: number, y: number, z: number, r = 0.03) => {
      mesh(geo(new THREE.SphereGeometry(r, 20, 16)), gloss("#0f172a"), parent, x, y, z);
      const h = mesh(geo(new THREE.SphereGeometry(r * 0.32, 10, 8)), basic("#ffffff"), parent, x - r * 0.3, y + r * 0.35, z + r * 0.8);
      h.castShadow = false;
    };
    if (look.pet === "drone") {
      const d = group(pet, 0, 0.75, 0);
      mesh(slab(0.3, 0.1, 0.24, 0.045), gloss("#334155"), d);
      mesh(geo(new THREE.SphereGeometry(0.07, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2)), track(new THREE.MeshPhysicalMaterial({ color: C("#0f172a"), roughness: 0.05, clearcoat: 1 })), d, 0, 0.05, 0);
      const eye = mesh(geo(new THREE.SphereGeometry(0.035, 16, 12)), glow("#22d3ee", 1.4), d, 0, 0, 0.12);
      eye.castShadow = false;
      for (const [x, z] of [[-0.19, -0.15], [0.19, -0.15], [-0.19, 0.15], [0.19, 0.15]]) {
        mesh(geo(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8)), metal("#94a3b8"), d, x, 0.04, z);
        const ring = mesh(geo(new THREE.TorusGeometry(0.075, 0.008, 6, 24)), gloss("#1f2937"), d, x, 0.06, z);
        ring.rotation.x = Math.PI / 2;
        const rot = mesh(geo(new THREE.BoxGeometry(0.14, 0.004, 0.02)), track(new THREE.MeshStandardMaterial({ color: C("#94a3b8"), transparent: true, opacity: 0.7 })), d, x, 0.07, z);
        spin.push(rot);
      }
    } else if (look.pet === "chick") {
      const fluff = fabric("#fde047", { roughness: 0.95, sheen: 1, sheenColor: C("#fef9c3") }, "fur", [6, 6], 1);
      const body = mesh(geo(new THREE.SphereGeometry(0.2, 32, 24)), fluff, pet, 0, 0.21, 0);
      body.scale.set(1, 0.95, 1.05);
      const tuft = mesh(geo(new THREE.ConeGeometry(0.03, 0.09, 10)), fluff, pet, 0, 0.42, 0.02);
      tuft.rotation.z = 0.3;
      petEye(pet, -0.07, 0.27, 0.16);
      petEye(pet, 0.07, 0.27, 0.16);
      const beak = mesh(geo(new THREE.ConeGeometry(0.035, 0.07, 14)), gloss("#f97316"), pet, 0, 0.22, 0.2);
      beak.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const w = mesh(geo(new THREE.SphereGeometry(0.08, 18, 12)), fluff, pet, s * 0.19, 0.2, -0.02);
        w.scale.set(0.35, 0.8, 0.9);
        w.rotation.z = s * 0.3;
        mesh(geo(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 6)), gloss("#f97316"), pet, s * 0.06, 0.02, 0.02);
        const foot = mesh(geo(new THREE.SphereGeometry(0.03, 12, 8)), gloss("#f97316"), pet, s * 0.06, 0.005, 0.05);
        foot.scale.set(1, 0.3, 1.4);
      }
      for (const s of [-1, 1]) decal(new THREE.CircleGeometry(0.025, 16), track(new THREE.MeshBasicMaterial({ color: C("#fb923c"), transparent: true, opacity: 0.45 })), pet).position.set(s * 0.12, 0.2, 0.17);
    } else if (look.pet === "cat") {
      const furM = fabric("#f59e0b", { roughness: 0.95, sheen: 1, sheenColor: C("#fde68a") }, "fur", [6, 6], 0.8);
      const white = fabric("#fff7ed", { roughness: 0.95 }, "fur", [4, 4], 0.8);
      const body = mesh(geo(new THREE.SphereGeometry(0.17, 28, 20)), furM, pet, 0, 0.17, -0.03);
      body.scale.set(0.95, 1.05, 1.15);
      mesh(geo(new THREE.SphereGeometry(0.1, 20, 14)), white, pet, 0, 0.16, 0.1).scale.set(0.9, 1.1, 0.6);
      const hd = group(pet, 0, 0.4, 0.05);
      mesh(geo(new THREE.SphereGeometry(0.15, 32, 24)), furM, hd).scale.set(1.12, 0.95, 1);
      mesh(geo(new THREE.SphereGeometry(0.07, 18, 12)), white, hd, 0, -0.04, 0.1).scale.set(1.2, 0.7, 0.7);
      for (const s of [-1, 1]) {
        const ear = mesh(geo(new THREE.ConeGeometry(0.06, 0.12, 16)), furM, hd, s * 0.09, 0.14, -0.01);
        ear.rotation.z = -s * 0.25;
        const inner = mesh(geo(new THREE.ConeGeometry(0.035, 0.08, 12)), track(new THREE.MeshPhysicalMaterial({ color: C("#fda4af"), roughness: 0.8 })), hd, s * 0.088, 0.135, 0.015);
        inner.rotation.z = -s * 0.25;
        inner.scale.z = 0.5;
        petEye(hd, s * 0.06, 0.02, 0.125, 0.028);
        for (let k = 0; k < 2; k++) {
          const wh = mesh(geo(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 4)), basic("#fafafa"), hd, s * 0.11, -0.04 + k * 0.02, 0.1);
          wh.rotation.z = Math.PI / 2 + s * (k ? 0.15 : -0.1);
        }
      }
      mesh(geo(new THREE.SphereGeometry(0.014, 10, 8)), gloss("#f472b6"), hd, 0, -0.02, 0.15);
      const tail = sweep(THREE, [V(0, 0.08, -0.2), V(0.1, 0.12, -0.28), V(0.16, 0.3, -0.24), V(0.1, 0.42, -0.2)], (t) => [0.03 * (1 - t * 0.3), 0.03 * (1 - t * 0.3)], () => undefined as unknown as void, { rows: 20, seg: 12 });
      mesh(geo(tail), furM, pet);
      for (const s of [-1, 1]) mesh(geo(new THREE.SphereGeometry(0.045, 14, 10)), white, pet, s * 0.07, 0.03, 0.1).scale.set(1, 0.6, 1.3);
    } else {
      // little dragon
      const scaleM = track(new THREE.MeshPhysicalMaterial({ color: C("#22c55e"), roughness: 0.45, clearcoat: 0.5, normalMap: det("leather", [6, 6]), normalScale: new THREE.Vector2(0.6, 0.6) }));
      const belly = track(new THREE.MeshPhysicalMaterial({ color: C("#fde68a"), roughness: 0.6, normalMap: det("knit", [2, 4]), normalScale: new THREE.Vector2(0.5, 0.5) }));
      const body = mesh(geo(new THREE.SphereGeometry(0.16, 28, 20)), scaleM, pet, 0, 0.17, 0);
      body.scale.set(0.95, 1.1, 1.1);
      mesh(geo(new THREE.SphereGeometry(0.11, 20, 14)), belly, pet, 0, 0.16, 0.08).scale.set(0.9, 1.1, 0.6);
      const hd = group(pet, 0, 0.4, 0.05);
      mesh(geo(new THREE.SphereGeometry(0.14, 28, 20)), scaleM, hd).scale.set(1.05, 0.95, 1);
      mesh(geo(new THREE.SphereGeometry(0.08, 20, 14)), scaleM, hd, 0, -0.04, 0.11).scale.set(1.1, 0.75, 1);
      for (const s of [-1, 1]) {
        mesh(geo(new THREE.ConeGeometry(0.025, 0.1, 12)), gloss("#fef3c7"), hd, s * 0.07, 0.14, -0.03).rotation.set(-0.4, 0, -s * 0.3);
        petEye(hd, s * 0.06, 0.03, 0.115, 0.03);
        const w = sweep(THREE, [V(s * 0.1, 0.26, -0.08), V(s * 0.25, 0.38, -0.12), V(s * 0.3, 0.22, -0.12)], (t) => [0.06 * Math.sin(Math.PI * Math.max(0.15, t)), 0.008], (p, o) => o.set(0, 0, 1), { rows: 12, seg: 8 });
        mesh(geo(w), track(new THREE.MeshPhysicalMaterial({ color: C("#15803d"), roughness: 0.5, side: THREE.DoubleSide })), pet);
        mesh(geo(new THREE.SphereGeometry(0.045, 14, 10)), scaleM, pet, s * 0.07, 0.03, 0.06).scale.set(1, 0.6, 1.3);
      }
      const tail = sweep(THREE, [V(0, 0.08, -0.15), V(0.06, 0.05, -0.28), V(0.16, 0.08, -0.36), V(0.24, 0.16, -0.36)], (t) => [0.05 * (1 - t * 0.85), 0.05 * (1 - t * 0.85)], () => undefined as unknown as void, { rows: 20, seg: 12 });
      mesh(geo(tail), scaleM, pet);
      for (let i = 0; i < 4; i++) {
        const sp = mesh(geo(new THREE.ConeGeometry(0.02, 0.05, 8)), gloss("#15803d"), pet, 0, 0.36 - i * 0.07, -0.1 - i * 0.04);
        sp.rotation.x = -0.6 - i * 0.2;
      }
    }
  }

  // ---- Merge static parts that share a material (draw calls ÷ 3–5) ----
  for (const g of mergeStatic(THREE, root, new Set<T.Object3D>([...spin, ...flames]))) track(g);

  // ---- Pose ----
  let faceNow: FaceKey = "idle";
  const setFace = (f: FaceKey) => {
    if (f === faceNow) return;
    faceNow = f;
    mouthM.map = mouthTex[f] ?? mouthTex.idle!;
    mouthM.needsUpdate = true;
  };
  // Eyelids per expression: upper lid edge (1 = open), tilt (− outer corner droops), lower lid and its arc
  type Lids = { top: number; tilt: number; low: number; curve: number };
  const OPEN: Lids = { top: 0.985, tilt: 0, low: -0.06, curve: 0 };
  const lidsFor = (f: FaceKey, side: number): Lids => {
    const base: Lids =
      f === "blink"
        ? { top: 0.5, tilt: 0, low: 0.42, curve: 0.06 }
        : f === "happy"
          ? { top: 1.0, tilt: 0, low: 0.16, curve: 0.34 }
          : f === "sad"
            ? { top: 0.86, tilt: -0.14, low: -0.06, curve: 0 }
            : f === "hit"
              ? { top: 0.56, tilt: 0.12, low: 0.34, curve: 0.06 }
              : f === "think"
                ? { top: side > 0 ? 0.94 : 0.8, tilt: 0, low: 0.06, curve: 0.04 }
                : look.eyes === "happy"
                  ? { top: 1.0, tilt: 0, low: 0.1, curve: 0.22 }
                  : OPEN;
    // permanent wink (right eye shut in a happy arc), except while blinking/hit
    if (look.eyes === "wink" && side > 0 && f !== "hit") return { top: 0.58, tilt: 0, low: 0.24, curve: 0.3 };
    return base;
  };
  const browFor = (f: FaceKey, s: number) =>
    f === "sad"
      ? { y: -0.01, rz: s * 0.28 }
      : f === "hit"
        ? { y: -0.025, rz: -s * 0.3 }
        : f === "happy"
          ? { y: 0.022, rz: -s * 0.05 }
          : f === "think"
            ? { y: s > 0 ? 0.03 : -0.012, rz: s > 0 ? 0.12 : -0.08 }
            : { y: 0, rz: 0 };
  const lidState = eyeUniforms.map(() => ({ ...OPEN }));
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const xAxis = V(1, 0, 0);

  const pose = (p: Pose, t: number, gaze?: { x: number; y: number }) => {
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
    // Face: eyelids ease toward the expression (blinks snap), brows, mouth texture, gaze in the eyes
    setFace(p.face);
    eyeUniforms.forEach((e, i) => {
      const st = lidState[i];
      const tg = lidsFor(p.face, e.side);
      const k = p.face === "blink" ? 0.7 : 0.25;
      st.top += (tg.top - st.top) * k;
      st.tilt += (tg.tilt - st.tilt) * k;
      st.low += (tg.low - st.low) * k;
      st.curve += (tg.curve - st.curve) * k;
      e.u.uLidTop.value = st.top;
      e.u.uLidTilt.value = st.tilt;
      e.u.uLow.value = st.low;
      e.u.uLowCurve.value = st.curve;
      if (gaze) e.u.uGaze.value.set(Math.max(-1, Math.min(1, gaze.x)), Math.max(-1, Math.min(1, -gaze.y)));
    });
    for (const b of brows) {
      const tg = browFor(p.face, b.side);
      b.y += (tg.y - b.y) * 0.25;
      b.rz += (tg.rz - b.rz) * 0.25;
      qa.setFromAxisAngle(xAxis, -b.y / HEAD_R);
      qb.setFromAxisAngle(b.axis, b.rz);
      b.g.quaternion.multiplyQuaternions(qa, qb);
    }
    // Follow-through and effects
    if (cape) cape.rotation.x = 0.12 + p.back + Math.sin(t * 2.2) * 0.04;
    for (const w of wings) w.rotation.y = w.userData.side * (0.35 + Math.sin(t * 4.5) * 0.25);
    for (const f of flames) f.scale.setScalar(0.94 + Math.sin(t * 30 + f.id) * 0.06);
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
