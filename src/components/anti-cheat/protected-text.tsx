"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Himoyalangan matn: savol va variantlar DOM'da matn sifatida emas, canvas'da chiziladi.
// Natijada uni belgilab nusxalab bo'lmaydi, sahifani o'qiydigan AI kengaytmalari matnni ko'rmaydi.
// Shrift o'lchami ota elementdan olinadi (Tailwind sinflari ishlayveradi) va matn `lines` qatordan
// oshsa — `minScale` gacha kichrayadi: uzun savol ekranni buzmaydi.

type Props = {
  text: string;
  /** Eng kichik shrift (px): telefonda matn o'qib bo'lmaydigan darajada kichraymasin */
  minPx?: number;
  /** Shu qatordan oshmaguncha shrift kichrayadi */
  lines?: number;
  /** Eng kichik o'lcham — asl o'lchamning ulushi */
  minScale?: number;
  lineHeight?: number;
  className?: string;
};

/** Matnni berilgan kenglikka qatorlarga bo'ladi (so'z bo'yicha; juda uzun so'z — harf bo'yicha) */
export function wrapText(measure: (s: string) => number, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    const flush = () => {
      out.push(line.replace(/\s+$/, ""));
      line = "";
    };
    for (const tok of para.match(/\s+|\S+/g) ?? []) {
      const space = /^\s+$/.test(tok);
      if (measure(line + tok) <= width) {
        line += tok;
        continue;
      }
      if (space) {
        // Qator oxiridagi bo'shliq keyingi qatorga o'tmaydi
        if (line.trim()) flush();
        continue;
      }
      // So'z sig'madi: yangi qatordan (faqat bo'shliqdan iborat chekinish tashlanadi)
      if (line.trim()) flush();
      else line = "";
      if (measure(tok) <= width) {
        line += tok;
        continue;
      }
      for (const ch of tok) {
        if (line && measure(line + ch) > width) flush();
        line += ch;
      }
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}

/** Kod bo'lagimi: ``` bilan o'ralgan yoki ko'p qatorli va chekinishli — u holda mono shrift (chekinish saqlanadi) */
export function looksLikeCode(text: string): boolean {
  if (text.includes("```")) return true;
  const rows = text.split("\n");
  return rows.length > 1 && rows.some((r) => /^( {2,}|\t)\S/.test(r));
}

export function ProtectedText({ text: raw, lines = 5, minScale = 0.5, minPx = 0, lineHeight = 1.28, className }: Props) {
  const code = looksLikeCode(raw);
  const text = code ? raw.replace(/```[a-zA-Z]*\n?/g, "").replace(/\n$/, "") : raw;
  const wrap = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const host = wrap.current;
    const cv = canvas.current;
    if (!host || !cv) return;
    let raf = 0;

    const draw = () => {
      const width = host.clientWidth;
      const ctx = cv.getContext("2d");
      if (!ctx || width <= 0) return;
      const cs = getComputedStyle(host);
      const base = parseFloat(cs.fontSize) || 16;
      // Kod — mono, oddiy matn — ota elementning shrifti
      const family = code ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : cs.fontFamily;
      const font = (size: number) => `${cs.fontStyle} ${code ? "600" : cs.fontWeight} ${size}px ${family}`;
      const measure = (s: string) => ctx.measureText(s).width;

      // Eng katta o'lcham: `lines` qatorga sig'adigan
      let size = base;
      let rows: string[] = [];
      const floor = Math.min(base, Math.max(base * minScale, minPx));
      for (;;) {
        ctx.font = font(size);
        rows = wrapText(measure, text, width);
        if (rows.length <= lines || size <= floor) break;
        size = Math.max(floor, size - Math.max(0.5, base * 0.04));
      }

      const lh = size * lineHeight;
      const h = Math.ceil(rows.length * lh);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      cv.width = Math.ceil(width * dpr);
      cv.height = Math.ceil(h * dpr);
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, h);
      ctx.font = font(size);
      ctx.fillStyle = cs.color;
      ctx.textBaseline = "middle";
      const align = cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : "left";
      ctx.textAlign = align;
      const x = align === "center" ? width / 2 : align === "right" ? width : 0;
      rows.forEach((row, i) => ctx.fillText(row, x, i * lh + lh / 2));
      setHeight(h);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    draw();
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    // Mavzu (yorug'/qorong'i) almashsa rang qayta olinadi
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", schedule);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", schedule);
    };
  }, [text, code, lines, minScale, minPx, lineHeight]);

  return (
    <span ref={wrap} className={cn("pt-text block w-full", className)} aria-hidden>
      {/* pointer-events: none — bosish tugmaga o'tadi, uzoq bosishda "rasmni saqlash" chiqmaydi */}
      <canvas ref={canvas} className="pointer-events-none block w-full select-none" style={{ height: height ?? "1.3em" }} />
    </span>
  );
}
