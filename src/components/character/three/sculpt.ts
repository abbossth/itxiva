// Geometry toolkit for the chibi character: parametric surfaces with clean analytic-ish normals,
// superellipse lofts (torso, limbs, boots), swept "clumps" (hair locks, brows), and the sculpted head
// surface so face parts (eyes, mouth, brows, blush) and hair sit exactly on the skin like decals.

import type * as T from "three";

type Three = typeof import("three");

export const HEAD_R = 0.5;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Head sculpt: a point on the sphere of radius HEAD_R → the sculpted head (full cheeks, soft small chin) */
export function sculptHead(x: number, y: number, z: number, out: T.Vector3): T.Vector3 {
  const ny = y / HEAD_R;
  const nz = z / HEAD_R;
  if (ny < 0) {
    const k = smooth(0, -1, ny);
    x *= 1 - 0.16 * k * k;
    z *= 1 - 0.05 * k;
    y *= 1 - 0.08 * k;
  }
  const cheek = Math.exp(-((ny + 0.32) ** 2) / 0.05) * smooth(0.1, 0.7, nz) * smooth(0.25, 0.75, Math.abs(x / HEAD_R));
  x *= 1 + 0.06 * cheek;
  z *= 1 + 0.03 * cheek;
  if (nz > 0.5) z *= 1 - 0.04 * smooth(0.5, 1, nz);
  if (nz < 0 && ny > -0.2) z *= 1 + 0.05 * smooth(0, -1, nz);
  return out.set(x, y * 1.02, z * 0.96);
}

