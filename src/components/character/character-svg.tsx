"use client";

import { memo, useId } from "react";
import { DEFAULT_LOOK, OUTFIT_COLORS, tierOf, type GameLook } from "@/lib/character/catalog";
import { emoteOf } from "@/lib/character/emotes";
import { cn } from "@/lib/utils";

// O'quvchi personaji (SVG): multfilm uslubida — har qism kontur chiziq, yorug'lik/soya gradienti va yaltirash bilan.
// Yuz: ko'zning oq qismi, rangli qorachiq, ikki yaltirash, kayfiyatga qarab qoshlar; burun, yonoq qizilligi.
// Animatsiyalar CSS da (globals.css → .chr-*). Daraja oshgani sari: supa materiali, 4+ da aura, 7+ da aylanuvchi halqa,
// 10-darajada yulduzlar. "Kuch" upgrade — uchqunlar.

/**
 * Kayfiyat: idle — tinch (nafas oladi, atrofga qaraydi), happy — tinch, lekin xursand yuz,
 * cheer/jump — qisqa quvonch lahzalari uchun, run/fly/work — harakat paytida, sad — xafa.
 */
export type CharMood = "idle" | "happy" | "run" | "jump" | "cheer" | "sad" | "work" | "fly";

const SKIN: Record<string, string> = {
  peach: "#ffd9b8",
  tan: "#f1c27d",
  brown: "#c68642",
  cocoa: "#8d5524",
  mint: "#a7f3d0",
  sky: "#bae6fd",
  lilac: "#ddd6fe",
  gold: "#fcd34d",
  galaxy: "#a78bfa",
};

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? c + (255 - c) * (k - 1) : c * k)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
};
/** Kontur rangi: qismning o'z rangidan to'qroq (qora emas — yumshoqroq ko'rinadi) */
const ol = (hex: string) => shade(hex, 0.5);
const SW = 1.5;

export interface CharacterSvgProps {
  look?: Partial<GameLook> | null;
  size?: number | string;
  mood?: CharMood;
  /** Tagidagi supa (darajaga qarab) */
  pedestal?: boolean;
  /** Qo'ldagi narsa o'rniga (masalan, konda — ketmon) */
  holding?: "pickaxe" | null;
  className?: string;
  title?: string;
  /** Animatsiyasiz (ko'p personaj bo'lsa yoki kichik o'lchamda) */
  still?: boolean;
  /** Faqat bosh (reyting qatorlari uchun) */
  headOnly?: boolean;
  /** Ko'zlar qarash yo'nalishi (-1…1) — sichqonchaga qaraydi */
  gaze?: { x: number; y: number } | null;
  /** Harakat (emot) — salom berish, raqs va h.k. (lib/character/emotes.ts) */
  emote?: string | null;
}

type Outfit = { body: string; trim: string; legs: string };

/** Qahramon kostyumlari (original obrazlar): kiyim, qalpoq/shlem, niqob, dum yoki plash va ko'krak belgisi */
export interface Costume extends Outfit {
  skin?: string;
  hood?: string;
  ears?: "cat" | "horns" | "spikes" | "none";
  helmet?: boolean;
  hat?: "pirate" | "ice" | "leaf";
  mask?: string;
  eyepatch?: boolean;
  tail?: string;
  cape?: string;
  emblem?: "moon" | "wind" | "hex" | "leaf" | "star" | "skull" | "snow" | "belly";
  /** Soch ko'rinmaydi (qalpoq yoki shlem ostida) */
  noHair?: boolean;
}

export const COSTUMES: Record<string, Costume> = {
  cat: { body: "#f472b6", trim: "#fdf2f8", legs: "#db2777", hood: "#f472b6", ears: "cat", tail: "#f472b6", emblem: "star", noHair: true },
  penguin: { body: "#1e293b", trim: "#f8fafc", legs: "#0f172a", hood: "#1e293b", ears: "none", emblem: "belly", noHair: true },
  dino: { body: "#f97316", trim: "#fed7aa", legs: "#c2410c", hood: "#f97316", ears: "spikes", tail: "#f97316", emblem: "belly", noHair: true },
  dragon: { body: "#16a34a", trim: "#bbf7d0", legs: "#166534", hood: "#16a34a", ears: "horns", tail: "#16a34a", emblem: "belly", noHair: true },
  wind: { body: "#0d9488", trim: "#f0fdfa", legs: "#115e59", mask: "#0f766e", emblem: "wind" },
  pirate: { body: "#7f1d1d", trim: "#fbbf24", legs: "#1f2937", hat: "pirate", eyepatch: true, emblem: "skull" },
  forest: { body: "#78350f", trim: "#a3e635", legs: "#3f6212", skin: "#a3d977", hat: "leaf", emblem: "leaf" },
  night: { body: "#1e293b", trim: "#fbbf24", legs: "#0f172a", hood: "#111827", ears: "none", mask: "#111827", cape: "#312e81", emblem: "moon", noHair: true },
  ice: { body: "#bae6fd", trim: "#e0f2fe", legs: "#0369a1", hat: "ice", cape: "#7dd3fc", emblem: "snow" },
  cyber: { body: "#94a3b8", trim: "#22d3ee", legs: "#475569", helmet: true, emblem: "hex", noHair: true },
};

function outfitOf(kind: string, main: string): Outfit {
  switch (kind) {
    case "hoodie":
      return { body: main, trim: shade(main, 0.75), legs: "#334155" };
    case "school":
      return { body: "#1e3a8a", trim: "#f8fafc", legs: "#1e293b" };
    case "ninja":
      return { body: "#1f2937", trim: "#ef4444", legs: "#111827" };
    case "armor":
      return { body: "#cbd5e1", trim: "#64748b", legs: "#94a3b8" };
    case "space":
      return { body: "#f8fafc", trim: "#f97316", legs: "#e2e8f0" };
    case "hero":
      return { body: main, trim: "#facc15", legs: shade(main, 0.6) };
    case "royal":
      return { body: "#6d28d9", trim: "#fbbf24", legs: "#4c1d95" };
    default:
      return { body: main, trim: shade(main, 0.78), legs: "#1e40af" };
  }
}

