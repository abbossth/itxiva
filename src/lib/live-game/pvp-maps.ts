// "Kiber jang" xaritalari. Har jang oldidan o'quvchilar ovoz berib tanlaydi.
// Sof ma'lumot: server, real vaqt xonasi (Cloudflare) va brauzer bir xil xaritani ishlatadi.
// Xaritalar adolatli bo'lishi uchun to'rt chorakka simmetrik (bitta chorak chiziladi, qolgani aks ettiriladi).

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface MapPoint {
  x: number;
  y: number;
}

export type MapId = "neon" | "ice" | "forest" | "space";
export const MAP_IDS: MapId[] = ["neon", "ice", "forest", "space"];

export interface MapTheme {
  floor: string;
  grid: string;
  /** "r,g,b" — chegara va markaz nuri */
  edge: string;
  wall: string;
  wallEdge: string;
  box: string;
  boxEdge: string;
  bush: [string, string, string];
  /** Tezlik yo'lagi rangi ("r,g,b") */
  pad: string;
  /** Bazalar (burchaklar) rangi ("r,g,b") */
  bases: [string, string, string, string];
  /** Fonda yulduzlar */
  stars?: boolean;
}

export interface ArenaMap {
  id: MapId;
  name: string;
  emoji: string;
  tagline: string;
  w: number;
  h: number;
  theme: MapTheme;
  /** Devorlar va qutilar (o'q o'tmaydi). Kvadratlari — qutilar */
  walls: MapRect[];
  /** Butalar: ichidagi o'yinchi deyarli ko'rinmaydi */
  bushes: MapRect[];
  teleports: { a: MapPoint; b: MapPoint; color: string }[];
  /** Tezlik yo'laklari: ustidan yurganda tezroq */
  pads: MapRect[];
  spawns: MapPoint[];
  pickups: MapPoint[];
  /** Jamoa bazalari (4 burchak) */
  bases: MapPoint[];
}