/** az: 0 = front (+z), +π/2 = character's left (+x), π = back. pol: 0 = top, π = bottom */
export function headDir(az: number, pol: number, out: T.Vector3) {
  return out.set(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
}

export interface SurfaceFrame {
  p: T.Vector3;
  n: T.Vector3;
}

export function makeHeadSurface(THREE: Three) {
  const d = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const at = (az: number, pol: number, out = new THREE.Vector3()) => {
    headDir(az, pol, d);
    return sculptHead(d.x * HEAD_R, d.y * HEAD_R, d.z * HEAD_R, out);
  };
  /** Surface point lifted along the normal by `lift` */
  const frame = (az: number, pol: number, lift = 0): SurfaceFrame => {
    const p = at(az, pol);
    const e = 1e-3;
    at(az + e, pol, a).sub(at(az - e, pol, b));
    const du = a.clone();
    at(az, pol + e, a).sub(at(az, pol - e, b));
    const n = new THREE.Vector3().crossVectors(a, du);
    if (n.lengthSq() < 1e-12) n.copy(p);
    n.normalize();
    if (n.dot(p) < 0) n.negate();
    p.addScaledVector(n, lift);
    return { p, n };
  };
  return { at, frame };
}

export type SurfaceFn = (u: number, v: number, out: T.Vector3) => void;

/**
 * Parametric surface on a (nu × nv) grid. Normals from central differences (wrapping where the surface
 * wraps), flipped to point away from `center(u, v)`; triangle winding made to match the normals.
 */
export function gridSurface(
  THREE: Three,
  nu: number,
  nv: number,
  fn: SurfaceFn,
  o: { wrapU?: boolean; wrapV?: boolean; center?: (u: number, v: number, out: T.Vector3) => void; uvScale?: [number, number] } = {}
): T.BufferGeometry {
  const cols = nu + 1;
  const rows = nv + 1;
  const pos = new Float32Array(cols * rows * 3);
  const nor = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const p = new THREE.Vector3();
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const u = i / nu;
      const v = j / nv;
      fn(o.wrapU && i === nu ? 0 : u, o.wrapV && j === nv ? 0 : v, p);
      const k = j * cols + i;
      pos.set([p.x, p.y, p.z], k * 3);
      uv.set([u * (o.uvScale?.[0] ?? 1), v * (o.uvScale?.[1] ?? 1)], k * 2);
    }
  const P = (i: number, j: number, out: T.Vector3) => {
    if (o.wrapU) i = ((i % nu) + nu) % nu;
    else i = Math.max(0, Math.min(nu, i));
    if (o.wrapV) j = ((j % nv) + nv) % nv;
    else j = Math.max(0, Math.min(nv, j));
    const k = (j * cols + i) * 3;
    return out.set(pos[k], pos[k + 1], pos[k + 2]);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normalAt = (i: number, j: number) => {
    P(i + 1, j, a);
    P(i - 1, j, b);
    du.subVectors(a, b);
    P(i, j + 1, a);
    P(i, j - 1, b);
    dv.subVectors(a, b);
    n.crossVectors(du, dv);
    return n.lengthSq();
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      let l = normalAt(i, j);
      // degenerate (pole / collapsed tip): borrow the neighbouring row's normal
      for (let s = 1; l < 1e-14 && s < 4; s++) {
        l = normalAt(i, Math.min(nv, j + s));
        if (l < 1e-14) l = normalAt(i, Math.max(0, j - s));
      }
      n.normalize();
      P(i, j, a);
      if (o.center) {
        o.center(i / nu, j / nv, c);
        if (n.dot(a.sub(c)) < 0) n.negate();
      }
      nor.set([n.x, n.y, n.z], (j * cols + i) * 3);
    }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const k0 = j * cols + i;
      const k1 = k0 + 1;
      const k2 = k0 + cols;
      const k3 = k2 + 1;
      idx.push(k0, k1, k2, k1, k3, k2);
    }
  // winding: match the average normal of a sample of triangles
  let agree = 0;
  for (let t = 0; t < idx.length; t += 6 * Math.max(1, Math.floor(nu / 3))) {
    const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
    a.set(pos[i1 * 3] - pos[i0 * 3], pos[i1 * 3 + 1] - pos[i0 * 3 + 1], pos[i1 * 3 + 2] - pos[i0 * 3 + 2]);
    b.set(pos[i2 * 3] - pos[i0 * 3], pos[i2 * 3 + 1] - pos[i0 * 3 + 1], pos[i2 * 3 + 2] - pos[i0 * 3 + 2]);
    c.crossVectors(a, b);
    n.set(nor[i0 * 3], nor[i0 * 3 + 1], nor[i0 * 3 + 2]);
    agree += Math.sign(c.dot(n));
  }
  if (agree < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Ring of a loft: y, half-width, half-depth, squareness (2 = ellipse, higher = boxier), z offset */
export interface Ring {
  y: number;
  rx: number;
  rz: number;
  n?: number;
  z?: number;
  x?: number;
}

const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/** Smooth (Catmull-Rom) interpolation through rings; v ∈ [0, 1] */
export function ringAt(rings: Ring[], v: number): Required<Ring> {
  const m = rings.length - 1;
  const f = Math.max(0, Math.min(m, v * m));
  const i = Math.min(m - 1, Math.floor(f));
  const t = f - i;
  const R = (k: number) => rings[Math.max(0, Math.min(m, k))];
  const get = (key: keyof Ring, def: number) => cr(R(i - 1)[key] ?? def, R(i)[key] ?? def, R(i + 1)[key] ?? def, R(i + 2)[key] ?? def, t);
  return { y: get("y", 0), rx: Math.max(0, get("rx", 0)), rz: Math.max(0, get("rz", 0)), n: get("n", 2), z: get("z", 0), x: get("x", 0) };
}

const spow = (c: number, e: number) => Math.sign(c) * Math.pow(Math.abs(c), e);

/** Point on a superellipse ring. θ = π/2 → front (+z) */
export function ringPoint(r: Required<Ring>, theta: number, out: T.Vector3) {
  const e = 2 / r.n;
  return out.set(r.x + r.rx * spow(Math.cos(theta), e), r.y, r.z + r.rz * spow(Math.sin(theta), e));
}

/** Closed loft through rings (vertical axis). Rings with rx = rz = 0 at the ends close the shape. */
export function loft(
  THREE: Three,
  rings: Ring[],
  o: { seg?: number; rows?: number; uvScale?: [number, number]; disp?: (theta: number, y: number, v: number) => number } = {}
) {
  const tmp = { r: ringAt(rings, 0) };
  return gridSurface(
    THREE,
    o.seg ?? 40,
    o.rows ?? Math.max(12, rings.length * 5),
    (u, v, out) => {
      tmp.r = ringAt(rings, v);
      const th = u * Math.PI * 2 + Math.PI / 2;
      ringPoint(tmp.r, th, out);
      if (o.disp) {
        // displace outward in the ring plane (cloth folds, panel lines)
        const dx = out.x - tmp.r.x;
        const dz = out.z - tmp.r.z;
        const l = Math.hypot(dx, dz) || 1;
        const d = o.disp(th, out.y, v);
        out.x += (dx / l) * d;
        out.z += (dz / l) * d;
      }
    },
    {
      wrapU: true,
      uvScale: o.uvScale,
      center: (_u, v, out) => {
        const r = ringAt(rings, v);
        out.set(r.x, r.y, r.z);
      },
    }
  );
}

/** Rounded-end limb hanging from y = 0: profile [y, rx, rz?][] (ends get hemispherical caps) */
export function limbLoft(THREE: Three, pts: [number, number, number?][], o: { seg?: number; n?: number; z?: number[] } = {}) {
  const first = pts[0];
  const last = pts[pts.length - 1];
  const rings: Ring[] = [];
  const cap = (y: number, rx: number, rz: number, dir: 1 | -1, z = 0) => {
    const steps = 4;
    const out: Ring[] = [];
    for (let i = steps; i >= 1; i--) {
      const a = (i / steps) * (Math.PI / 2);
      out.push({ y: y + dir * Math.sin(a) * Math.min(rx, rz) * 0.8, rx: rx * Math.cos(a) + 1e-4, rz: rz * Math.cos(a) + 1e-4, n: o.n, z });
    }
    return out;
  };
  rings.push(...cap(first[0], first[1], first[2] ?? first[1], 1, o.z?.[0] ?? 0));
  pts.forEach(([y, rx, rz], i) => rings.push({ y, rx, rz: rz ?? rx, n: o.n, z: o.z?.[i] ?? 0 }));
  rings.push(...cap(last[0], last[1], last[2] ?? last[1], -1, o.z?.[pts.length - 1] ?? 0).reverse());
  return loft(THREE, rings, { seg: o.seg ?? 28, rows: rings.length * 3 });
}

/** Band around a superellipse ring (belt, collar, cuffs, hems): rounded-rectangle cross-section */
export function band(THREE: Three, rx: number, rz: number, height: number, thick: number, o: { n?: number; seg?: number; z?: number } = {}) {
  const ring: Required<Ring> = { y: 0, rx, rz, n: o.n ?? 2, z: o.z ?? 0, x: 0 };
  const c = new THREE.Vector3();
  const q = new THREE.Vector3();
  return gridSurface(
    THREE,
    o.seg ?? 56,
    16,
    (u, v, out) => {
      const th = u * Math.PI * 2 + Math.PI / 2;
      ringPoint(ring, th, c);
      // outward direction in the ring plane
      q.set(c.x, 0, c.z - ring.z).normalize();
      const a = v * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // rounded rectangle (superellipse) cross-section
      const r = thick * spow(ca, 0.45);
      const h = (height / 2) * spow(sa, 0.45);
      out.set(c.x + q.x * r, h, c.z + q.z * r);
    },
    {
      wrapU: true,
      wrapV: true,
      center: (u, _v, out) => {
        ringPoint(ring, u * Math.PI * 2 + Math.PI / 2, out);
        out.y = 0;
      },
    }
  );
}

/**
 * Sweep a flattened, tapered tube along a curve — hair clumps, brows, straps.
 * `side(t)` gives [half-width, half-thickness]; `up(p)` gives the direction the thickness points to
 * (for hair: away from the head centre). Width lies across the surface, thickness away from it.
 */
export function sweep(
  THREE: Three,
  pts: T.Vector3[],
  side: (t: number) => [number, number],
  up: (p: T.Vector3, out: T.Vector3) => void,
  o: { rows?: number; seg?: number; ridge?: number } = {}
) {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const rows = o.rows ?? 24;
  const C: T.Vector3[] = [];
  const Tn: T.Vector3[] = [];
  const N: T.Vector3[] = [];
  const B: T.Vector3[] = [];
  const nn = new THREE.Vector3();
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const c = curve.getPointAt(t);
    const tg = curve.getTangentAt(t).normalize();
    up(c, nn);
    const n = nn.clone().addScaledVector(tg, -nn.dot(tg));
    if (n.lengthSq() < 1e-10) n.set(0, 1, 0);
    n.normalize();
    C.push(c);
    Tn.push(tg);
    N.push(n);
    B.push(new THREE.Vector3().crossVectors(tg, n).normalize());
  }
  const ridge = o.ridge ?? 0;
  return gridSurface(
    THREE,
    o.seg ?? 12,
    rows,
    (u, v, out) => {
      const j = Math.round(v * rows);
      const [w, h] = side(v);
      const a = u * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // lens-like cross-section with an optional central ridge (strand clump)
      const hh = h * (1 + ridge * Math.pow(Math.max(0, sa), 3) * (1 - Math.abs(ca)));
      out.copy(C[j]).addScaledVector(B[j], ca * Math.max(w, 1e-4)).addScaledVector(N[j], sa * Math.max(hh, 1e-4));
    },
    {
      wrapU: true,
      center: (_u, v, out) => {
        out.copy(C[Math.round(v * rows)]);
      },
    }
  );
}

/**
 * Patch lying on the head surface (eyes, mouth, blush): an ellipse of w × h (arc length) centred at
 * (az0, pol0), lifted by `lift` and domed by `bulge`. UV covers the ellipse's bounding box.
 */
export function headPatch(
  THREE: Three,
  hs: ReturnType<typeof makeHeadSurface>,
  az0: number,
  pol0: number,
  w: number,
  h: number,
  o: { lift?: number; bulge?: number; rings?: number; seg?: number; rect?: boolean; tilt?: number } = {}
) {
  const rings = o.rings ?? 10;
  const seg = o.seg ?? 48;
  const lift = o.lift ?? 0.002;
  const bulge = o.bulge ?? 0;
  const ct = Math.cos(o.tilt ?? 0);
  const st = Math.sin(o.tilt ?? 0);
  const place = (a: number, b: number, rr: number, out: T.Vector3) => {
    const x = a * ct - b * st;
    const y = a * st + b * ct;
    const pol = pol0 - (y * h) / 2 / HEAD_R;
    const az = az0 + (x * w) / 2 / (HEAD_R * Math.max(0.3, Math.sin(pol)));
    const f = hs.frame(az, pol, lift + bulge * Math.max(0, 1 - rr * rr));
    out.copy(f.p);
  };
  if (o.rect) {
    return gridSurface(THREE, seg, rings, (u, v, out) => place(u * 2 - 1, v * 2 - 1, Math.max(Math.abs(u * 2 - 1), Math.abs(v * 2 - 1)), out), {
      center: (_u, _v, out) => out.set(0, 0, 0),
    });
  }
  // polar grid: v = radius, u = angle; uv remapped to the ellipse's box
  const g = gridSurface(
    THREE,
    seg,
    rings,
    (u, v, out) => {
      const a = u * Math.PI * 2;
      const r = Math.max(1e-3, v);
      place(Math.cos(a) * r, Math.sin(a) * r, r, out);
    },
    { wrapU: true, center: (_u, _v, out) => out.set(0, 0, 0) }
  );
  const uvA = g.getAttribute("uv") as T.BufferAttribute;
  for (let k = 0; k < uvA.count; k++) {
    const u = uvA.getX(k);
    const v = uvA.getY(k);
    const a = u * Math.PI * 2;
    uvA.setXY(k, 0.5 + Math.cos(a) * v * 0.5, 0.5 + Math.sin(a) * v * 0.5);
  }
  return g;
}

// ---- Procedural textures (generated once per page, shared by every model) ----

const texCache = new Map<string, HTMLCanvasElement>();

/** Deterministic hash noise */
const hash = (x: number, y: number, s: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
const vnoise = (x: number, y: number, s: number, wrapX: number, wrapY: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const w = (a: number, m: number) => ((a % m) + m) % m;
  const h00 = hash(w(xi, wrapX), w(yi, wrapY), s);
  const h10 = hash(w(xi + 1, wrapX), w(yi, wrapY), s);
  const h01 = hash(w(xi, wrapX), w(yi + 1, wrapY), s);
  const h11 = hash(w(xi + 1, wrapX), w(yi + 1, wrapY), s);
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  return h00 + (h10 - h00) * sx + (h01 - h00) * sy + (h00 - h10 - h01 + h11) * sx * sy;
};

/** Height field → tangent-space normal map canvas */
function normalCanvas(size: number, height: (x: number, y: number) => number, strength: number): HTMLCanvasElement {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = height(x, y);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => H[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      img.data[k] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[k + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[k + 2] = (1 / l) * 0.5 * 255 + 127.5;
      img.data[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export type DetailKind = "hair" | "weave" | "denim" | "knit" | "leather" | "skin" | "metal" | "fur" | "feather";

function detailCanvas(kind: DetailKind): HTMLCanvasElement {
  const hit = texCache.get(kind);
  if (hit) return hit;
  let cv: HTMLCanvasElement;
  switch (kind) {
    case "hair": {
      // strands run along v (texture y); clumps separated by deeper grooves
      const S = 256;
      cv = normalCanvas(
        S,
        (x, y) => {
          const u = x / S;
          const fine = vnoise(u * 90, y / 60, 1, 90, S / 60) * 0.35 + vnoise(u * 40, y / 120, 2, 40, Math.max(1, S / 120)) * 0.4;
          const clump = Math.pow(Math.abs(Math.sin(u * Math.PI * 12 + vnoise(u * 6, y / 90, 3, 6, 3) * 2.2)), 0.6);
          return fine + clump * 0.9;
        },
        5
      );
      break;
    }
    case "weave": {
      const S = 128;
      cv = normalCanvas(
        S,
        (x, y) => {
          const a = Math.sin((x / S) * Math.PI * 2 * 32) * 0.5 + 0.5;
          const b = Math.sin((y / S) * Math.PI * 2 * 32) * 0.5 + 0.5;
          const over = ((Math.floor((x / S) * 32) + Math.floor((y / S) * 32)) % 2) * 0.3;
          return a * 0.4 + b * 0.4 + over + vnoise(x / 6, y / 6, 4, S / 6, S / 6) * 0.5;
        },
        1.4
      );
      break;
    }
    case "denim": {
      const S = 128;
      cv = normalCanvas(
        S,
        (x, y) => {
          const twill = Math.sin(((x + y) / S) * Math.PI * 2 * 24) * 0.5 + 0.5;
          return twill * 0.8 + vnoise(x / 4, y / 16, 5, S / 4, S / 16) * 0.6;
        },
        2
      );
      break;
    }
    case "knit": {
      const S = 128;
      cv = normalCanvas(
        S,
        (x, y) => {
          // ribbed knit: vertical ribs with little V loops
          const rib = Math.abs(Math.sin((x / S) * Math.PI * 16));
          const loop = Math.abs(Math.sin((y / S) * Math.PI * 24 + Math.abs(Math.sin((x / S) * Math.PI * 16)) * 1.5));
          return rib * 0.9 + loop * 0.4;
        },
        2.2
      );
      break;
    }
    case "leather": {
      const S = 128;
      cv = normalCanvas(S, (x, y) => vnoise(x / 3, y / 3, 6, S / 3, S / 3) * 0.6 + vnoise(x / 9, y / 9, 7, S / 9, S / 9) * 0.6, 1.6);
      break;
    }
    case "skin": {
      const S = 128;
      cv = normalCanvas(S, (x, y) => vnoise(x / 2.5, y / 2.5, 8, S / 2.5, S / 2.5) * 0.25 + vnoise(x / 10, y / 10, 9, S / 10, S / 10) * 0.3, 0.5);
      break;
    }
    case "metal": {
      const S = 128;
      cv = normalCanvas(S, (x, y) => vnoise(x / 1.5, y / 40, 10, S / 1.5, S / 40) * 0.25 + vnoise(x / 20, y / 20, 11, S / 20, S / 20) * 0.2, 0.8);
      break;
    }
    case "fur": {
      const S = 128;
      cv = normalCanvas(S, (x, y) => vnoise(x / 1.6, y / 5, 12, S / 1.6, S / 5) * 0.7 + vnoise(x / 6, y / 12, 13, S / 6, S / 12) * 0.5, 3);
      break;
    }
    case "feather": {
      const S = 256;
      cv = normalCanvas(
        S,
        (x, y) => {
          const u = x / S;
          const barb = Math.abs(Math.sin((u * 2 + (y / S) * 0.6) * Math.PI * 60)) * 0.4;
          const sh = Math.abs(Math.sin(u * Math.PI * 6)) * 0.8;
          return barb + sh;
        },
        2
      );
      break;
    }
  }
  texCache.set(kind, cv);
  return cv;
}

/** Tiling detail normal map (repeat r × r) — a fresh Texture over a shared canvas */
export function detailNormal(THREE: Three, kind: DetailKind, repeat: [number, number] = [4, 4]): T.Texture {
  const t = new THREE.CanvasTexture(detailCanvas(kind));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---- Shader tweaks ----

/**
 * Skin: wrapped, warm-tinted diffuse light — a cheap subsurface-scattering look (light bleeds red at the
 * shadow terminator instead of cutting to grey).
 */
export function applySkinShading(THREE: Three, m: T.MeshPhysicalMaterial, strength = 1) {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
    "reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );",
    `{
      float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 );
      vec3 sss = mix( vec3( dotNL ), vec3( wrapNL * wrapNL ), vec3( 0.55, 0.28, 0.2 ) * ${strength.toFixed(2)} );
      reflectedLight.directDiffuse += sss * directLight.color * diffuseBRDF * ( 1.0 - F );
    }`
  );
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <lights_physical_pars_fragment>", chunk);
  };
  m.customProgramCacheKey = () => `skin-sss-${strength}`;
}

export interface EyeUniforms {
  uLidTop: { value: number };
  uLidTilt: { value: number };
  uLow: { value: number };
  uLowCurve: { value: number };
  uGaze: { value: T.Vector2 };
  uSkin: { value: T.Color };
  uSide: { value: number };
  uSize: { value: T.Vector2 };
  uIrisR: { value: number };
  uGlow: { value: number };
}

/**
 * Stylised eye on a head patch: sclera, a big iris (sampled from `irisTex`, follows the gaze), fixed
 * corneal highlights, and skin-coloured eyelids drawn in the shader — the upper lid with a thick lash
 * line and a little wing; the lower lid rises in an arc for smiling eyes. All animated with uniforms.
 */
export function eyeMaterial(THREE: Three, irisTex: T.Texture, skin: T.Color, side: number, size: [number, number], irisR: number, glow = 0) {
  const m = new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, polygonOffset: true, polygonOffsetFactor: -2 });
  const u: EyeUniforms = {
    uLidTop: { value: 1.05 },
    uLidTilt: { value: 0 },
    uLow: { value: -0.05 },
    uLowCurve: { value: 0 },
    uGaze: { value: new THREE.Vector2() },
    uSkin: { value: skin.clone() },
    uSide: { value: side },
    uSize: { value: new THREE.Vector2(size[0], size[1]) },
    uIrisR: { value: irisR },
    uGlow: { value: glow },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uLidTop; uniform float uLidTilt; uniform float uLow; uniform float uLowCurve;
        uniform vec2 uGaze; uniform vec3 uSkin; uniform float uSide; uniform vec2 uSize; uniform float uIrisR; uniform float uGlow;`
      )
      .replace(
        "#include <map_fragment>",
        `
        vec2 euv = vMapUv;
        float xx = ( euv.x - 0.5 ) * 2.0 * uSide;          // + toward the outer corner
        float aa = fwidth( euv.y ) * 1.5;
        // upper lid edge: arched, tilted (sad/angry), with lash band below it
        float lidTopY = 0.5 + ( uLidTop - 0.5 ) * sqrt( max( 0.0, 1.0 - 0.92 * xx * xx ) ) + uLidTilt * xx;
        float lid = smoothstep( lidTopY - aa, lidTopY + aa, euv.y );
        float lashW = 0.085 + 0.07 * smoothstep( 0.1, 1.0, xx );
        float lash = smoothstep( lidTopY - lashW - aa, lidTopY - lashW + aa, euv.y ) * ( 1.0 - lid );
        // little wing flick at the outer corner
        float wing = smoothstep( 0.62, 0.95, xx ) * smoothstep( lidTopY - 0.16, lidTopY - 0.02, euv.y + 0.12 * ( xx - 0.62 ) ) * ( 1.0 - lid );
        lash = max( lash, wing * step( euv.y, lidTopY + 0.02 ) );
        // lower lid: rises in an arc (happy) — skin below it, a soft lower lash line
        float lowY = uLow + uLowCurve * ( 1.0 - xx * xx ) + ( 0.5 - 0.5 * sqrt( max( 0.0, 1.0 - 0.92 * xx * xx ) ) ) * step( 0.0, uLow ) * 0.0;
        float lowLid = 1.0 - smoothstep( lowY - aa, lowY + aa, euv.y );
        float lowLash = ( 1.0 - smoothstep( lowY, lowY + 0.05, euv.y ) ) * ( 1.0 - lowLid ) * step( 0.0, uLow );
        float eyeLid = max( lid, lowLid );
        // iris (in world units so it stays round)
        vec2 ec = vec2( 0.5 + uGaze.x * 0.14, 0.47 + uGaze.y * 0.1 );
        vec2 d = ( euv - ec ) * uSize / uIrisR;
        float ir = length( d );
        float irisA = 1.0 - smoothstep( 0.97, 1.03, ir );
        vec4 irisC = texture2D( map, d * 0.5 + 0.5 );
        // sclera: soft blue-grey shading toward the lid (lid shadow) and the edges (eyeball curvature)
        vec2 eo = ( euv - 0.5 ) * 2.0;
        float eEdge = smoothstep( 0.55, 1.0, length( eo ) );
        vec3 sclera = mix( vec3( 0.97, 0.97, 0.985 ), vec3( 0.62, 0.55, 0.56 ), 0.45 * eEdge );
        float lidShadow = smoothstep( lidTopY - 0.38, lidTopY - 0.02, euv.y );
        vec3 eye = mix( sclera, irisC.rgb, irisA );
        eye *= 1.0 - 0.45 * lidShadow;
        eye = mix( eye, vec3( 0.07, 0.045, 0.04 ), lash );
        eye = mix( eye, uSkin * 0.62, lowLash * 0.6 );
        vec3 col = mix( eye, uSkin, eyeLid );
        // corneal highlights (fixed: they reflect the key light, upper-left)
        vec2 hp = ( euv - vec2( 0.5, 0.5 ) ) * uSize;
        float h1 = 1.0 - smoothstep( 0.8, 1.0, length( ( hp - vec2( -0.034, 0.03 ) ) / vec2( 0.03, 0.024 ) ) );
        float h2 = 1.0 - smoothstep( 0.7, 1.0, length( ( hp - vec2( 0.034, -0.042 ) ) / vec2( 0.013, 0.011 ) ) );
        float hl = max( h1, h2 * 0.9 ) * ( 1.0 - eyeLid ) * ( 1.0 - lash );
        col = mix( col, vec3( 1.0 ), hl );
        diffuseColor.rgb = col;
        `
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
        material.roughness = mix( material.roughness, 0.5, eyeLid );
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1.0 - eyeLid;
        #endif`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3( hl ) * 0.9 + irisC.rgb * irisA * ( 1.0 - eyeLid ) * uGlow;`
      );
  };
  m.customProgramCacheKey = () => "chibi-eye-v1";
  return { material: m, uniforms: u };
}

// ---- Draw-call reduction ----

/** Merge geometries (position / normal / uv) with their local matrices into one indexed geometry */
function mergeParts(THREE: Three, parts: { g: T.BufferGeometry; m: T.Matrix4 }[]): T.BufferGeometry {
  let vc = 0;
  let ic = 0;
  for (const { g } of parts) {
    const n = g.getAttribute("position").count;
    vc += n;
    ic += g.index ? g.index.count : n;
  }
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const uv = new Float32Array(vc * 2);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let vo = 0;
  let io = 0;
  for (const { g, m } of parts) {
    const P = g.getAttribute("position") as T.BufferAttribute;
    const N = g.getAttribute("normal") as T.BufferAttribute | undefined;
    const U = g.getAttribute("uv") as T.BufferAttribute | undefined;
    nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos.set([v.x, v.y, v.z], (vo + i) * 3);
      if (N) {
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        nor.set([v.x, v.y, v.z], (vo + i) * 3);
      }
      if (U) uv.set([U.getX(i), U.getY(i)], (vo + i) * 2);
    }
    const flip = m.determinant() < 0;
    const count = g.index ? g.index.count : P.count;
    for (let t = 0; t < count; t += 3) {
      const a = g.index ? g.index.getX(t) : t;
      const b = g.index ? g.index.getX(t + 1) : t + 1;
      const c = g.index ? g.index.getX(t + 2) : t + 2;
      idx[io++] = vo + a;
      idx[io++] = vo + (flip ? c : b);
      idx[io++] = vo + (flip ? b : c);
    }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/**
 * Within every group, meshes that share a material and never move on their own are merged into one
 * mesh — the character drops from ~100–200 draw calls to a few dozen (much faster sprite baking).
 * `keep`: objects animated individually (spinning gems, flickering flames) — left as they are.
 * Returns the new geometries (the caller disposes them with the model).
 */
export function mergeStatic(THREE: Three, root: T.Object3D, keep: Set<T.Object3D>): T.BufferGeometry[] {
  const made: T.BufferGeometry[] = [];
  const parents: T.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const parent of parents) {
    if (keep.has(parent)) continue;
    const buckets = new Map<string, T.Mesh[]>();
    for (const c of [...parent.children]) {
      const mesh = c as T.Mesh;
      if (!mesh.isMesh || mesh.children.length > 0 || keep.has(mesh) || Array.isArray(mesh.material)) continue;
      const mat = mesh.material as T.Material;
      const key = `${mat.uuid}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}|${mesh.visible ? 1 : 0}`;
      const list = buckets.get(key) ?? [];
      list.push(mesh);
      buckets.set(key, list);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      for (const m of list) m.updateMatrix();
      const g = mergeParts(
        THREE,
        list.map((m) => ({ g: m.geometry, m: m.matrix }))
      );
      made.push(g);
      const merged = new THREE.Mesh(g, list[0].material);
      merged.castShadow = list[0].castShadow;
      merged.receiveShadow = list[0].receiveShadow;
      merged.renderOrder = list[0].renderOrder;
      merged.visible = list[0].visible;
      parent.add(merged);
      for (const m of list) parent.remove(m);
    }
  }
  return made;
}
