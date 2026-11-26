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

export type MapId = "neon" | "ice" | "forest" | "space" | "lava" | "desert" | "reef" | "factory";
export const MAP_IDS: MapId[] = ["neon", "ice", "forest", "space", "lava", "desert", "reef", "factory"];

/** Xarita to'plamlari: o'quvchi avval to'plamni, keyin uning ichidagi xaritani tanlaydi */
export interface MapPack {
  id: "classic" | "wild";
  name: string;
  emoji: string;
  tagline: string;
  maps: MapId[];
}
export const MAP_PACKS: MapPack[] = [
  { id: "classic", name: "Klassik olamlar", emoji: "🌐", tagline: "Neon shahar, muz labirint, sehrli o'rmon, kosmos", maps: ["neon", "ice", "forest", "space"] },
  { id: "wild", name: "Yovvoyi dunyolar", emoji: "🌋", tagline: "Vulqon, cho'l qal'asi, marjon rif, robot zavodi", maps: ["lava", "desert", "reef", "factory"] },
];
export const packOf = (id: MapId): MapPack => MAP_PACKS.find((p) => p.maps.includes(id)) ?? MAP_PACKS[0];

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
  /** Pol naqshi (bo'lmasa — oddiy katak) */
  pattern?: "lava" | "sand" | "waves" | "hex";
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

// ================= "Yovvoyi dunyolar" to'plami =================

// ---- 5. Vulqon oroli: markazda krater, pog'onali qoyalar, lava oqimlari (tezlik) ----
const LV_W = 3000;
const LV_H = 1750;
const LAVA = build({
  id: "lava",
  name: "Vulqon oroli",
  emoji: "🌋",
  tagline: "Krater atrofida jang, lava oqimida tez yuguring",
  w: LV_W,
  h: LV_H,
  theme: {
    floor: "#1a0b08",
    grid: "rgba(248,113,113,0.05)",
    edge: "251,146,60",
    wall: "#2b1511",
    wallEdge: "249,115,22",
    box: "#3d1c13",
    boxEdge: "250,204,21",
    bush: ["rgba(120,53,15,0.92)", "rgba(146,64,14,0.92)", "rgba(68,32,14,0.95)"],
    pad: "251,146,60",
    bases: ["251,146,60", "250,204,21", "248,113,113", "253,186,116"],
    pattern: "lava",
  },
  walls: [
    ...mirror(
      [
        { x: 420, y: 300, w: 160, h: 36 },
        { x: 580, y: 336, w: 36, h: 120 },
        { x: 616, y: 420, w: 160, h: 36 },
        { x: 900, y: 190, w: 70, h: 70 },
        { x: 985, y: 260, w: 70, h: 70 },
        { x: 1250, y: 560, w: 140, h: 36 },
        { x: 1140, y: 640, w: 36, h: 130 },
        { x: 250, y: 680, w: 220, h: 36 },
      ],
      LV_W,
      LV_H
    ),
    { x: LV_W / 2 - 45, y: LV_H / 2 - 45, w: 90, h: 90 },
  ],
  bushes: mirror(
    [
      { x: 150, y: 400, w: 160, h: 150 },
      { x: 1080, y: 130, w: 190, h: 110 },
    ],
    LV_W,
    LV_H
  ),
  teleports: [{ a: { x: 300, y: LV_H / 2 }, b: { x: LV_W - 300, y: LV_H / 2 }, color: "#fb923c" }],
  pads: [
    { x: 700, y: LV_H / 2 - 20, w: 400, h: 40 },
    { x: LV_W - 1100, y: LV_H / 2 - 20, w: 400, h: 40 },
    { x: LV_W / 2 - 20, y: 150, w: 40, h: 320 },
    { x: LV_W / 2 - 20, y: LV_H - 470, w: 40, h: 320 },
  ],
});

// ---- 6. Cho'l qal'asi: markazda 4 darvozali qal'a, tashqarida qum tepaliklari ----
const DS_W = 3200;
const DS_H = 1800;
const DESERT = build({
  id: "desert",
  name: "Cho'l qal'asi",
  emoji: "🏜️",
  tagline: "Qal'ani egallang — 4 darvoza, ochiq qumliklar",
  w: DS_W,
  h: DS_H,
  theme: {
    floor: "#2a1f12",
    grid: "rgba(253,230,138,0.04)",
    edge: "251,191,36",
    wall: "#5b4326",
    wallEdge: "253,224,71",
    box: "#6b4f2c",
    boxEdge: "254,240,138",
    bush: ["rgba(161,98,7,0.85)", "rgba(202,138,4,0.85)", "rgba(133,77,14,0.9)"],
    pad: "253,224,71",
    bases: ["251,191,36", "234,88,12", "250,204,21", "217,119,6"],
    pattern: "sand",
  },
  walls: [
    ...mirror(
      [
        // Qal'a devorlari (o'rtada darvoza qoladi)
        { x: 1100, y: 500, w: 380, h: 36 },
        { x: 1100, y: 536, w: 36, h: 240 },
        // Qal'a ichidagi ustunlar
        { x: 1340, y: 690, w: 70, h: 70 },
        // Tashqi qoyalar
        { x: 560, y: 400, w: 80, h: 80 },
        { x: 860, y: 190, w: 70, h: 70 },
        { x: 320, y: 620, w: 200, h: 36 },
      ],
      DS_W,
      DS_H
    ),
  ],
  bushes: mirror(
    [
      { x: 300, y: 230, w: 240, h: 140 },
      { x: 690, y: 640, w: 200, h: 160 },
    ],
    DS_W,
    DS_H
  ),
  teleports: [{ a: { x: DS_W / 2, y: 180 }, b: { x: DS_W / 2, y: DS_H - 180 }, color: "#facc15" }],
  pads: [
    { x: 200, y: DS_H / 2 - 40, w: 700, h: 80 },
    { x: DS_W - 900, y: DS_H / 2 - 40, w: 700, h: 80 },
  ],
});