/** Bitta chorakdagi to'rtburchaklarni to'rt chorakka aks ettirish (takrorlarsiz) */
function mirror(rects: MapRect[], w: number, h: number): MapRect[] {
  const out: MapRect[] = [];
  const seen = new Set<string>();
  for (const r of rects) {
    for (const m of [
      { x: r.x, y: r.y },
      { x: w - r.x - r.w, y: r.y },
      { x: r.x, y: h - r.y - r.h },
      { x: w - r.x - r.w, y: h - r.y - r.h },
    ]) {
      const k = `${m.x}:${m.y}:${r.w}:${r.h}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ x: m.x, y: m.y, w: r.w, h: r.h });
    }
  }
  return out;
}

const inside = (p: MapPoint, r: MapRect, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const clear = (walls: MapRect[], pad: number) => (p: MapPoint) => !walls.some((r) => inside(p, r, pad));

/** Paydo bo'lish joylari: avval burchaklar, keyin chetlar va o'rta — bir-biridan uzoq */
function spawnsFor(w: number, h: number, walls: MapRect[]): MapPoint[] {
  const pts: MapPoint[] = [
    { x: 150, y: 150 },
    { x: w - 150, y: h - 150 },
    { x: w - 150, y: 150 },
    { x: 150, y: h - 150 },
    { x: w / 2, y: h * 0.3 },
    { x: w / 2, y: h * 0.7 },
    { x: w * 0.29, y: 150 },
    { x: w * 0.71, y: h - 150 },
    { x: w * 0.71, y: 150 },
    { x: w * 0.29, y: h - 150 },
    { x: 150, y: h * 0.33 },
    { x: w - 150, y: h * 0.67 },
    { x: w - 150, y: h * 0.33 },
    { x: 150, y: h * 0.67 },
    { x: w * 0.36, y: h / 2 },
    { x: w * 0.64, y: h / 2 },
  ].map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  // Devor ustiga tushganlari biroz siljitiladi
  return pts.map((p) => {
    for (const d of [0, 60, 120, 180]) {
      for (const q of [p, { x: p.x + d, y: p.y }, { x: p.x - d, y: p.y }, { x: p.x, y: p.y + d }, { x: p.x, y: p.y - d }]) {
        if (clear(walls, 34)(q)) return q;
      }
    }
    return p;
  });
}

/** Sovg'a joylari: birinchi uchtasi — boshlang'ich sovg'alar (markaz va ikki yon) */
function pickupsFor(w: number, h: number, walls: MapRect[]): MapPoint[] {
  const cx = w / 2;
  const cy = h / 2;
  const raw: MapPoint[] = [
    { x: cx, y: cy },
    { x: w * 0.25, y: cy },
    { x: w * 0.75, y: cy },
    { x: cx, y: h * 0.33 },
    { x: cx, y: h * 0.67 },
    { x: w * 0.16, y: h * 0.26 },
    { x: w * 0.84, y: h * 0.26 },
    { x: w * 0.16, y: h * 0.74 },
    { x: w * 0.84, y: h * 0.74 },
    { x: w * 0.38, y: h * 0.72 },
    { x: w * 0.62, y: h * 0.28 },
  ];
  return raw.map((p) => {
    const q = { x: Math.round(p.x), y: Math.round(p.y) };
    if (clear(walls, 40)(q)) return q;
    // Markazda quti bo'lsa — yoniga
    for (const d of [90, 140, 200]) for (const c of [{ x: q.x, y: q.y - d }, { x: q.x - d, y: q.y }, { x: q.x, y: q.y + d }]) if (clear(walls, 40)(c)) return c;
    return q;
  });
}

const basesFor = (w: number, h: number): MapPoint[] => [
  { x: 170, y: 170 },
  { x: w - 170, y: h - 170 },
  { x: w - 170, y: 170 },
  { x: 170, y: h - 170 },
];

function build(m: Omit<ArenaMap, "spawns" | "pickups" | "bases"> & Partial<Pick<ArenaMap, "spawns" | "pickups" | "bases">>): ArenaMap {
  return {
    ...m,
    spawns: m.spawns ?? spawnsFor(m.w, m.h, m.walls),
    pickups: m.pickups ?? pickupsFor(m.w, m.h, m.walls),
    bases: m.bases ?? basesFor(m.w, m.h),
  };
}

// ---- 1. Neon shahar (klassik, kattalashtirilgan) ----
const K = 1.25;
const sc = (r: MapRect): MapRect => ({ x: Math.round(r.x * K), y: Math.round(r.y * K), w: Math.round(r.w * K), h: Math.round(r.h * K) });
const sp = (p: MapPoint): MapPoint => ({ x: Math.round(p.x * K), y: Math.round(p.y * K) });
const NEON_WALLS: MapRect[] = [
  { x: 1080, y: 560, w: 80, h: 40 },
  { x: 1240, y: 560, w: 80, h: 40 },
  { x: 1080, y: 800, w: 80, h: 40 },
  { x: 1240, y: 800, w: 80, h: 40 },
  { x: 1000, y: 600, w: 40, h: 60 },
  { x: 1000, y: 740, w: 40, h: 60 },
  { x: 1360, y: 600, w: 40, h: 60 },
  { x: 1360, y: 740, w: 40, h: 60 },
  { x: 240, y: 240, w: 260, h: 36 },
  { x: 240, y: 276, w: 36, h: 180 },
  { x: 1900, y: 240, w: 260, h: 36 },
  { x: 2124, y: 276, w: 36, h: 180 },
  { x: 240, y: 1124, w: 260, h: 36 },
  { x: 240, y: 944, w: 36, h: 180 },
  { x: 1900, y: 1124, w: 260, h: 36 },
  { x: 2124, y: 944, w: 36, h: 180 },
  { x: 700, y: 640, w: 80, h: 80 },
  { x: 1620, y: 640, w: 80, h: 80 },
  { x: 1160, y: 300, w: 80, h: 80 },
  { x: 1160, y: 1020, w: 80, h: 80 },
  { x: 560, y: 420, w: 70, h: 70 },
  { x: 1770, y: 910, w: 70, h: 70 },
  { x: 560, y: 910, w: 70, h: 70 },
  { x: 1770, y: 420, w: 70, h: 70 },
].map(sc);

const NEON = build({
  id: "neon",
  name: "Neon shahar",
  emoji: "🌆",
  tagline: "Markaziy yadro, teleportlar, butalar",
  w: 3000,
  h: 1750,
  theme: {
    floor: "#0b1226",
    grid: "rgba(99,102,241,0.10)",
    edge: "192,132,252",
    wall: "#121a33",
    wallEdge: "56,189,248",
    box: "#1b2440",
    boxEdge: "251,191,36",
    bush: ["rgba(34,197,94,0.92)", "rgba(22,163,74,0.92)", "rgba(21,128,61,0.94)"],
    pad: "56,189,248",
    bases: ["34,211,238", "245,158,11", "244,114,182", "163,230,53"],
  },
  walls: NEON_WALLS,
  bushes: [
    { x: 820, y: 220, w: 200, h: 120 },
    { x: 1380, y: 1060, w: 200, h: 120 },
    { x: 120, y: 620, w: 140, h: 160 },
    { x: 2140, y: 620, w: 140, h: 160 },
  ].map(sc),
  teleports: [
    { a: sp({ x: 420, y: 700 }), b: sp({ x: 1980, y: 700 }), color: "#22d3ee" },
    { a: sp({ x: 1200, y: 160 }), b: sp({ x: 1200, y: 1240 }), color: "#e879f9" },
  ],
  pads: [],
});

// ---- 2. Muz labirint: tor yo'laklar va tezlik yo'laklari ----
const ICE_W = 3200;
const ICE_H = 1800;
const ICE = build({
  id: "ice",
  name: "Muz labirint",
  emoji: "🧊",
  tagline: "Tor yo'laklar, muz yo'lakda sirpanib tez yurasiz",
  w: ICE_W,
  h: ICE_H,
  theme: {
    floor: "#0a1a2a",
    grid: "rgba(125,211,252,0.10)",
    edge: "125,211,252",
    wall: "#12324a",
    wallEdge: "186,230,253",
    box: "#1e3a5f",
    boxEdge: "224,242,254",
    bush: ["rgba(45,212,191,0.9)", "rgba(20,184,166,0.9)", "rgba(15,118,110,0.92)"],
    pad: "125,211,252",
    bases: ["56,189,248", "167,139,250", "45,212,191", "224,242,254"],
  },
  walls: [
    ...mirror(
      [
        { x: 360, y: 300, w: 520, h: 36 },
        { x: 360, y: 336, w: 36, h: 260 },
        { x: 960, y: 560, w: 36, h: 300 },
        { x: 1140, y: 180, w: 36, h: 320 },
        { x: 560, y: 720, w: 300, h: 36 },
        { x: 1300, y: 440, w: 260, h: 36 },
        { x: 210, y: 700, w: 70, h: 70 },
        { x: 1360, y: 690, w: 80, h: 80 },
      ],
      ICE_W,
      ICE_H
    ),
    { x: 1560, y: 860, w: 80, h: 80 },
  ],
  bushes: mirror([{ x: 120, y: 400, w: 150, h: 150 }], ICE_W, ICE_H),
  teleports: [{ a: { x: 260, y: 900 }, b: { x: ICE_W - 260, y: 900 }, color: "#38bdf8" }],
  pads: [
    { x: 420, y: 860, w: 440, h: 80 },
    { x: ICE_W - 860, y: 860, w: 440, h: 80 },
    { x: 1560, y: 220, w: 80, h: 420 },
    { x: 1560, y: ICE_H - 640, w: 80, h: 420 },
  ],
});

// ---- 3. Sehrli o'rmon: ko'p buta — yashirinib hujum qilish ----
const FOR_W = 3000;
const FOR_H = 1800;
const FOREST = build({
  id: "forest",
  name: "Sehrli o'rmon",
  emoji: "🌲",
  tagline: "Butalar ko'p — yashirinib, kutib turib hujum qiling",
  w: FOR_W,
  h: FOR_H,
  theme: {
    floor: "#0c1a10",
    grid: "rgba(74,222,128,0.06)",
    edge: "132,204,22",
    wall: "#3f2d1d",
    wallEdge: "180,83,9",
    box: "#4a3420",
    boxEdge: "217,119,6",
    bush: ["rgba(22,163,74,0.95)", "rgba(21,128,61,0.95)", "rgba(20,83,45,0.96)"],
    pad: "132,204,22",
    bases: ["163,230,53", "250,204,21", "74,222,128", "251,146,60"],
  },
  walls: [
    ...mirror(
      [
        { x: 620, y: 300, w: 60, h: 60 },
        { x: 1000, y: 430, w: 60, h: 60 },
        { x: 480, y: 760, w: 60, h: 60 },
        { x: 1120, y: 780, w: 60, h: 60 },
        { x: 860, y: 120, w: 36, h: 220 },
        { x: 260, y: 520, w: 200, h: 36 },
      ],
      FOR_W,
      FOR_H
    ),
    { x: 1440, y: 840, w: 120, h: 120 },
  ],
  bushes: [
    ...mirror(
      [
        { x: 300, y: 230, w: 260, h: 160 },
        { x: 720, y: 470, w: 220, h: 220 },
        { x: 1130, y: 190, w: 220, h: 160 },
        { x: 190, y: 640, w: 200, h: 200 },
        { x: 1220, y: 560, w: 200, h: 140 },
      ],
      FOR_W,
      FOR_H
    ),
  ],
  teleports: [{ a: { x: 150, y: 900 }, b: { x: FOR_W - 150, y: 900 }, color: "#a3e635" }],
  pads: [],
});

// ---- 4. Kosmik stansiya: xonalar va ko'p teleport ----
const SP_W = 3200;
const SP_H = 1800;
const SPACE = build({
  id: "space",
  name: "Kosmik stansiya",
  emoji: "🛸",
  tagline: "Xonalar va 3 juft teleport — kutilmagan joydan chiqing",
  w: SP_W,
  h: SP_H,
  theme: {
    floor: "#07051a",
    grid: "rgba(167,139,250,0.08)",
    edge: "232,121,249",
    wall: "#1e1b4b",
    wallEdge: "167,139,250",
    box: "#2e1065",
    boxEdge: "244,114,182",
    bush: ["rgba(147,51,234,0.85)", "rgba(126,34,206,0.88)", "rgba(88,28,135,0.9)"],
    pad: "250,204,21",
    bases: ["232,121,249", "250,204,21", "56,189,248", "244,114,182"],
    stars: true,
  },
  walls: [
    ...mirror(
      [
        { x: 300, y: 260, w: 420, h: 30 },
        { x: 300, y: 290, w: 30, h: 200 },
        { x: 690, y: 290, w: 30, h: 110 },
        { x: 300, y: 600, w: 220, h: 30 },
        { x: 1000, y: 150, w: 30, h: 300 },
        { x: 1000, y: 600, w: 300, h: 30 },
        { x: 1200, y: 350, w: 70, h: 70 },
        { x: 640, y: 740, w: 70, h: 70 },
      ],
      SP_W,
      SP_H
    ),
    { x: 1550, y: 850, w: 100, h: 100 },
  ],
  bushes: mirror([{ x: 120, y: 760, w: 140, h: 140 }], SP_W, SP_H),
  teleports: [
    { a: { x: 520, y: 400 }, b: { x: SP_W - 520, y: SP_H - 400 }, color: "#e879f9" },
    { a: { x: SP_W - 520, y: 400 }, b: { x: 520, y: SP_H - 400 }, color: "#22d3ee" },
    { a: { x: SP_W / 2, y: 160 }, b: { x: SP_W / 2, y: SP_H - 160 }, color: "#facc15" },
  ],
  pads: [
    { x: 760, y: 860, w: 480, h: 80 },
    { x: SP_W - 1240, y: 860, w: 480, h: 80 },
  ],
});

export const ARENA_MAPS: Record<MapId, ArenaMap> = { neon: NEON, ice: ICE, forest: FOREST, space: SPACE };
export const DEFAULT_MAP: ArenaMap = NEON;
export const isMapId = (v: unknown): v is MapId => typeof v === "string" && (MAP_IDS as string[]).includes(v);
export const mapOf = (id: string | null | undefined): ArenaMap => (isMapId(id) ? ARENA_MAPS[id] : DEFAULT_MAP);
/** Ovozlar natijasi: eng ko'p ovoz olgan xarita; teng bo'lsa (yoki ovoz yo'q) — ular orasidan tasodifiy */
export function pickMap(votes: (string | null | undefined)[], rng: () => number = Math.random): MapId {
  const count = new Map<MapId, number>(MAP_IDS.map((id) => [id, 0]));
  for (const v of votes) if (isMapId(v)) count.set(v, (count.get(v) ?? 0) + 1);
  const best = Math.max(...count.values());
  const top = MAP_IDS.filter((id) => count.get(id) === best);
  return top[Math.min(top.length - 1, Math.floor(rng() * top.length))];
}

/** Tezlik yo'lagidagi tezlik koeffitsienti */
export const PAD_BOOST = 1.55;
