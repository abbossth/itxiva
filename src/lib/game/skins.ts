// Data-driven skins for the character rig. A skin is data (palette + parts + effects), never a code fork:
// the same SVG/canvas rig renders every skin. Ownership and buying stay in the existing character catalog
// (lib/character/catalog.ts adds these as costume items), so no backend/DB change is needed.
//
// Rarity visual language:
//   common    = recolor
//   rare      = recolor + accessory
//   epic      = accessory + idle particles
//   legendary = unique accessory + aura + custom celebrate animation

import type { CharItem } from "@/lib/character/catalog";
import { theme, type Rarity } from "./theme";

export type { Rarity } from "./theme";

export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "Oddiy",
  rare: "Noyob",
  epic: "Epik",
  legendary: "Afsonaviy",
};

export type SkinHat = "doppi" | "chugirma" | "guard";
export type SkinEmblem = "ten" | "stripes" | "tile" | "sash";

export interface Skin {
  id: string;
  /** Uzbek name shown in the shop */
  name: string;
  rarity: Rarity;
  /** ITXiva coins */
  price: number;
  /** Level at which it can be bought */
  level: number;
  palette: Partial<{
    body: string;
    bodyShadow: string;
    limbs: string;
    hair: string;
    eyes: string;
    trim: string;
    cape: string;
    hat: string;
    hatTrim: string;
    accent: string;
  }>;
  parts?: Partial<{ head: SkinHat; back: "cape"; hand: "dutor"; face: string; aura: "gold" | "turquoise"; emblem: SkinEmblem }>;
  effects?: { trail?: string; idleParticles?: string; celebrate?: "cheer" | "flex" };
}

/** Example skins — one per rarity, with local (Khorezm) flavor. Original designs, no copyrighted characters or logos. */
export const SKINS: Skin[] = [
  {
    id: "footballer",
    name: "Futbolchi",
    rarity: "common",
    price: 40,
    level: 1,
    palette: { body: "#16A34A", trim: "#F8FAFC", limbs: "#F8FAFC", accent: "#14532D" },
    parts: { emblem: "ten" },
  },
  {
    id: "dutor",
    name: "Dutor ustasi",
    rarity: "rare",
    price: 80,
    level: 2,
    palette: { body: "#9F1239", trim: "#FBBF24", limbs: "#1E293B", hat: "#111827", hatTrim: "#F8FAFC", accent: "#0EA5E9" },
    parts: { head: "doppi", hand: "dutor", emblem: "stripes" },
  },
  {
    id: "guard",
    name: "Ichan qal'a qo'riqchisi",
    rarity: "epic",
    price: 130,
    level: 4,
    palette: { body: "#1E3A8A", trim: "#22D3EE", limbs: "#0F172A", cape: "#0891B2", hat: "#94A3B8", hatTrim: "#22D3EE", accent: "#F8FAFC" },
    parts: { head: "guard", back: "cape", emblem: "tile" },
    effects: { idleParticles: "turquoise" },
  },
  {
    id: "palvon",
    name: "Xorazm palvoni",
    rarity: "legendary",
    price: 200,
    level: 5,
    palette: { body: "#DC2626", trim: "#FBBF24", limbs: "#1F2937", hat: "#F5F5F4", hatTrim: "#D6D3D1", accent: "#15803D" },
    parts: { head: "chugirma", emblem: "sash", aura: "gold" },
    effects: { idleParticles: "gold", celebrate: "flex", trail: "gold" },
  },
];

const BY_ID = new Map(SKINS.map((s) => [s.id, s]));

export const skinById = (id: string | null | undefined): Skin | undefined => (id ? BY_ID.get(id) : undefined);

/**
 * Rarity of any character item. Example skins carry their own; other items are graded by price
 * (costumes are priced on a different scale than single parts).
 */
export function rarityOf(it: Pick<CharItem, "slot" | "id" | "price">): Rarity {
  if (it.slot === "costume") {
    const s = BY_ID.get(it.id);
    if (s) return s.rarity;
    return it.price >= 160 ? "legendary" : it.price >= 110 ? "epic" : it.price >= 70 ? "rare" : "common";
  }
  return it.price >= 22 ? "legendary" : it.price >= 12 ? "epic" : it.price >= 5 ? "rare" : "common";
}

export const rarityColor = (r: Rarity) => theme.rarity[r];

/** Effects for the rig (aura color, idle particles, celebration style) of the equipped costume */
export function skinFx(costume: string | null | undefined): { aura: string | null; particles: string | null; celebrate: "cheer" | "flex"; trail: string | null } {
  const s = skinById(costume);
  const pick = (k: string | undefined) => (k === "gold" ? theme.palette.accent : k === "turquoise" ? theme.palette.turquoise : null);
  return {
    aura: s?.parts?.aura ? pick(s.parts.aura) : null,
    particles: s?.effects?.idleParticles ? (s.effects.idleParticles === "gold" ? theme.palette.accentLight : theme.palette.turquoiseLight) : null,
    celebrate: s?.effects?.celebrate ?? "cheer",
    trail: s?.effects?.trail ? pick(s.effects.trail) : null,
  };
}
