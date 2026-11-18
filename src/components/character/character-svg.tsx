"use client";

import { memo, useId } from "react";
import { DEFAULT_LOOK, OUTFIT_COLORS, tierOf, type GameLook } from "@/lib/character/catalog";
import { cn } from "@/lib/utils";

// O'quvchi personaji (SVG): har qism alohida chiziladi, animatsiyalar CSS da (globals.css → .chr-*).
// Daraja oshgani sari: tagidagi supa materiali o'zgaradi, 4+ darajada aura, 7+ da aylanuvchi nurlar,
// 10-darajada atrofida yulduzlar aylanadi. "Kuch" upgrade — uchqunlar va yorqinlik.

export type CharMood = "idle" | "run" | "jump" | "cheer" | "sad" | "work" | "fly";

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
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
};

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
}

function CharacterSvgImpl({ look: raw, size = 96, mood = "idle", pedestal = true, holding = null, className, title, still = false, headOnly = false, gaze = null }: CharacterSvgProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const look = { ...DEFAULT_LOOK, color: 0, level: 1, ...(raw ?? {}) } as GameLook;
  const skin = SKIN[look.skin] ?? SKIN.peach;
  const skinDark = shade(skin, 0.82);
  const main = OUTFIT_COLORS[look.color % OUTFIT_COLORS.length] ?? OUTFIT_COLORS[0];
  const tier = tierOf(look.level);
  const hairColor = look.hair === "fire" ? `url(#${uid}fire)` : look.skin === "galaxy" ? "#1e1b4b" : "#3b2314";
  const anim = !still;
  const sad = mood === "sad";
  const cheer = mood === "cheer";
  const power = Math.max(0, Math.min(5, look.power ?? 0));

  // Kiyim ranglari
  const outfit = (() => {
    switch (look.outfit) {
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
        return { body: main, trim: shade(main, 0.8), legs: "#1e40af" };
    }
  })();

  const vb = headOnly ? "12 -8 76 78" : "0 0 100 124";

  return (
    <svg
      viewBox={vb}
      width={size}
      height={headOnly ? size : typeof size === "number" ? size * 1.24 : size}
      className={cn("chr overflow-visible", anim && `chr-anim chr-${mood}`, className)}
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
          <stop offset="0%" stopColor={tier.light} />
          <stop offset="100%" stopColor={tier.base} />
        </linearGradient>
        <linearGradient id={`${uid}fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="60%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#fef08a" />
        </linearGradient>
        <linearGradient id={`${uid}galaxy`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>
        <linearGradient id={`${uid}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      {title && <title>{title}</title>}

      {/* ---- Daraja: aura, nurlar, supa ---- */}
      {!headOnly && (look.level >= 4 || power > 0) && <circle cx="50" cy="62" r="48" fill={`url(#${uid}aura)`} className={anim ? "chr-pulse" : undefined} />}
      {!headOnly && look.level >= 7 && (
        <g className={anim ? "chr-spin" : undefined} opacity={0.55}>
          <circle cx="50" cy="62" r="45" fill="none" stroke={tier.light} strokeWidth="1.6" strokeDasharray="3 6" />
          <circle cx="50" cy="62" r="40" fill="none" stroke={tier.light} strokeWidth="0.8" strokeDasharray="10 5" opacity={0.6} />
        </g>
      )}
      {!headOnly && pedestal && (
        <g>
          <ellipse cx="50" cy="116" rx="30" ry="6.5" fill={tier.base} />
          <ellipse cx="50" cy="113.5" rx="30" ry="6.5" fill={`url(#${uid}ped)`} />
          {look.level >= 5 && <ellipse cx="50" cy="113.5" rx="22" ry="3.5" fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={0.8} />}
        </g>
      )}
      {!headOnly && !pedestal && <ellipse cx="50" cy="114" rx="18" ry="3.5" fill="#000" opacity={0.25} className={anim ? "chr-shadow" : undefined} />}

      <g className="chr-body">
        {/* ---- Orqadagi narsalar ---- */}
        {!headOnly && look.back === "cape" && <path className="chr-cape" d="M35 66 Q50 61 65 66 L73 106 Q50 113 27 106 Z" fill="#dc2626" stroke="#991b1b" strokeWidth="1.2" />}
        {!headOnly && look.back === "wings" && (
          <g className="chr-wings" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1">
            <path d="M36 70 C18 56 4 62 6 74 C14 72 18 80 10 86 C22 88 30 82 36 78 Z" />
            <path d="M64 70 C82 56 96 62 94 74 C86 72 82 80 90 86 C78 88 70 82 64 78 Z" />
          </g>
        )}
        {!headOnly && look.back === "dragon" && (
          <g className="chr-wings" fill="#7c3aed" stroke="#4c1d95" strokeWidth="1.2">
            <path d="M36 70 L6 54 L12 70 L2 76 L14 80 L8 90 L36 80 Z" />
            <path d="M64 70 L94 54 L88 70 L98 76 L86 80 L92 90 L64 80 Z" />
          </g>
        )}
        {!headOnly && look.back === "jetpack" && (
          <g>
            <rect x="27" y="66" width="10" height="24" rx="4" fill="#64748b" />
            <rect x="63" y="66" width="10" height="24" rx="4" fill="#64748b" />
            <path className="chr-flame" d="M28 90 Q32 104 36 90 Z M64 90 Q68 104 72 90 Z" fill="#f97316" />
          </g>
        )}
        {!headOnly && look.back === "backpack" && <rect x="29" y="64" width="42" height="28" rx="9" fill="#92400e" />}

        {/* ---- Oyoqlar ---- */}
        {!headOnly && (
          <g>
            <g className="chr-leg-l">
              <rect x="39" y="92" width="9" height="15" rx="4" fill={outfit.legs} />
              <ellipse cx="43" cy="108" rx="6.5" ry="3.6" fill="#0f172a" />
            </g>
            <g className="chr-leg-r">
              <rect x="52" y="92" width="9" height="15" rx="4" fill={outfit.legs} />
              <ellipse cx="57" cy="108" rx="6.5" ry="3.6" fill="#0f172a" />
            </g>
          </g>
        )}

        {/* ---- Tana va kiyim ---- */}
        {!headOnly && (
          <g>
            <rect x="31" y="61" width="38" height="35" rx="13" fill={outfit.body} />
            {look.outfit === "tee" && <path d="M42 62 Q50 68 58 62" fill="none" stroke={outfit.trim} strokeWidth="2" />}
            {look.outfit === "hoodie" && (
              <g>
                <path d="M38 62 Q50 72 62 62" fill="none" stroke={outfit.trim} strokeWidth="3" />
                <rect x="40" y="80" width="20" height="9" rx="4" fill={outfit.trim} />
                <line x1="46" y1="66" x2="46" y2="74" stroke="#fff" strokeWidth="1.2" />
                <line x1="54" y1="66" x2="54" y2="74" stroke="#fff" strokeWidth="1.2" />
              </g>
            )}
            {look.outfit === "school" && (
              <g>
                <path d="M41 61 L50 72 L59 61 Z" fill="#f8fafc" />
                <path d="M48 66 L50 80 L52 66 Z" fill="#dc2626" />
              </g>
            )}
            {look.outfit === "ninja" && <rect x="31" y="78" width="38" height="5" fill={outfit.trim} />}
            {look.outfit === "armor" && (
              <g>
                <path d="M34 66 Q50 60 66 66 L64 84 Q50 90 36 84 Z" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.2" />
                <path d="M50 64 L50 88" stroke="#64748b" strokeWidth="1.2" />
                <circle cx="50" cy="74" r="4" fill="#facc15" stroke="#a16207" strokeWidth="1" />
              </g>
            )}
            {look.outfit === "space" && (
              <g>
                <rect x="40" y="70" width="20" height="12" rx="3" fill="#cbd5e1" />
                <circle cx="45" cy="76" r="2" fill="#ef4444" />
                <circle cx="51" cy="76" r="2" fill="#22c55e" />
                <circle cx="56" cy="76" r="2" fill="#3b82f6" />
                <rect x="31" y="86" width="38" height="4" fill={outfit.trim} />
              </g>
            )}
            {look.outfit === "hero" && (
              <g>
                <path d="M42 70 L50 66 L58 70 L50 84 Z" fill={outfit.trim} />
                <path d="M47 72 L53 72 L50 79 Z" fill={outfit.body} />
                <rect x="31" y="86" width="38" height="4" fill={outfit.trim} />
              </g>
            )}
            {look.outfit === "royal" && (
              <g>
                <path d="M31 70 Q50 64 69 70" fill="none" stroke="#fef3c7" strokeWidth="5" strokeDasharray="1.5 2.5" />
                <rect x="47" y="64" width="6" height="30" fill={outfit.trim} />
                <circle cx="50" cy="74" r="3.5" fill="#ef4444" stroke={outfit.trim} />
              </g>
            )}
          </g>
        )}

        {/* ---- Qo'llar ---- */}
        {!headOnly && (
          <g>
            <g className="chr-arm-l">
              <rect x="23" y="64" width="10" height="24" rx="5" fill={outfit.body} />
              <circle cx="28" cy="89" r="5" fill={skin} />
            </g>
            <g className="chr-arm-r">
              <rect x="67" y="64" width="10" height="24" rx="5" fill={outfit.body} />
              <circle cx="72" cy="89" r="5" fill={skin} />
              <HandItem kind={holding ?? look.hand} uid={uid} />
            </g>
          </g>
        )}

        {/* ---- Bosh ---- */}
        <g className={cn("chr-head", sad && "chr-head-sad")} transform={gaze ? `rotate(${(gaze.x * 5).toFixed(1)} 50 60)` : undefined}>
          <circle cx="27.5" cy="40" r="5" fill={skinDark} />
          <circle cx="72.5" cy="40" r="5" fill={skinDark} />
          <circle cx="50" cy="38" r="23" fill={look.skin === "galaxy" ? `url(#${uid}galaxy)` : look.skin === "gold" ? `url(#${uid}gold)` : skin} />
          {look.skin === "galaxy" && (
            <g fill="#fff" opacity={0.8}>
              <circle cx="40" cy="26" r="0.9" />
              <circle cx="62" cy="30" r="0.7" />
              <circle cx="56" cy="52" r="0.8" />
            </g>
          )}
          {/* Soch (bosh kiyimi bo'lsa ham ko'rinadigan qismi) */}
          <Hair style={look.hair} color={hairColor} hidden={look.head === "astro" || look.head === "helmet"} />
          {/* Yuz */}
          <circle cx="37" cy="47" r="3.6" fill="#fb7185" opacity={0.35} />
          <circle cx="63" cy="47" r="3.6" fill="#fb7185" opacity={0.35} />
          <g transform={gaze ? `translate(${(gaze.x * 2.6).toFixed(2)} ${(gaze.y * 1.8).toFixed(2)})` : undefined}>
            <Eyes kind={look.eyes} sad={sad} happy={cheer} />
          </g>
          <Mouth kind={look.mouth} sad={sad} happy={cheer} />
          <HeadItem kind={look.head} main={main} uid={uid} />
        </g>
      </g>

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

function Hair({ style, color, hidden }: { style: string; color: string; hidden: boolean }) {
  if (hidden) return null;
  switch (style) {
    case "side":
      return <path d="M27 36 Q28 14 50 14 Q72 14 73 34 Q60 22 40 30 Q32 33 27 36 Z" fill={color} />;
    case "long":
      return <path d="M26 44 Q24 14 50 14 Q76 14 74 44 L76 62 Q70 54 70 36 Q60 24 50 26 Q40 24 30 36 Q30 54 24 62 Z" fill={color} />;
    case "bun":
      return (
        <g fill={color}>
          <circle cx="50" cy="12" r="7" />
          <path d="M27 34 Q28 15 50 15 Q72 15 73 34 Q62 24 50 24 Q38 24 27 34 Z" />
        </g>
      );
    case "spiky":
      return <path d="M27 34 L28 20 L34 24 L37 12 L43 20 L50 9 L56 20 L63 12 L66 24 L72 20 L73 34 Q60 24 50 25 Q40 24 27 34 Z" fill={color} />;
    case "curly":
      return (
        <g fill={color}>
          {[30, 37, 44, 51, 58, 65, 70].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 18 : 22} r="7" />
          ))}
        </g>
      );
    case "mohawk":
      return <path d="M44 26 L46 4 L50 2 L54 4 L56 26 Z" fill={color === "#3b2314" ? "#ec4899" : color} />;
    case "fire":
      return <path className="chr-flame" d="M27 34 Q26 18 34 10 Q36 18 40 16 Q42 4 50 0 Q54 10 58 8 Q62 14 64 10 Q74 20 73 34 Q62 24 50 25 Q38 24 27 34 Z" fill={color} />;
    default:
      return <path d="M27 34 Q28 15 50 15 Q72 15 73 34 Q66 26 58 27 Q52 20 46 26 Q36 24 27 34 Z" fill={color} />;
  }
}