function CharacterSvgImpl({ look: raw, size = 96, mood: baseMood = "idle", pedestal = true, holding = null, className, title, still = false, headOnly = false, gaze = null, emote = null }: CharacterSvgProps) {
  const em = emoteOf(emote);
  const mood: CharMood = em ? em.mood : baseMood;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const look = { ...DEFAULT_LOOK, color: 0, level: 1, ...(raw ?? {}) } as GameLook;
  const cos = look.costume && look.costume !== "none" ? COSTUMES[look.costume] : undefined;
  const skin = cos?.skin ?? SKIN[look.skin] ?? SKIN.peach;
  const skinDark = shade(skin, 0.8);
  const main = OUTFIT_COLORS[look.color % OUTFIT_COLORS.length] ?? OUTFIT_COLORS[0];
  const tier = tierOf(look.level);
  const hairHex = look.skin === "galaxy" ? "#2e1065" : "#3b2314";
  const hairFill = look.hair === "fire" ? `url(#${uid}fire)` : `url(#${uid}hair)`;
  const anim = !still;
  const sad = mood === "sad";
  const cheer = mood === "cheer" || mood === "happy";
  // Har personaj o'z vaqtida qimirlaydi (hammasi bir vaqtda emas): id dan barqaror kechikish
  const phase = -((uid.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 70) / 10);
  const calm = anim && !em && (mood === "idle" || mood === "happy");
  const power = Math.max(0, Math.min(5, look.power ?? 0));
  const o: Outfit = cos ?? outfitOf(look.outfit, main);
  const g = (n: string) => `url(#${uid}${n})`;
  const vb = headOnly ? "12 -8 76 78" : "0 0 100 124";

  return (
    <svg
      viewBox={vb}
      width={size}
      height={headOnly ? size : typeof size === "number" ? size * 1.24 : size}
      className={cn("chr overflow-visible", anim && "chr-anim", anim && !em && `chr-${mood === "happy" ? "idle" : mood}`, calm && !gaze && "chr-calm", anim && em && `chr-emote chr-e-${em.anim}`, className)}
      style={{ ["--chr-d" as string]: `${phase}s` }}
      role="img"
      aria-label={title ?? "Personaj"}
    >
      <defs>
        <radialGradient id={`${uid}aura`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tier.light} stopOpacity={0.55} />
          <stop offset="60%" stopColor={tier.light} stopOpacity={0.18} />
          <stop offset="100%" stopColor={tier.light} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${uid}ped`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(tier.light, 1.2)} />
          <stop offset="100%" stopColor={tier.base} />
        </linearGradient>
        <radialGradient id={`${uid}skin`} cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor={shade(skin, 1.12)} />
          <stop offset="55%" stopColor={skin} />
          <stop offset="100%" stopColor={skinDark} />
        </radialGradient>
        <linearGradient id={`${uid}body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(o.body, 1.15)} />
          <stop offset="100%" stopColor={shade(o.body, 0.8)} />
        </linearGradient>
        <linearGradient id={`${uid}legs`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(o.legs, 1.15)} />
          <stop offset="100%" stopColor={shade(o.legs, 0.75)} />
        </linearGradient>
        <linearGradient id={`${uid}hair`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(hairHex, 1.35)} />
          <stop offset="100%" stopColor={hairHex} />
        </linearGradient>
        <linearGradient id={`${uid}main`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(main, 1.2)} />
          <stop offset="100%" stopColor={shade(main, 0.82)} />
        </linearGradient>
        <linearGradient id={`${uid}metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="45%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id={`${uid}fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="60%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>
        <linearGradient id={`${uid}galaxy`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ddd6fe" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>
        <linearGradient id={`${uid}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="45%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id={`${uid}shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#000" stopOpacity={0} />
        </radialGradient>
      </defs>
      {title && <title>{title}</title>}

      {/* ---- Daraja: aura, halqalar, supa ---- */}
      {!headOnly && (look.level >= 4 || power > 0) && <circle cx="50" cy="62" r="48" fill={g("aura")} className={anim ? "chr-pulse" : undefined} />}
      {!headOnly && look.level >= 7 && (
        <g className={anim ? "chr-spin" : undefined} opacity={0.55}>
          <circle cx="50" cy="62" r="45" fill="none" stroke={tier.light} strokeWidth="1.6" strokeDasharray="3 6" />
          <circle cx="50" cy="62" r="40" fill="none" stroke={tier.light} strokeWidth="0.8" strokeDasharray="10 5" opacity={0.6} />
        </g>
      )}
      {!headOnly && pedestal && (
        <g>
          <ellipse cx="50" cy="116.5" rx="31" ry="7" fill={shade(tier.base, 0.7)} />
          <rect x="19" y="112" width="62" height="4.5" fill={tier.base} />
          <ellipse cx="50" cy="112" rx="31" ry="6.5" fill={g("ped")} stroke={shade(tier.base, 0.6)} strokeWidth="0.8" />
          <ellipse cx="44" cy="110.4" rx="16" ry="2" fill="#fff" opacity={0.35} />
          {look.level >= 5 && <ellipse cx="50" cy="112" rx="23" ry="3.8" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={0.8} />}
        </g>
      )}
      {!headOnly && <ellipse cx="50" cy={pedestal ? 110.5 : 113} rx="19" ry="4" fill={g("shadow")} className={anim ? "chr-shadow" : undefined} />}

      <g className="chr-body">
        {/* ---- Orqadagi narsalar ---- */}
        {!headOnly && (cos ? <CostumeBack c={cos} /> : <BackItem kind={look.back} uid={uid} />)}

        {/* ---- Oyoqlar ---- */}
        {!headOnly && (
          <g>
            {[
              { x: 39, cls: "chr-leg-l", sx: 43 },
              { x: 52, cls: "chr-leg-r", sx: 57 },
            ].map((l) => (
              <g key={l.cls} className={l.cls}>
                <rect x={l.x} y="91" width="9" height="15.5" rx="4" fill={g("legs")} stroke={ol(o.legs)} strokeWidth={SW} />
                <path d={`M${l.sx - 7} 108.5 Q${l.sx - 7} 103.5 ${l.sx} 103.5 Q${l.sx + 7.5} 103.5 ${l.sx + 7.5} 108.5 Q${l.sx + 7.5} 110.5 ${l.sx} 110.5 Q${l.sx - 7} 110.5 ${l.sx - 7} 108.5 Z`} fill="#1e293b" stroke="#020617" strokeWidth={SW} />
                <path d={`M${l.sx - 4} 105.5 Q${l.sx} 104.5 ${l.sx + 3} 105.5`} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth="1.2" strokeLinecap="round" />
              </g>
            ))}
          </g>
        )}

        {/* ---- Tana va kiyim ---- */}
        {!headOnly && (
          <g>
            <path d="M32 72 Q32 61 42 60.5 L58 60.5 Q68 61 68 72 L69.5 91 Q69.5 97 63 97 L37 97 Q30.5 97 30.5 91 Z" fill={g("body")} stroke={ol(o.body)} strokeWidth={SW} strokeLinejoin="round" />
            {/* Yon soya va yorug'lik */}
            <path d="M60 63 Q67 66 67.5 78 L68 92 Q67 95 63 95.5 Q65 82 60 63 Z" fill="#000" opacity={0.12} />
            <path d="M37 65 Q35 72 35.5 82" fill="none" stroke="#fff" strokeOpacity={0.28} strokeWidth="2" strokeLinecap="round" />
            {cos ? <CostumeChest c={cos} /> : <OutfitDetails kind={look.outfit} o={o} uid={uid} />}
            {/* Bosh ostidagi soya (bo'yin) */}
            <ellipse cx="50" cy="61.5" rx="10" ry="2.6" fill="#000" opacity={0.18} />
          </g>
        )}

        {/* ---- Qo'llar ---- */}
        {!headOnly && (
          <g>
            <g className="chr-arm-l">
              <rect x="23" y="63.5" width="10" height="24" rx="5" fill={g("body")} stroke={ol(o.body)} strokeWidth={SW} />
              <circle cx="28" cy="89" r="5" fill={g("skin")} stroke={ol(skin)} strokeWidth={SW} />
            </g>
            <g className="chr-arm-r">
              <rect x="67" y="63.5" width="10" height="24" rx="5" fill={g("body")} stroke={ol(o.body)} strokeWidth={SW} />
              <circle cx="72" cy="89" r="5" fill={g("skin")} stroke={ol(skin)} strokeWidth={SW} />
              <HandItem kind={em?.anim === "guitar" ? "guitar" : holding ?? look.hand} uid={uid} />
            </g>
          </g>
        )}

        {/* ---- Bosh ---- */}
        <g className={cn("chr-head", sad && "chr-head-sad")} transform={gaze ? `rotate(${(gaze.x * 5).toFixed(1)} 50 60)` : undefined}>
          {/* Quloqlar */}
          {[27.5, 72.5].map((x) => (
            <g key={x}>
              <circle cx={x} cy="40" r="5.2" fill={g("skin")} stroke={ol(skin)} strokeWidth={SW} />
              <circle cx={x} cy="40" r="2.4" fill={skinDark} opacity={0.6} />
            </g>
          ))}
          <circle cx="50" cy="38" r="23" fill={!cos?.skin && look.skin === "galaxy" ? g("galaxy") : !cos?.skin && look.skin === "gold" ? g("gold") : g("skin")} stroke={ol(skin)} strokeWidth={SW} />
          {look.skin === "galaxy" && (
            <g fill="#fff" opacity={0.85}>
              <circle cx="40" cy="26" r="0.9" />
              <circle cx="62" cy="30" r="0.7" />
              <circle cx="56" cy="52" r="0.8" />
              <circle cx="33" cy="44" r="0.6" />
            </g>
          )}
          {/* Yuz yaltirashi */}
          <ellipse cx="40" cy="24" rx="7" ry="3.5" fill="#fff" opacity={0.22} transform="rotate(-20 40 24)" />
          <Hair style={look.hair} fill={hairFill} outline={ol(hairHex)} hidden={cos ? Boolean(cos.noHair) : look.head === "astro" || look.head === "helmet"} />
          {cos?.mask && <path d="M27 34 Q50 28 73 34 L72 45 Q50 41 28 45 Z" fill={cos.mask} stroke={ol(cos.mask)} strokeWidth="1.2" />}
          {/* Yuz */}
          <ellipse cx="36.5" cy="47.5" rx="4" ry="2.6" fill="#fb7185" opacity={0.35} />
          <ellipse cx="63.5" cy="47.5" rx="4" ry="2.6" fill="#fb7185" opacity={0.35} />
          {look.eyes !== "visor" && <Brows mood={mood} color={ol(hairHex)} />}
          <g className="chr-gaze" transform={gaze ? `translate(${(gaze.x * 2.4).toFixed(2)} ${(gaze.y * 1.6).toFixed(2)})` : undefined}>
            <Eyes kind={look.eyes} sad={sad} happy={cheer} galaxy={look.skin === "galaxy"} />
          </g>
          {look.mouth !== "mask" && <path d="M48.6 45.4 Q50 46.9 51.4 45.4" fill="none" stroke={ol(skin)} strokeWidth="1.1" strokeLinecap="round" opacity={0.7} />}
          <Mouth kind={look.mouth} sad={sad} happy={cheer} />
          {cos ? <CostumeHead c={cos} uid={uid} /> : <HeadItem kind={look.head} main={main} uid={uid} />}
        </g>
      </g>

      {/* ---- Harakat belgilari (emot) ---- */}
      {em && anim && !headOnly && (
        <g>
          <ellipse className="chr-ripple" cx="50" cy="112" rx="24" ry="5" fill="none" stroke="#f0abfc" strokeWidth="1.6" />
          <ellipse className="chr-ripple" cx="50" cy="112" rx="24" ry="5" fill="none" stroke="#a5f3fc" strokeWidth="1.2" style={{ animationDelay: "0.5s" }} />
        </g>
      )}
      {em && anim &&
        FX_SPOTS.map((f, k) => (
          <text
            key={k}
            className="chr-fx"
            x={f.x}
            y={f.y}
            fontSize={(headOnly ? 11 : 13) * f.s}
            textAnchor="middle"
            style={{ animationDelay: `${f.d}s`, transformBox: "fill-box", transformOrigin: "center" }}
          >
            {em.fx[k % Math.max(1, em.fx.length)] ?? em.icon}
          </text>
        ))}

      {/* ---- Hamroh ---- */}
      {!headOnly && look.pet !== "none" && <Pet kind={look.pet} />}

      {/* ---- Kuch: uchqunlar ---- */}
      {power > 0 &&
        SPARKS.slice(0, power * 2).map((s, i) => (
          <path
            key={i}
            className={anim ? "chr-twinkle" : undefined}
            style={{ animationDelay: `${i * 0.27}s`, transformOrigin: `${s.x}px ${s.y}px` }}
            d={`M${s.x} ${s.y - s.r} L${s.x + s.r * 0.3} ${s.y - s.r * 0.3} L${s.x + s.r} ${s.y} L${s.x + s.r * 0.3} ${s.y + s.r * 0.3} L${s.x} ${s.y + s.r} L${s.x - s.r * 0.3} ${s.y + s.r * 0.3} L${s.x - s.r} ${s.y} L${s.x - s.r * 0.3} ${s.y - s.r * 0.3} Z`}
            fill={power >= 5 ? "#f0abfc" : power >= 3 ? "#67e8f9" : "#fde047"}
            stroke="#fff"
            strokeOpacity={0.6}
            strokeWidth="0.4"
          />
        ))}
      {/* 10-daraja: atrofida aylanuvchi yulduzlar */}
      {!headOnly && look.level >= 10 && (
        <g className={anim ? "chr-orbit" : undefined}>
          <circle cx="50" cy="14" r="2.2" fill="#fef08a" />
          <circle cx="90" cy="62" r="1.8" fill="#f0abfc" />
          <circle cx="10" cy="62" r="1.8" fill="#a5f3fc" />
        </g>
      )}
    </svg>
  );
}

/** Harakat belgilari: personaj atrofida turli joydan, turli vaqtda ko'tariladi */
const FX_SPOTS = [
  { x: 16, y: 30, d: 0, s: 1.2 },
  { x: 84, y: 24, d: 0.25, s: 1 },
  { x: 50, y: 2, d: 0.5, s: 1.3 },
  { x: 10, y: 66, d: 0.75, s: 0.9 },
  { x: 90, y: 60, d: 0.4, s: 1.1 },
  { x: 30, y: 10, d: 0.9, s: 0.8 },
];

const SPARKS = [
  { x: 14, y: 30, r: 4 },
  { x: 86, y: 26, r: 3.5 },
  { x: 90, y: 90, r: 3 },
  { x: 10, y: 84, r: 3.5 },
  { x: 50, y: 4, r: 3 },
  { x: 22, y: 8, r: 2.5 },
  { x: 80, y: 6, r: 2.5 },
  { x: 96, y: 48, r: 2.5 },
  { x: 4, y: 52, r: 2.5 },
  { x: 70, y: 112, r: 2.5 },
];

function CostumeBack({ c }: { c: Costume }) {
  return (
    <g>
      {c.cape && (
        <g className="chr-cape">
          <path d="M34 65 Q50 59 66 65 L76 107 Q50 115 24 107 Z" fill={c.cape} stroke={ol(c.cape)} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M40 70 L35 105 M60 70 L65 105" stroke={ol(c.cape)} strokeOpacity={0.4} strokeWidth="1.2" />
        </g>
      )}
      {c.tail && (
        <g className="chr-cape">
          <path d="M62 92 Q80 98 84 86 Q86 80 82 78" fill="none" stroke={ol(c.tail)} strokeWidth="7.5" strokeLinecap="round" />
          <path d="M62 92 Q80 98 84 86 Q86 80 82 78" fill="none" stroke={c.tail} strokeWidth="5" strokeLinecap="round" />
          {c.ears === "spikes" || c.ears === "horns" ? <path d="M74 93 L77 87 L80 92 Z M81 88 L85 83 L86 89 Z" fill={c.trim} stroke={ol(c.tail)} strokeWidth="0.8" /> : null}
        </g>
      )}
    </g>
  );
}

function CostumeChest({ c }: { c: Costume }) {
  const s = ol(c.body);
  switch (c.emblem) {
    case "belly":
      return <ellipse cx="50" cy="80" rx="12" ry="13" fill={c.trim} stroke={s} strokeWidth="1" opacity={0.95} />;
    case "moon":
      return (
        <g>
          <ellipse cx="50" cy="76" rx="9" ry="6.5" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
          <path d="M47 72 A5 5 0 1 0 47 80 A4 4 0 1 1 47 72 Z" fill="#1e293b" />
          <rect x="31" y="86" width="38" height="3.5" fill="#fbbf24" stroke="#92400e" strokeWidth="0.6" />
        </g>
      );
    case "wind":
      return (
        <g fill="none" stroke={c.trim} strokeWidth="2" strokeLinecap="round">
          <path d="M40 72 Q52 70 56 74 Q59 78 54 79" />
          <path d="M38 78 Q50 77 58 80" />
          <path d="M41 84 Q50 83 55 86 Q57 88 54 89" />
        </g>
      );
    case "hex":
      return (
        <g>
          <path d="M50 69 L57 73 L57 81 L50 85 L43 81 L43 73 Z" fill="#052e16" stroke="#22d3ee" strokeWidth="1.4" />
          <path d="M50 72.5 L54 75 L54 79 L50 81.5 L46 79 L46 75 Z" fill="#4ade80" className="chr-scan" />
          <path d="M33 70 L40 70 M60 70 L67 70 M33 90 L67 90" stroke="#22d3ee" strokeWidth="1.2" />
        </g>
      );
    case "leaf":
      return (
        <g>
          <path d="M40 62 L50 96 L60 62" fill="none" stroke={c.trim} strokeWidth="2" />
          <path d="M50 74 Q57 70 58 78 Q52 82 50 74 Z" fill={c.trim} stroke="#3f6212" strokeWidth="0.8" />
        </g>
      );
    case "star":
      return <path d="M50 70 L52.5 76 L59 76.3 L54 80.3 L55.7 86.6 L50 83 L44.3 86.6 L46 80.3 L41 76.3 L47.5 76 Z" fill="#fde047" stroke="#a16207" strokeWidth="0.9" />;
    case "skull":
      return (
        <g>
          <path d="M38 61 L50 74 L62 61" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.8" />
          <rect x="31" y="84" width="38" height="4" fill="#1f2937" />
          <rect x="47" y="83" width="6" height="6" rx="1" fill="#fbbf24" stroke="#92400e" strokeWidth="0.6" />
          <circle cx="44" cy="78" r="1.3" fill="#fbbf24" />
          <circle cx="56" cy="78" r="1.3" fill="#fbbf24" />
        </g>
      );
    case "snow":
      return (
        <g stroke="#0ea5e9" strokeWidth="1.4" strokeLinecap="round">
          <path d="M50 69 V85 M43 73 L57 81 M57 73 L43 81" />
          <circle cx="50" cy="77" r="2" fill="#e0f2fe" />
        </g>
      );
    default:
      return null;
  }
}

function CostumeHead({ c, uid }: { c: Costume; uid: string }) {
  return (
    <g>
      {c.hood && (
        <g stroke={ol(c.hood)} strokeWidth={SW} strokeLinejoin="round">
          {c.ears === "cat" && <path d="M29 22 L27 4 L42 14 Z M71 22 L73 4 L58 14 Z" fill={c.hood} />}
          {c.ears === "cat" && <path d="M30 17 L29.5 9 L37 14 Z M70 17 L70.5 9 L63 14 Z" fill="#fbcfe8" stroke="none" />}
          {c.ears === "horns" && <path d="M33 17 Q28 4 35 0 Q36 8 40 13 Z M67 17 Q72 4 65 0 Q64 8 60 13 Z" fill="#fef3c7" stroke="#a16207" />}
          {c.ears === "spikes" && <path d="M38 13 L42 2 L47 11 L50 0 L53 11 L58 2 L62 13 Z" fill={c.trim} />}
          <path d="M23.5 48 Q20 9 50 9 Q80 9 76.5 48 Q73 36 70 30 Q62 22 50 22 Q38 22 30 30 Q27 36 23.5 48 Z" fill={c.hood} />
          <path d="M33 18 Q42 12 54 12.5" fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}
      {c.helmet && (
        <g stroke="#334155" strokeWidth={SW} strokeLinejoin="round">
          <path d="M25 46 Q22 11 50 11 Q78 11 75 46 Q75 60 62 62 L38 62 Q25 60 25 46 Z" fill={`url(#${uid}metal)`} />
          <path d="M31 33 Q50 27 69 33 L67 44 Q50 40 33 44 Z" fill="#082f49" />
          <path d="M33 35 Q50 31 67 35" fill="none" stroke="#22d3ee" strokeWidth="2" className="chr-scan" />
          <path d="M40 52 L60 52 M43 56 L57 56" stroke="#64748b" strokeWidth="1.2" />
          <path d="M32 20 Q42 14 54 14" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {c.hat === "pirate" && (
        <g stroke="#020617" strokeWidth={SW} strokeLinejoin="round">
          <path d="M18 28 Q50 4 82 28 Q66 24 50 25 Q34 24 18 28 Z" fill="#111827" />
          <path d="M28 25 Q50 12 72 25" fill="none" stroke="#fbbf24" strokeWidth="1.6" />
          <circle cx="50" cy="17" r="3" fill="#f8fafc" stroke="none" />
          <path d="M46.5 21.5 L53.5 21.5" stroke="#f8fafc" strokeWidth="1.4" />
        </g>
      )}
      {c.hat === "ice" && (
        <g stroke="#0369a1" strokeWidth="1" strokeLinejoin="round">
          <path d="M32 22 L34 8 L40 16 L45 3 L50 14 L55 3 L60 16 L66 8 L68 22 Z" fill="#e0f2fe" fillOpacity={0.9} />
          <circle cx="50" cy="17" r="2.2" fill="#38bdf8" />
        </g>
      )}
      {c.hat === "leaf" && (
        <g stroke="#3f6212" strokeWidth="1" strokeLinejoin="round">
          {[-18, -9, 0, 9, 18].map((dx, i) => (
            <path key={i} d={`M${50 + dx} 18 Q${46 + dx} 8 ${50 + dx} 3 Q${54 + dx} 8 ${50 + dx} 18 Z`} fill={i % 2 ? "#84cc16" : "#65a30d"} transform={`rotate(${dx * 1.6} ${50 + dx} 18)`} />
          ))}
        </g>
      )}
      {c.eyepatch && (
        <g>
          <path d="M27 31 L73 44" stroke="#111827" strokeWidth="1.6" />
          <ellipse cx="60" cy="40" rx="5.5" ry="5" fill="#111827" stroke="#020617" strokeWidth="0.8" />
        </g>
      )}
    </g>
  );
}

function BackItem({ kind, uid }: { kind: string; uid: string }) {
  switch (kind) {
    case "cape":
      return (
        <g className="chr-cape">
          <path d="M35 66 Q50 61 65 66 L73 106 Q50 113 27 106 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth={SW} strokeLinejoin="round" />
          <path d="M41 70 L37 104 M50 68 L50 107 M59 70 L63 104" stroke="#7f1d1d" strokeOpacity={0.35} strokeWidth="1.2" />
        </g>
      );
    case "wings":
      return (
        <g className="chr-wings" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M36 70 C18 56 4 62 6 74 C14 72 18 80 10 86 C22 88 30 82 36 78 Z" />
          <path d="M64 70 C82 56 96 62 94 74 C86 72 82 80 90 86 C78 88 70 82 64 78 Z" />
        </g>
      );
    case "dragon":
      return (
        <g className="chr-wings" fill="#7c3aed" stroke="#3b0764" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M36 70 L6 54 L12 70 L2 76 L14 80 L8 90 L36 80 Z" />
          <path d="M64 70 L94 54 L88 70 L98 76 L86 80 L92 90 L64 80 Z" />
        </g>
      );
    case "jetpack":
      return (
        <g>
          <rect x="27" y="66" width="10" height="24" rx="4" fill={`url(#${uid}metal)`} stroke="#334155" strokeWidth={SW} />
          <rect x="63" y="66" width="10" height="24" rx="4" fill={`url(#${uid}metal)`} stroke="#334155" strokeWidth={SW} />
          <path className="chr-flame" d="M28 90 Q32 106 36 90 Z M64 90 Q68 106 72 90 Z" fill={`url(#${uid}fire)`} />
        </g>
      );
    case "backpack":
      return <rect x="29" y="64" width="42" height="28" rx="9" fill="#a16207" stroke="#451a03" strokeWidth={SW} />;
    default:
      return null;
  }
}

function OutfitDetails({ kind, o, uid }: { kind: string; o: Outfit; uid: string }) {
  const s = ol(o.body);
  switch (kind) {
    case "tee":
      return (
        <g>
          <path d="M42 61 Q50 67.5 58 61" fill="none" stroke={o.trim} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M33 72 L37 70 M67 72 L63 70" stroke={s} strokeWidth="1" opacity={0.5} />
        </g>
      );
    case "hoodie":
      return (
        <g>
          <path d="M38 61.5 Q50 72 62 61.5" fill="none" stroke={o.trim} strokeWidth="3.4" strokeLinecap="round" />
          <rect x="40" y="80" width="20" height="9" rx="4" fill={o.trim} stroke={s} strokeWidth="1" />
          <path d="M46 66 L45.5 75 M54 66 L54.5 75" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="45.5" cy="75.5" r="1.1" fill="#fff" />
          <circle cx="54.5" cy="75.5" r="1.1" fill="#fff" />
        </g>
      );
    case "school":
      return (
        <g>
          <path d="M41 61 L50 72 L59 61 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
          <path d="M48 66 L50 81 L52 66 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.8" />
          <circle cx="50" cy="86" r="1" fill="#facc15" />
          <circle cx="50" cy="91" r="1" fill="#facc15" />
        </g>
      );
    case "ninja":
      return (
        <g>
          <path d="M39 61 L50 74 L61 61" fill="none" stroke="#374151" strokeWidth="2" />
          <rect x="31" y="78" width="38" height="5" fill={o.trim} stroke="#7f1d1d" strokeWidth="0.8" />
          <path d="M60 83 L64 92 L60 91 Z" fill={o.trim} />
        </g>
      );
    case "armor":
      return (
        <g>
          <path d="M34 66 Q50 60 66 66 L64 84 Q50 90 36 84 Z" fill={`url(#${uid}metal)`} stroke="#475569" strokeWidth="1.2" />
          <path d="M50 63.5 L50 88" stroke="#475569" strokeWidth="1.2" />
          <path d="M37 70 Q50 66 63 70" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth="1.2" />
          <circle cx="50" cy="75" r="4" fill={`url(#${uid}gold)`} stroke="#a16207" strokeWidth="1" />
        </g>
      );
    case "space":
      return (
        <g>
          <rect x="40" y="70" width="20" height="12" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="45" cy="76" r="2" fill="#ef4444" />
          <circle cx="51" cy="76" r="2" fill="#22c55e" />
          <circle cx="56" cy="76" r="2" fill="#3b82f6" />
          <rect x="31" y="86" width="38" height="4" fill={o.trim} stroke="#9a3412" strokeWidth="0.6" />
        </g>
      );
    case "hero":
      return (
        <g>
          <path d="M42 70 L50 66 L58 70 L50 84 Z" fill={`url(#${uid}gold)`} stroke="#a16207" strokeWidth="1" />
          <path d="M47 72 L53 72 L50 79 Z" fill={o.body} />
          <rect x="31" y="86" width="38" height="4" fill={o.trim} stroke="#a16207" strokeWidth="0.6" />
        </g>
      );
    case "royal":
      return (
        <g>
          <path d="M31.5 70 Q50 64 68.5 70" fill="none" stroke="#fef3c7" strokeWidth="5" strokeDasharray="1.5 2.5" />
          <rect x="47" y="63" width="6" height="32" fill={`url(#${uid}gold)`} stroke="#a16207" strokeWidth="0.8" />
          <circle cx="50" cy="74" r="3.5" fill="#ef4444" stroke="#7f1d1d" strokeWidth="0.8" />
          <circle cx="49" cy="73" r="1" fill="#fff" opacity={0.7} />
        </g>
      );
    default:
      return null;
  }
}

function Hair({ style, fill, outline, hidden }: { style: string; fill: string; outline: string; hidden: boolean }) {
  if (hidden) return null;
  const p = { fill, stroke: outline, strokeWidth: SW, strokeLinejoin: "round" as const };
  const shine = <path d="M36 21 Q44 16 54 17" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth="1.8" strokeLinecap="round" />;
  switch (style) {
    case "side":
      return (
        <g>
          <path d="M26.5 37 Q27 13.5 50 13.5 Q73 13.5 73.5 34 Q60 21.5 40 30 Q32 33 26.5 37 Z" {...p} />
          {shine}
        </g>
      );
    case "long":
      return (
        <g>
          <path d="M25.5 44 Q23.5 13.5 50 13.5 Q76.5 13.5 74.5 44 L76.5 63 Q69.5 55 69.5 37 Q60 24 50 26 Q40 24 30.5 37 Q30.5 55 23.5 63 Z" {...p} />
          {shine}
        </g>
      );
    case "bun":
      return (
        <g>
          <circle cx="50" cy="11.5" r="7" {...p} />
          <path d="M26.5 34.5 Q27.5 14.5 50 14.5 Q72.5 14.5 73.5 34.5 Q62 24 50 24 Q38 24 26.5 34.5 Z" {...p} />
          {shine}
        </g>
      );
    case "spiky":
      return <path d="M26.5 34.5 L27.5 19.5 L34 23.5 L37 11 L43 19.5 L50 8 L56 19.5 L63 11 L66 23.5 L72.5 19.5 L73.5 34.5 Q60 24 50 25 Q40 24 26.5 34.5 Z" {...p} />;
    case "curly":
      return (
        <g>
          {[30, 37, 44, 51, 58, 65, 70].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 18 : 22} r="7" {...p} />
          ))}
          <path d="M38 16 Q44 13 50 14" fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case "mohawk":
      return <path d="M44 26 L46 3.5 L50 1.5 L54 3.5 L56 26 Z" fill="#ec4899" stroke="#831843" strokeWidth={SW} strokeLinejoin="round" />;
    case "fire":
      return <path className="chr-flame" d="M26.5 34.5 Q25.5 18 34 9.5 Q36 18 40 16 Q42 3.5 50 -0.5 Q54 10 58 7.5 Q62 14 64 9.5 Q74.5 20 73.5 34.5 Q62 24 50 25 Q38 24 26.5 34.5 Z" fill={fill} stroke="#9a3412" strokeWidth={SW} strokeLinejoin="round" />;
    default:
      return (
        <g>
          <path d="M26.5 34.5 Q27.5 14.5 50 14.5 Q72.5 14.5 73.5 34.5 Q66 26 58 27 Q52 20 46 26 Q36 24 26.5 34.5 Z" {...p} />
          {shine}
        </g>
      );
  }
}

/** Qoshlar: kayfiyatni ko'rsatadi */
function Brows({ mood, color }: { mood: CharMood; color: string }) {
  const d =
    mood === "sad"
      ? ["M35 31 Q40 30.5 45 27.5", "M55 27.5 Q60 30.5 65 31"]
      : mood === "cheer" || mood === "jump"
      ? ["M35 28.5 Q40 25 45 27.5", "M55 27.5 Q60 25 65 28.5"]
      : mood === "work" || mood === "run"
      ? ["M35 28.5 Q40 29.5 45 31", "M55 31 Q60 29.5 65 28.5"]
      : ["M35 30.5 Q40 28 45 29.8", "M55 29.8 Q60 28 65 30.5"];
  return (
    <g className="chr-brow" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round">
      <path d={d[0]} />
      <path d={d[1]} />
    </g>
  );
}

function Eyes({ kind, sad, happy, galaxy }: { kind: string; sad: boolean; happy: boolean; galaxy: boolean }) {
  if (kind === "shades")
    return (
      <g>
        <path d="M32.5 35 L47 35 L46 42 Q40 45.5 34 42 Z" fill="#0f172a" stroke="#020617" strokeWidth="1" />
        <path d="M53 35 L67.5 35 L66 42 Q60 45.5 54 42 Z" fill="#0f172a" stroke="#020617" strokeWidth="1" />
        <line x1="47" y1="36.5" x2="53" y2="36.5" stroke="#0f172a" strokeWidth="2" />
        <path d="M35 37 L40 37 M56 37 L61 37" stroke="#fff" strokeWidth="1.2" opacity={0.55} strokeLinecap="round" />
      </g>
    );
  if (kind === "visor")
    return (
      <g>
        <rect x="29" y="32.5" width="42" height="11.5" rx="5.75" fill="#0e7490" stroke="#083344" strokeWidth="1.2" />
        <rect x="31" y="34.5" width="38" height="3" rx="1.5" fill="#67e8f9" className="chr-scan" />
        <circle cx="62" cy="40" r="1.2" fill="#a5f3fc" />
      </g>
    );
  if (happy || kind === "happy")
    return (
      <g fill="none" stroke="#1e1b4b" strokeWidth="2.6" strokeLinecap="round">
        <path d="M35.5 41.5 Q40 36 44.5 41.5" />
        <path d="M55.5 41.5 Q60 36 64.5 41.5" />
      </g>
    );
  if (sad)
    return (
      <g>
        {[40, 60].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="41" rx="4" ry="3.6" fill="#fff" stroke="#334155" strokeWidth="0.8" />
            <circle cx={x} cy="41.8" r="2.4" fill="#1e1b4b" />
            <circle cx={x + 0.9} cy="40.6" r="0.8" fill="#fff" />
            <path d={`M${x - 4.5} 38.4 Q${x} 37.4 ${x + 4.5} 38.4`} fill="none" stroke="#334155" strokeWidth="1.3" strokeLinecap="round" />
          </g>
        ))}
        <path d="M37 45.5 Q36.5 48 37.5 49" fill="none" stroke="#60a5fa" strokeWidth="1.4" strokeLinecap="round" opacity={0.8} />
      </g>
    );
  if (kind === "star")
    return (
      <g fill="#facc15" stroke="#a16207" strokeWidth="0.8" className="chr-blink">
        <path d="M40 34 L41.6 38.5 L46 38.6 L42.5 41.3 L43.8 45.6 L40 43 L36.2 45.6 L37.5 41.3 L34 38.6 L38.4 38.5 Z" />
        <path d="M60 34 L61.6 38.5 L66 38.6 L62.5 41.3 L63.8 45.6 L60 43 L56.2 45.6 L57.5 41.3 L54 38.6 L58.4 38.5 Z" />
        <circle cx="38.6" cy="38.6" r="0.9" fill="#fff" stroke="none" />
        <circle cx="58.6" cy="38.6" r="0.9" fill="#fff" stroke="none" />
      </g>
    );
  const iris = kind === "fire" ? "#ea580c" : galaxy ? "#7c3aed" : "#5b3417";
  const one = (x: number, wink = false) =>
    wink ? (
      <path key={x} d={`M${x - 4.5} 41 Q${x} 37 ${x + 4.5} 41`} fill="none" stroke="#1e1b4b" strokeWidth="2.6" strokeLinecap="round" />
    ) : (
      <g key={x} className="chr-blink">
        <ellipse cx={x} cy="40" rx="4.4" ry="5.2" fill="#fff" stroke="#334155" strokeWidth="0.9" />
        <ellipse cx={x + 0.3} cy="40.8" rx="3.1" ry="3.7" fill={iris} />
        <ellipse cx={x + 0.3} cy="41.2" rx="1.7" ry="2.1" fill="#0b0716" />
        <circle cx={x + 1.5} cy="38.8" r="1.3" fill="#fff" />
        <circle cx={x - 1} cy="42.8" r="0.6" fill="#fff" opacity={0.85} />
        <path d={`M${x - 4.6} 37.6 Q${x} 34.2 ${x + 4.6} 37.6`} fill="none" stroke="#1e1b4b" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    );
  return (
    <g>
      {one(40)}
      {one(60, kind === "wink")}
      {kind === "fire" && (
        <g className="chr-flame" fill="#f97316" opacity={0.7}>
          <path d="M34 36 Q36 30 38 34 Z M62 34 Q64 30 66 36 Z" />
        </g>
      )}
    </g>
  );
}

function Mouth({ kind, sad, happy }: { kind: string; sad: boolean; happy: boolean }) {
  if (kind === "mask")
    return (
      <g>
        <path d="M29.5 44 Q50 41.5 70.5 44 L68.5 56.5 Q50 62.5 31.5 56.5 Z" fill="#1f2937" stroke="#030712" strokeWidth="1.2" />
        <path d="M34 50 Q50 52 66 50" fill="none" stroke="#374151" strokeWidth="1" />
      </g>
    );
  if (sad) return <path d="M44 54 Q50 49.5 56 54" fill="none" stroke="#7f1d1d" strokeWidth="2.2" strokeLinecap="round" />;
  if (happy || kind === "grin")
    return (
      <g>
        <path d="M41.5 49 Q50 60 58.5 49 Z" fill="#7f1d1d" stroke="#450a0a" strokeWidth="1" strokeLinejoin="round" />
        <path d="M43.5 49.6 Q50 51.8 56.5 49.6 L56 51 Q50 52.6 44 51 Z" fill="#fff" />
        <path d="M46 55.2 Q50 53 54 55.2 Q50 57.6 46 55.2 Z" fill="#fb7185" />
      </g>
    );
  if (kind === "open")
    return (
      <g>
        <ellipse cx="50" cy="52" rx="3.6" ry="4.2" fill="#7f1d1d" stroke="#450a0a" strokeWidth="1" />
        <ellipse cx="50" cy="54" rx="2" ry="1.4" fill="#fb7185" />
      </g>
    );
  if (kind === "tongue")
    return (
      <g>
        <path d="M43 50 Q50 56 57 50" fill="none" stroke="#7f1d1d" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M48 53 Q50.5 60 53 53 Z" fill="#fb7185" stroke="#be123c" strokeWidth="0.8" />
      </g>
    );
  if (kind === "smirk") return <path d="M44 52.5 Q52 55.5 58 48.5" fill="none" stroke="#7f1d1d" strokeWidth="2.2" strokeLinecap="round" />;
  return (
    <g>
      <path d="M43 50 Q50 57.5 57 50 Q50 53 43 50 Z" fill="#9f1239" stroke="#7f1d1d" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M46.5 53.6 Q50 52.4 53.5 53.6 Q50 55.3 46.5 53.6 Z" fill="#fb7185" />
    </g>
  );
}

function HeadItem({ kind, main, uid }: { kind: string; main: string; uid: string }) {
  switch (kind) {
    case "cap":
      return (
        <g stroke={ol(main)} strokeWidth={SW} strokeLinejoin="round">
          <path d="M27.5 30 Q29.5 11.5 50 11.5 Q70.5 11.5 72.5 30 Z" fill={`url(#${uid}main)`} />
          <path d="M50 28 Q70 26 85 32 Q72 35 56 32.5 Z" fill={shade(main, 0.7)} />
          <circle cx="50" cy="12.5" r="2" fill={shade(main, 0.65)} />
          <path d="M34 22 Q42 16 52 16" fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case "beanie":
      return (
        <g stroke="#042f2e" strokeWidth={SW} strokeLinejoin="round">
          <path d="M27.5 30 Q27.5 11.5 50 11.5 Q72.5 11.5 72.5 30 Z" fill="#0f766e" />
          <path d="M30 25.5 Q50 17.5 70 25.5" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeDasharray="2 2" />
          <rect x="26.5" y="28" width="47" height="4.5" rx="2.25" fill="#134e4a" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M26 38 Q26 9.5 50 9.5 Q74 9.5 74 38" fill="none" stroke="#1f2937" strokeWidth="4.5" strokeLinecap="round" />
          {[21, 70].map((x) => (
            <g key={x}>
              <rect x={x} y="33.5" width="9" height="15" rx="4.5" fill="#ef4444" stroke="#7f1d1d" strokeWidth={SW} />
              <rect x={x + 2} y="36" width="2" height="9" rx="1" fill="#fff" opacity={0.4} />
            </g>
          ))}
        </g>
      );
    case "band":
      return (
        <g stroke="#7f1d1d" strokeWidth="1.2" strokeLinejoin="round">
          <rect x="25.5" y="23.5" width="49" height="7.5" rx="3.5" fill="#dc2626" />
          <path d="M74 27 L87 21.5 L85 30.5 Z M74 28.5 L87 34.5 L80.5 36.5 Z" fill="#dc2626" />
          <circle cx="50" cy="27.3" r="2.6" fill="#f8fafc" />
        </g>
      );
    case "helmet":
      return (
        <g stroke="#334155" strokeWidth={SW} strokeLinejoin="round">
          <path d="M24.5 40 Q23.5 11.5 50 11.5 Q76.5 11.5 75.5 40 L75.5 48.5 L66 48.5 L66 40 L34 40 L34 48.5 L24.5 48.5 Z" fill={`url(#${uid}metal)`} />
          <path d="M50 3.5 Q56.5 7.5 54.5 14 L45.5 14 Q43.5 7.5 50 3.5 Z" fill="#dc2626" stroke="#7f1d1d" />
          <rect x="34" y="33.5" width="32" height="3" fill="#475569" />
          <path d="M31 22 Q40 15 52 15" fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case "wizard":
      return (
        <g stroke="#2e1065" strokeWidth={SW} strokeLinejoin="round">
          <path d="M23.5 30 Q50 21.5 76.5 30 L70 32.5 Q50 26 30 32.5 Z" fill="#4c1d95" />
          <path d="M32 29 L52 -8 L68 29 Z" fill="#6d28d9" />
          <path d="M44 6 Q47 12 46 20" fill="none" stroke="#a78bfa" strokeWidth="1.4" strokeLinecap="round" opacity={0.7} />
          <path d="M45 14 L47 18 L51 18 L48 21 L49 25 L45 22 L41 25 L42 21 L39 18 L43 18 Z" fill="#facc15" stroke="#a16207" strokeWidth="0.6" className="chr-twinkle" />
        </g>
      );
    case "astro":
      return (
        <g>
          <circle cx="50" cy="38" r="28" fill="#e0f2fe" fillOpacity={0.2} stroke="#e2e8f0" strokeWidth="3" />
          <circle cx="50" cy="38" r="28" fill="none" stroke="#64748b" strokeWidth="0.8" />
          <path d="M31 24 Q39 15 50 14" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" opacity={0.85} />
          <rect x="43.5" y="62" width="13" height="4.5" rx="2" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.8" />
        </g>
      );
    case "crown":
      return (
        <g stroke="#92400e" strokeWidth="1.1" strokeLinejoin="round">
          <path d="M31 24 L33 5.5 L41 14.5 L50 1.5 L59 14.5 L67 5.5 L69 24 Z" fill={`url(#${uid}gold)`} />
          <rect x="31" y="20" width="38" height="4" fill="#d97706" />
          <circle cx="50" cy="15.5" r="2.7" fill="#ef4444" />
          <circle cx="39" cy="18.5" r="1.8" fill="#3b82f6" />
          <circle cx="61" cy="18.5" r="1.8" fill="#22c55e" />
          <path d="M36 10 L38 18" stroke="#fff" strokeOpacity={0.6} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      );
    case "halo":
      return (
        <g className="chr-halo">
          <ellipse cx="50" cy="6" rx="16" ry="4.5" fill="none" stroke="#fde047" strokeWidth="3.2" />
          <ellipse cx="50" cy="6" rx="16" ry="4.5" fill="none" stroke="#fff" strokeWidth="1" opacity={0.7} />
        </g>
      );
    default:
      return null;
  }
}

function HandItem({ kind, uid }: { kind: string; uid: string }) {
  switch (kind) {
    case "pencil":
      return (
        <g transform="rotate(-25 72 89)" stroke="#92400e" strokeWidth="0.8">
          <rect x="70" y="70" width="4.5" height="22" fill="#facc15" />
          <path d="M70 92 L72.25 97 L74.5 92 Z" fill="#fcd9b8" />
          <rect x="70" y="67.5" width="4.5" height="3" fill="#f472b6" />
        </g>
      );
    case "book":
      return (
        <g stroke="#1e3a8a" strokeWidth="1.1">
          <rect x="66" y="80" width="15" height="18" rx="1.5" fill="#2563eb" />
          <rect x="68" y="82" width="11" height="2" fill="#bfdbfe" stroke="none" />
          <rect x="66" y="80" width="2.5" height="18" fill="#1d4ed8" stroke="none" />
        </g>
      );
    case "laptop":
      return (
        <g stroke="#0f172a" strokeWidth="1">
          <rect x="62" y="80" width="22" height="14" rx="2" fill="#334155" />
          <rect x="64" y="82" width="18" height="10" rx="1" fill="#22d3ee" className="chr-scan" stroke="none" />
          <rect x="60" y="94" width="26" height="3" rx="1.5" fill="#475569" />
        </g>
      );
    case "sword":
      return (
        <g transform="rotate(-20 72 89)">
          <path d="M70.5 86 L70.5 58 L72.5 54 L74.5 58 L74.5 86 Z" fill={`url(#${uid}metal)`} stroke="#475569" strokeWidth="0.8" />
          <rect x="65" y="85" width="15" height="3" rx="1.5" fill={`url(#${uid}gold)`} stroke="#92400e" strokeWidth="0.6" />
          <rect x="71" y="88" width="3" height="7" fill="#78350f" />
        </g>
      );
    case "wand":
      return (
        <g transform="rotate(-25 72 89)">
          <rect x="71" y="68" width="2.6" height="24" fill="#78350f" stroke="#451a03" strokeWidth="0.6" />
          <path className="chr-twinkle" d="M72.3 60 L74 65 L79 65.5 L75 68.5 L76.4 73.5 L72.3 70.6 L68.2 73.5 L69.6 68.5 L65.6 65.5 L70.6 65 Z" fill="#fde047" stroke="#a16207" strokeWidth="0.6" />
        </g>
      );
    case "trophy":
      return (
        <g stroke="#92400e" strokeWidth="0.8">
          <path d="M64 74 L80 74 L78 86 Q72 90 66 86 Z" fill={`url(#${uid}gold)`} />
          <rect x="70" y="88" width="4" height="5" fill="#a16207" />
          <rect x="66" y="93" width="12" height="3" rx="1" fill="#78350f" />
        </g>
      );
    case "guitar":
      return (
        <g transform="rotate(-55 72 89)" stroke="#451a03" strokeWidth="0.8">
          <rect x="70.5" y="58" width="3" height="26" fill="#78350f" />
          <ellipse cx="72" cy="92" rx="7" ry="8" fill="#f97316" />
          <ellipse cx="72" cy="86" rx="5" ry="5" fill="#f97316" />
          <circle cx="72" cy="89" r="2" fill="#451a03" />
          <rect x="69.5" y="55" width="5" height="4" rx="1" fill="#451a03" />
        </g>
      );
    case "pickaxe":
      return (
        <g className="chr-swing">
          <rect x="71" y="62" width="3" height="32" fill="#78350f" stroke="#451a03" strokeWidth="0.6" transform="rotate(-30 72 89)" />
          <path d="M54 60 Q66 50 80 56 L78 60 Q66 56 56 64 Z" fill={`url(#${uid}metal)`} stroke="#475569" strokeWidth="0.8" transform="rotate(-30 72 89)" />
        </g>
      );
    default:
      return null;
  }
}

function Pet({ kind }: { kind: string }) {
  return (
    <g className="chr-pet">
      {kind === "chick" && (
        <g stroke="#a16207" strokeWidth="1">
          <circle cx="13" cy="104" r="7" fill="#fde047" />
          <path d="M9 103 Q13 101 15 104" fill="none" stroke="#eab308" />
          <circle cx="11" cy="102" r="1.2" fill="#0f172a" stroke="none" />
          <path d="M5 104 L1 105 L5 106 Z" fill="#f97316" />
        </g>
      )}
      {kind === "cat" && (
        <g stroke="#92400e" strokeWidth="1" strokeLinejoin="round">
          <path d="M21 106 Q27 100 24 96" fill="none" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" />
          <ellipse cx="13" cy="106" rx="8" ry="6" fill="#f59e0b" />
          <path d="M8.5 95 L9 89.5 L12 93.5 Z M17.5 95 L17 89.5 L14 93.5 Z" fill="#f59e0b" />
          <circle cx="13" cy="98" r="5.5" fill="#f59e0b" />
          <circle cx="11" cy="98" r="0.9" fill="#0f172a" stroke="none" />
          <circle cx="15" cy="98" r="0.9" fill="#0f172a" stroke="none" />
          <path d="M12 100.5 Q13 101.3 14 100.5" fill="none" />
        </g>
      )}
      {kind === "drone" && (
        <g>
          <rect x="6" y="84" width="16" height="7" rx="3" fill="#334155" stroke="#0f172a" strokeWidth="1" />
          <circle cx="14" cy="87.5" r="2" fill="#22d3ee" />
          <rect className="chr-prop" x="2" y="81" width="10" height="1.6" rx="0.8" fill="#94a3b8" />
          <rect className="chr-prop" x="16" y="81" width="10" height="1.6" rx="0.8" fill="#94a3b8" />
        </g>
      )}
      {kind === "dragon" && (
        <g stroke="#14532d" strokeWidth="1" strokeLinejoin="round">
          <path d="M14 98 L22 90 L20 100 Z" fill="#15803d" className="chr-wings" />
          <ellipse cx="14" cy="104" rx="9" ry="6.5" fill="#22c55e" />
          <circle cx="8" cy="96" r="5.5" fill="#22c55e" />
          <circle cx="6.5" cy="95" r="1" fill="#0f172a" stroke="none" />
          <path d="M2 97 Q-2 95 0 92" fill="none" stroke="#f97316" strokeWidth="1.5" className="chr-flame" />
        </g>
      )}
    </g>
  );
}

export const CharacterSvg = memo(CharacterSvgImpl);
