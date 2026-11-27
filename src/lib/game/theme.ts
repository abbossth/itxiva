// Shared ITXiva game design language. Every game reads its colors, outline, shadow and font from here —
// game files must not hard-code colors. Pure module: safe for the browser, the server and tests.

export const theme = {
  /** Dark indigo, never pure black — used for every outline */
  outline: "#1E1B4B",
  /** Outline width relative to character height (~4%) */
  outlineRatio: 0.04,
  outlineWidth: 3,
  palette: {
    primary: "#6366F1",
    primaryDark: "#4338CA",
    primaryLight: "#A5B4FC",
    accent: "#F59E0B",
    accentLight: "#FDE68A",
    success: "#22C55E",
    successLight: "#86EFAC",
    successDark: "#15803D",
    danger: "#EF4444",
    dangerLight: "#FCA5A5",
    warning: "#F97316",
    info: "#0EA5E9",
    turquoise: "#22D3EE",
    turquoiseLight: "#67E8F9",
    white: "#FFFFFF",
    ink: "#0F172A",
    muted: "#94A3B8",
    mutedDark: "#475569",
    skin: ["#FFD7B5", "#F1B98C", "#C68B59", "#8D5524"],
    bg: ["#EEF2FF", "#E0E7FF"],
  },
  /** Player identity colors (index = player color slot from the game state) */
  players: ["#22D3EE", "#F472B6", "#A3E635", "#FBBF24", "#A78BFA", "#FB7185", "#34D399", "#60A5FA", "#F97316", "#E879F9"],
  rarity: {
    common: "#94A3B8",
    rare: "#3B82F6",
    epic: "#A855F7",
    legendary: "#F59E0B",
  },
  shadow: "rgba(30,27,75,0.25)",
  radius: 16,
  font: "'Nunito', 'Inter', system-ui, sans-serif",
  /** Timer: orange from 30% left, red + pulse from 10% */
  timer: { ok: "#22C55E", warn: "#F97316", danger: "#EF4444" },
  /** "Yashil zona" field. Backgrounds stay lower in contrast/saturation than characters so gameplay pops */
  zone: {
    fieldTop: "#16173A",
    fieldMid: "#181B44",
    fieldBottom: "#121433",
    tile: "#A5B4FC",
    tileLight: "#C7D2FE",
    safe: "#4ADE80",
    safeLight: "#BBF7D0",
    safeDark: "#166534",
    full: "#FACC15",
    fullDark: "#A16207",
    lock: "#EF4444",
    mud: "#A855F7",
    mudLight: "#E9D5FF",
    mudDark: "#581C87",
    zap: "#FACC15",
    zapLight: "#FEF9C3",
    padMetal: "#64748B",
    padMetalLight: "#CBD5E1",
    padMetalDark: "#334155",
    star: "#FACC15",
    starLight: "#FEF9C3",
    starDark: "#B45309",
    out: "#64748B",
    label: "#FFFFFF",
    labelMuted: "#CBD5E1",
    labelBad: "#FCA5A5",
    labelGood: "#86EFAC",
  },
  /** "Kiber jang" arena (map floors/walls keep their own palettes in lib/live-game/pvp-maps.ts) */
  arena: {
    void: "#070B18",
    gun: "#334155",
    gunHot: "#FB923C",
    gunLight: "#94A3B8",
    muzzle: "#FDE047",
    myShot: "#FDE047",
    hitSpark: "#FDE047",
    shieldSpark: "#38BDF8",
    wallSpark: "#94A3B8",
    hurt: "#F87171",
    heal: "#4ADE80",
    dashDust: "#E0F2FE",
    dust: "#94A3B8",
    teleportIn: "#E879F9",
    teleportOut: "#22D3EE",
    storm: "#9333EA",
    stormEdge: "#D8B4FE",
    stormGlow: "#C084FC",
    stormArrow: "#F5D0FE",
    shieldGlow: "#FFF7D6",
    shieldRim: ["#FDE68A", "#FFFFFF", "#F0ABFC", "#FBBF24", "#FFFFFF", "#C4B5FD", "#FDE68A"],
    shieldGold: "#FBBF24",
    shieldGoldLight: "#FEF9C3",
    shieldGoldDark: "#B45309",
    shieldGoldEdge: "#78350F",
    hpGood: "#4ADE80",
    hpMid: "#FACC15",
    hpLow: "#F43F5E",
    minimapBg: "#020617",
    minimapEdge: "#C084FC",
    minimapWall: "#38BDF8",
    me: "#FDE047",
    revive: "#4ADE80",
    reviveDark: "#16A34A",
    fire: "#F43F5E",
    visor: "#0B1020",
    eye: "#E0F2FE",
    eyeHurt: "#FECACA",
    antenna: "#F43F5E",
    /** Floor pattern tints */
    lava: "#FB923C",
    lavaCrack: "#F97316",
    sand: "#FDE68A",
    water: "#7DD3FC",
    waterLight: "#A5F3FC",
    hazard: "#FACC15",
  },
} as const;