function Eyes({ kind, sad, happy }: { kind: string; sad: boolean; happy: boolean }) {
  if (kind === "shades")
    return (
      <g>
        <rect x="33" y="35" width="14" height="9" rx="3" fill="#0f172a" />
        <rect x="53" y="35" width="14" height="9" rx="3" fill="#0f172a" />
        <line x1="47" y1="38" x2="53" y2="38" stroke="#0f172a" strokeWidth="2" />
        <line x1="36" y1="37" x2="40" y2="37" stroke="#fff" strokeWidth="1.2" opacity={0.6} />
      </g>
    );
  if (kind === "visor")
    return (
      <g>
        <rect x="29" y="33" width="42" height="11" rx="5.5" fill="#0e7490" />
        <rect x="31" y="35" width="38" height="3" rx="1.5" fill="#67e8f9" className="chr-scan" />
      </g>
    );
  if (happy || kind === "happy")
    return (
      <g fill="none" stroke="#0f172a" strokeWidth="2.6" strokeLinecap="round">
        <path d="M36 41 Q40 36 44 41" />
        <path d="M56 41 Q60 36 64 41" />
      </g>
    );
  if (sad)
    return (
      <g fill="none" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round">
        <path d="M36 38 Q40 42 44 40" />
        <path d="M56 40 Q60 42 64 38" />
      </g>
    );
  if (kind === "star")
    return (
      <g fill="#facc15" stroke="#a16207" strokeWidth="0.8" className="chr-blink">
        <path d="M40 34 L41.6 38.5 L46 38.6 L42.5 41.3 L43.8 45.6 L40 43 L36.2 45.6 L37.5 41.3 L34 38.6 L38.4 38.5 Z" />
        <path d="M60 34 L61.6 38.5 L66 38.6 L62.5 41.3 L63.8 45.6 L60 43 L56.2 45.6 L57.5 41.3 L54 38.6 L58.4 38.5 Z" />
      </g>
    );
  if (kind === "fire")
    return (
      <g className="chr-blink">
        <ellipse cx="40" cy="40" rx="4" ry="5" fill="#f97316" />
        <ellipse cx="60" cy="40" rx="4" ry="5" fill="#f97316" />
        <circle cx="40" cy="40" r="2" fill="#fef08a" />
        <circle cx="60" cy="40" r="2" fill="#fef08a" />
      </g>
    );
  if (kind === "wink")
    return (
      <g>
        <g className="chr-blink">
          <ellipse cx="40" cy="40" rx="3.4" ry="4.4" fill="#0f172a" />
          <circle cx="41.2" cy="38.6" r="1.2" fill="#fff" />
        </g>
        <path d="M56 41 Q60 37 64 41" fill="none" stroke="#0f172a" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    );
  return (
    <g className="chr-blink">
      <ellipse cx="40" cy="40" rx="3.4" ry="4.4" fill="#0f172a" />
      <ellipse cx="60" cy="40" rx="3.4" ry="4.4" fill="#0f172a" />
      <circle cx="41.2" cy="38.6" r="1.2" fill="#fff" />
      <circle cx="61.2" cy="38.6" r="1.2" fill="#fff" />
    </g>
  );
}