// ---- 7. Marjon rif: marjon butalari ko'p, oqim yo'laklari, kesishgan pufak-teleportlar ----
const RF_W = 3000;
const RF_H = 1800;
const REEF = build({
  id: "reef",
  name: "Marjon rif",
  emoji: "🐠",
  tagline: "Marjonlarda yashiring, oqim bilan suzib keting",
  w: RF_W,
  h: RF_H,
  theme: {
    floor: "#04223a",
    grid: "rgba(56,189,248,0.05)",
    edge: "34,211,238",
    wall: "#0e3a4f",
    wallEdge: "45,212,191",
    box: "#134e5e",
    boxEdge: "251,191,36",
    bush: ["rgba(244,114,182,0.88)", "rgba(251,113,133,0.88)", "rgba(190,24,93,0.9)"],
    pad: "56,189,248",
    bases: ["34,211,238", "244,114,182", "45,212,191", "251,191,36"],
    pattern: "waves",
  },
  walls: [
    ...mirror(
      [
        { x: 500, y: 300, w: 90, h: 90 },
        { x: 1000, y: 520, w: 120, h: 60 },
        { x: 300, y: 650, w: 60, h: 120 },
        { x: 1250, y: 200, w: 36, h: 260 },
      ],
      RF_W,
      RF_H
    ),
    { x: RF_W / 2 - 60, y: RF_H / 2 - 60, w: 120, h: 120 },
  ],
  bushes: mirror(
    [
      { x: 180, y: 250, w: 200, h: 150 },
      { x: 640, y: 500, w: 240, h: 200 },
      { x: 1050, y: 280, w: 160, h: 150 },
      { x: 820, y: 110, w: 180, h: 110 },
      { x: 1180, y: 640, w: 170, h: 150 },
    ],
    RF_W,
    RF_H
  ),
  teleports: [
    { a: { x: 440, y: 470 }, b: { x: RF_W - 440, y: RF_H - 470 }, color: "#22d3ee" },
    { a: { x: RF_W - 440, y: 470 }, b: { x: 440, y: RF_H - 470 }, color: "#f472b6" },
  ],
  pads: [
    { x: 400, y: RF_H / 2 - 30, w: 520, h: 60 },
    { x: RF_W - 920, y: RF_H / 2 - 30, w: 520, h: 60 },
    { x: RF_W / 2 - 30, y: 150, w: 60, h: 380 },
    { x: RF_W / 2 - 30, y: RF_H - 530, w: 60, h: 380 },
  ],
});

// ---- 8. Robot zavodi: yashik qatorlari orasida konveyerlar, liftlar ----
const FC_W = 3200;
const FC_H = 1800;
const FACTORY = build({
  id: "factory",
  name: "Robot zavodi",
  emoji: "🏭",
  tagline: "Yashiklar orasida konveyer — tez, lekin ochiq joy",
  w: FC_W,
  h: FC_H,
  theme: {
    floor: "#111318",
    grid: "rgba(250,204,21,0.04)",
    edge: "250,204,21",
    wall: "#1f2937",
    wallEdge: "250,204,21",
    box: "#374151",
    boxEdge: "251,146,60",
    bush: ["rgba(148,163,184,0.72)", "rgba(100,116,139,0.78)", "rgba(71,85,105,0.85)"],
    pad: "250,204,21",
    bases: ["250,204,21", "56,189,248", "251,146,60", "163,230,53"],
    pattern: "hex",
  },
  walls: [
    ...mirror(
      [
        ...[0, 1, 2, 3].flatMap((i) => [
          { x: 450 + i * 260, y: 330, w: 70, h: 70 },
          { x: 450 + i * 260, y: 620, w: 70, h: 70 },
        ]),
        { x: 300, y: 180, w: 36, h: 220 },
      ],
      FC_W,
      FC_H
    ),
    { x: FC_W / 2 - 80, y: FC_H / 2 - 80, w: 160, h: 160 },
  ],
  bushes: mirror([{ x: 120, y: 520, w: 150, h: 150 }], FC_W, FC_H),
  teleports: [
    { a: { x: 200, y: FC_H / 2 }, b: { x: FC_W - 200, y: FC_H / 2 }, color: "#facc15" },
    { a: { x: FC_W / 2, y: 150 }, b: { x: FC_W / 2, y: FC_H - 150 }, color: "#38bdf8" },
  ],
  pads: [
    ...mirror([{ x: 400, y: 470, w: 900, h: 60 }], FC_W, FC_H),
    { x: FC_W / 2 - 30, y: 220, w: 60, h: 420 },
    { x: FC_W / 2 - 30, y: FC_H - 640, w: 60, h: 420 },
  ],
});

export const ARENA_MAPS: Record<MapId, ArenaMap> = { neon: NEON, ice: ICE, forest: FOREST, space: SPACE, lava: LAVA, desert: DESERT, reef: REEF, factory: FACTORY };
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