export type Rarity = keyof typeof theme.rarity;

// ---- Color helpers (results cached: they are called from render loops) ----

const rgbCache = new Map<string, [number, number, number]>();

function rgbOf(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
    const n = parseInt(full, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

const alphaCache = new Map<string, string>();

/** "#RRGGBB" + alpha → "rgba(r,g,b,a)" (alpha rounded to 2 decimals so the cache stays small) */
export function alpha(hex: string, a: number): string {
  const q = Math.round(Math.max(0, Math.min(1, a)) * 100) / 100;
  const key = `${hex}|${q}`;
  let s = alphaCache.get(key);
  if (!s) {
    const [r, g, b] = rgbOf(hex);
    s = `rgba(${r},${g},${b},${q})`;
    alphaCache.set(key, s);
  }
  return s;
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v + m)) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Move hue toward a target hue by up to `amount` degrees along the shortest way */
function hueToward(h: number, target: number, amount: number): number {
  let d = target - h;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return h + Math.sign(d) * Math.min(Math.abs(d), amount);
}

const toneCache = new Map<string, { base: string; shadow: string; light: string }>();

/**
 * 3-tone shading: shadow is darker, a bit more saturated and hue-shifted toward blue/purple;
 * highlight is lighter and hue-shifted toward yellow. Never plain black/white.
 */
export function tone3(hex: string): { base: string; shadow: string; light: string } {
  let t = toneCache.get(hex);
  if (!t) {
    const [h, s, l] = toHsl(rgbOf(hex));
    const grey = s < 0.08;
    t = {
      base: hex,
      shadow: fromHsl(grey ? 245 : hueToward(h, 250, 18), Math.min(1, s * 1.12 + (grey ? 0.12 : 0.04)), Math.max(0, l * 0.68)),
      light: fromHsl(grey ? 50 : hueToward(h, 55, 14), grey ? 0.15 : Math.min(1, s * 0.95), Math.min(0.96, l + (1 - l) * 0.42)),
    };
    toneCache.set(hex, t);
  }
  return t;
}

/** CSS custom properties for DOM parts of a game (HUD, banners). Spread into a wrapper's `style`. */
export function themeCssVars(): Record<string, string> {
  const p = theme.palette;
  return {
    "--g-outline": theme.outline,
    "--g-primary": p.primary,
    "--g-primary-dark": p.primaryDark,
    "--g-primary-light": p.primaryLight,
    "--g-accent": p.accent,
    "--g-accent-light": p.accentLight,
    "--g-success": p.success,
    "--g-success-light": p.successLight,
    "--g-success-dark": p.successDark,
    "--g-danger": p.danger,
    "--g-danger-light": p.dangerLight,
    "--g-warning": p.warning,
    "--g-info": p.info,
    "--g-ink": p.ink,
    "--g-muted": p.muted,
    "--g-panel": alpha(p.white, 0.1),
    "--g-panel-strong": alpha(theme.outline, 0.82),
    "--g-shadow": theme.shadow,
    "--g-radius": `${theme.radius}px`,
    "--g-mud": theme.zone.mud,
    "--g-zap": theme.zone.zap,
  };
}