function Mouth({ kind, sad, happy }: { kind: string; sad: boolean; happy: boolean }) {
  if (kind === "mask") return <path d="M30 44 Q50 42 70 44 L68 56 Q50 62 32 56 Z" fill="#1f2937" />;
  if (sad) return <path d="M44 54 Q50 49 56 54" fill="none" stroke="#7f1d1d" strokeWidth="2.4" strokeLinecap="round" />;
  if (happy || kind === "grin")
    return (
      <g>
        <path d="M42 49 Q50 59 58 49 Z" fill="#7f1d1d" />
        <path d="M44 50 Q50 52 56 50" fill="#fff" />
      </g>
    );
  if (kind === "open") return <ellipse cx="50" cy="52" rx="3.5" ry="4" fill="#7f1d1d" />;
  if (kind === "tongue")
    return (
      <g>
        <path d="M43 50 Q50 56 57 50" fill="none" stroke="#7f1d1d" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M48 53 Q50 59 53 53 Z" fill="#fb7185" />
      </g>
    );
  if (kind === "smirk") return <path d="M44 52 Q52 55 58 48" fill="none" stroke="#7f1d1d" strokeWidth="2.4" strokeLinecap="round" />;
  return <path d="M43 50 Q50 56 57 50" fill="none" stroke="#7f1d1d" strokeWidth="2.4" strokeLinecap="round" />;
}

