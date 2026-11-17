"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Omad g'ildiragi (o'yin ichida) va Super baraban (o'yin oxirida) uchun umumiy g'ildirak:
// oltin halqa va miltillovchi chiroqlar, segment belgilari, aylanayotganda titraydigan ko'rsatkich.
// Natija serverda tanlanadi — g'ildirak shu segmentga to'xtaydi (ko'rsatkich tepada).

export interface WheelSegment {
  label: string;
  icon?: string;
  color: string;
}

export const WHEEL_SPIN_MS = 5000;
const px = (v: number) => Math.round(v * 10) / 10;
const BULBS = 18;

export function PrizeWheel({
  segments,
  segment,
  spinning,
  size = 320,
  onDone,
  center,
}: {
  segments: WheelSegment[];
  /** To'xtaydigan segment (spinning true bo'lganda) */
  segment: number;
  spinning: boolean;
  size?: number;
  onDone?: () => void;
  center?: React.ReactNode;
}) {
  const n = segments.length;
  const slice = 360 / n;
  // Segment o'rtasiga emas, biroz siljigan joyga: har safar bir xil ko'rinmasin
  const [jitter] = useState(() => (Math.random() - 0.5) * 0.5);
  const target = 360 * 7 + (360 - (segment * slice + slice / 2 + jitter * slice));
  const gradient = segments.map((w, i) => `${w.color} ${i * slice}deg ${(i + 1) * slice}deg`).join(", ");
  const [turn, setTurn] = useState(0);
  const [moving, setMoving] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!spinning) return;
    const start = setTimeout(() => {
      setTurn(target);
      setMoving(true);
    }, 50);
    const stop = setTimeout(() => {
      setMoving(false);
      done.current?.();
    }, WHEEL_SPIN_MS + 100);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [spinning, target]);

  const ring = px(Math.max(10, size * 0.05));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Ko'rsatkich */}
      <div
        className={cn("absolute left-1/2 z-20 -translate-x-1/2 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]", moving && "live-pointer")}
        style={{ top: px(-ring * 0.9), transformOrigin: "50% 20%" }}
      >
        <div
          className="h-0 w-0 border-x-transparent border-t-amber-300"
          style={{ borderLeftWidth: px(size * 0.055), borderRightWidth: px(size * 0.055), borderTopWidth: px(size * 0.1) }}
        />
      </div>

      {/* Oltin halqa va chiroqlar */}
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200 via-amber-500 to-amber-700 shadow-[0_0_70px_rgba(251,191,36,0.45)]"
      />
      {Array.from({ length: BULBS }, (_, i) => {
        const a = (i / BULBS) * Math.PI * 2;
        const r = size / 2 - ring / 2;
        return (
          <span
            key={i}
            className="live-bulb absolute z-10 rounded-full bg-yellow-100"
            style={{
              // Yaxlitlanadi: server va brauzerda kasr son bir xil yozilsin (hydration)
              width: px(ring * 0.42),
              height: px(ring * 0.42),
              left: px(size / 2 + Math.cos(a) * r - ring * 0.21),
              top: px(size / 2 + Math.sin(a) * r - ring * 0.21),
              animationDelay: `${(i % 2) * 0.45}s`,
            }}
          />
        );
      })}

      {/* Disk */}
      <div className="absolute rounded-full overflow-hidden" style={{ inset: ring }}>
        <div
          className="relative h-full w-full rounded-full"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${turn}deg)`,
            transition: `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.1, 1)`,
          }}
        >
          {/* Segment chegaralari */}
          {segments.map((_, i) => (
            <span
              key={`l${i}`}
              className="absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2 bg-white/50"
              style={{ transform: `rotate(${i * slice}deg)`, transformOrigin: "50% 100%" }}
            />
          ))}
          {/* Belgi va yozuv: segment o'rtasida, markazdan tashqariga qarab tik turadi */}
          {segments.map((w, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 flex flex-col items-center font-black leading-none text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]"
              style={{
                transform: `translate(-50%, -50%) rotate(${i * slice + slice / 2}deg) translateY(${px(-(size - ring * 2) * 0.33)}px)`,
                fontSize: px(size * (n > 8 ? 0.06 : 0.048)),
              }}
            >
              {w.icon && <span style={{ fontSize: px(size * (n > 8 ? 0.06 : 0.075)) }}>{w.icon}</span>}
              <span className="mt-0.5 whitespace-nowrap">{w.label}</span>
            </span>
          ))}
          {/* Yaltirash */}
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        </div>
      </div>

      {/* Markaz */}
      <div
        className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-amber-300 bg-gradient-to-br from-slate-800 to-slate-950 font-black text-amber-300 shadow-xl"
        style={{ width: px(size * 0.22), height: px(size * 0.22), fontSize: px(size * 0.06) }}
      >
        {center ?? "★"}
      </div>
    </div>
  );
}
