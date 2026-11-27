"use client";

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { GameLook } from "@/lib/character/catalog";
import { CharacterSvgDrawing as CharacterSvg } from "./character-svg";

// Kanvas o'yinlar (Yashil zona, Kiber arena) uchun personaj rasmi: SVG bir marta chizilib, rasmga aylantiriladi va
// keshlanadi. Kanvas har kadrda tayyor rasmni chizadi — tez ishlaydi. Rasm tayyor bo'lguncha `null` (eski robot chiziladi).

const cache = new Map<string, HTMLImageElement | "loading" | "failed">();

function keyOf(look: Partial<GameLook> | null | undefined, headOnly: boolean): string {
  return `${headOnly ? "h" : "b"}:${JSON.stringify(look ?? {})}`;
}

export function characterSprite(look: Partial<GameLook> | null | undefined, headOnly = false): HTMLImageElement | null {
  if (typeof document === "undefined") return null;
  const key = keyOf(look, headOnly);
  const c = cache.get(key);
  if (c instanceof HTMLImageElement) return c;
  if (c) return null;
  cache.set(key, "loading");
  try {
    const host = document.createElement("div");
    const root = createRoot(host);
    flushSync(() => root.render(createElement(CharacterSvg, { look, size: 128, still: true, pedestal: false, headOnly })));
    const svg = host.querySelector("svg");
    if (!svg) throw new Error("svg yo'q");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(svg);
    root.unmount();
    const img = new Image();
    img.decoding = "async";
    img.onload = () => cache.set(key, img);
    img.onerror = () => cache.set(key, "failed");
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  } catch {
    cache.set(key, "failed");
  }
  return null;
}

/**
 * Personajni kanvasga chizish: tik turgan holda, harakat yo'nalishiga qarab ko'zgu aksi, yurganda chayqaladi.
 * (cx, by) — oyoqlar ostidagi nuqta, h — balandlik (px).
 */
export function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  by: number,
  h: number,
  opts: { t: number; moving?: boolean; faceLeft?: boolean; out?: boolean; seed?: number } = { t: 0 }
) {
  const w = h * (100 / 124);
  const seed = opts.seed ?? 0;
  const bob = opts.out ? 0 : opts.moving ? -Math.abs(Math.sin(opts.t * 14 + seed)) * h * 0.06 : Math.sin(opts.t * 2.2 + seed) * h * 0.012;
  const tilt = opts.out ? 0.35 : opts.moving ? Math.sin(opts.t * 14 + seed) * 0.07 : 0;
  ctx.save();
  ctx.translate(cx, by + bob);
  ctx.rotate(tilt);
  if (opts.faceLeft) ctx.scale(-1, 1);
  if (opts.out) ctx.globalAlpha *= 0.45;
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}