function HeadItem({ kind, main, uid }: { kind: string; main: string; uid: string }) {
  switch (kind) {
    case "cap":
      return (
        <g>
          <path d="M28 30 Q30 12 50 12 Q70 12 72 30 Z" fill={main} />
          <path d="M50 28 Q70 26 84 32 Q72 34 56 32 Z" fill={shade(main, 0.75)} />
          <circle cx="50" cy="13" r="2" fill={shade(main, 0.7)} />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M28 30 Q28 12 50 12 Q72 12 72 30 Z" fill="#0f766e" />
          <path d="M30 26 Q50 18 70 26" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeDasharray="2 2" />
          <rect x="27" y="28" width="46" height="4" rx="2" fill="#134e4a" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M26 38 Q26 10 50 10 Q74 10 74 38" fill="none" stroke="#1f2937" strokeWidth="4" />
          <rect x="21" y="34" width="9" height="14" rx="4" fill="#ef4444" />
          <rect x="70" y="34" width="9" height="14" rx="4" fill="#ef4444" />
        </g>
      );
    case "band":
      return (
        <g>
          <rect x="26" y="24" width="48" height="7" rx="3" fill="#dc2626" />
          <path d="M74 27 L86 22 L84 30 Z M74 28 L86 34 L80 36 Z" fill="#dc2626" />
          <circle cx="50" cy="27.5" r="2.6" fill="#f8fafc" />
        </g>
      );
    case "helmet":
      return (
        <g>
          <path d="M25 40 Q24 12 50 12 Q76 12 75 40 L75 48 L66 48 L66 40 L34 40 L34 48 L25 48 Z" fill="#94a3b8" stroke="#475569" strokeWidth="1.2" />
          <path d="M50 4 Q56 8 54 14 L46 14 Q44 8 50 4 Z" fill="#dc2626" />
          <rect x="34" y="34" width="32" height="3" fill="#475569" />
        </g>
      );
    case "wizard":
      return (
        <g>
          <path d="M24 30 Q50 22 76 30 L70 32 Q50 26 30 32 Z" fill="#4c1d95" />
          <path d="M32 29 L52 -8 L68 29 Z" fill="#6d28d9" />
          <path d="M45 14 L47 18 L51 18 L48 21 L49 25 L45 22 L41 25 L42 21 L39 18 L43 18 Z" fill="#facc15" className="chr-twinkle" />
        </g>
      );
    case "astro":
      return (
        <g>
          <circle cx="50" cy="38" r="28" fill="#e0f2fe" fillOpacity={0.25} stroke="#e2e8f0" strokeWidth="3" />
          <path d="M32 24 Q40 16 50 15" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity={0.8} />
          <rect x="44" y="62" width="12" height="4" rx="2" fill="#cbd5e1" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M31 24 L33 6 L41 15 L50 2 L59 15 L67 6 L69 24 Z" fill={`url(#${uid}gold)`} stroke="#a16207" strokeWidth="1" />
          <circle cx="50" cy="16" r="2.6" fill="#ef4444" />
          <circle cx="39" cy="19" r="1.8" fill="#3b82f6" />
          <circle cx="61" cy="19" r="1.8" fill="#22c55e" />
        </g>
      );
    case "halo":
      return <ellipse className="chr-halo" cx="50" cy="6" rx="16" ry="4.5" fill="none" stroke="#fde047" strokeWidth="3" />;
    default:
      return null;
  }
}

function HandItem({ kind, uid }: { kind: string; uid: string }) {
  switch (kind) {
    case "pencil":
      return (
        <g transform="rotate(-25 72 89)">
          <rect x="70" y="70" width="4.5" height="22" fill="#facc15" />
          <path d="M70 92 L72.25 97 L74.5 92 Z" fill="#fcd9b8" />
          <rect x="70" y="68" width="4.5" height="3" fill="#f472b6" />
        </g>
      );
    case "book":
      return (
        <g>
          <rect x="66" y="80" width="15" height="18" rx="1.5" fill="#2563eb" />
          <rect x="68" y="82" width="11" height="2" fill="#bfdbfe" />
        </g>
      );
    case "laptop":
      return (
        <g>
          <rect x="62" y="80" width="22" height="14" rx="2" fill="#334155" />
          <rect x="64" y="82" width="18" height="10" rx="1" fill="#22d3ee" className="chr-scan" />
          <rect x="60" y="94" width="26" height="3" rx="1.5" fill="#475569" />
        </g>
      );
    case "sword":
      return (
        <g transform="rotate(-20 72 89)">
          <rect x="70.5" y="56" width="4" height="30" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.6" />
          <rect x="65" y="85" width="15" height="3" rx="1.5" fill="#a16207" />
          <rect x="71" y="88" width="3" height="7" fill="#78350f" />
        </g>
      );
    case "wand":
      return (
        <g transform="rotate(-25 72 89)">
          <rect x="71" y="68" width="2.6" height="24" fill="#78350f" />
          <path className="chr-twinkle" d="M72.3 60 L74 65 L79 65.5 L75 68.5 L76.4 73.5 L72.3 70.6 L68.2 73.5 L69.6 68.5 L65.6 65.5 L70.6 65 Z" fill="#fde047" />
        </g>
      );
    case "trophy":
      return (
        <g>
          <path d="M64 74 L80 74 L78 86 Q72 90 66 86 Z" fill={`url(#${uid}gold)`} stroke="#a16207" strokeWidth="0.8" />
          <rect x="70" y="88" width="4" height="5" fill="#a16207" />
          <rect x="66" y="93" width="12" height="3" rx="1" fill="#78350f" />
        </g>
      );
    case "pickaxe":
      return (
        <g className="chr-swing">
          <rect x="71" y="62" width="3" height="32" fill="#78350f" transform="rotate(-30 72 89)" />
          <path d="M54 60 Q66 50 80 56 L78 60 Q66 56 56 64 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.8" transform="rotate(-30 72 89)" />
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
        <g>
          <circle cx="13" cy="104" r="7" fill="#fde047" />
          <circle cx="11" cy="102" r="1.2" fill="#0f172a" />
          <path d="M5 104 L1 105 L5 106 Z" fill="#f97316" />
        </g>
      )}
      {kind === "cat" && (
        <g>
          <ellipse cx="13" cy="106" rx="8" ry="6" fill="#f59e0b" />
          <circle cx="13" cy="98" r="5.5" fill="#f59e0b" />
          <path d="M8.5 95 L9 90 L12 94 Z M17.5 95 L17 90 L14 94 Z" fill="#f59e0b" />
          <circle cx="11" cy="98" r="0.9" fill="#0f172a" />
          <circle cx="15" cy="98" r="0.9" fill="#0f172a" />
          <path d="M21 106 Q27 100 24 96" fill="none" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {kind === "drone" && (
        <g>
          <rect x="6" y="84" width="16" height="7" rx="3" fill="#334155" />
          <circle cx="14" cy="87.5" r="2" fill="#22d3ee" />
          <rect className="chr-prop" x="2" y="81" width="10" height="1.6" rx="0.8" fill="#94a3b8" />
          <rect className="chr-prop" x="16" y="81" width="10" height="1.6" rx="0.8" fill="#94a3b8" />
        </g>
      )}
      {kind === "dragon" && (
        <g>
          <ellipse cx="14" cy="104" rx="9" ry="6.5" fill="#22c55e" />
          <circle cx="8" cy="96" r="5.5" fill="#22c55e" />
          <path d="M14 98 L22 90 L20 100 Z" fill="#15803d" className="chr-wings" />
          <circle cx="6.5" cy="95" r="1" fill="#0f172a" />
          <path d="M2 97 Q-2 95 0 92" fill="none" stroke="#f97316" strokeWidth="1.5" className="chr-flame" />
        </g>
      )}
    </g>
  );
}

export const CharacterSvg = memo(CharacterSvgImpl);
