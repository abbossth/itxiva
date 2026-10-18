"use client";

import { useSyncExternalStore } from "react";
import { Leaf } from "lucide-react";
import type { Holiday, Season } from "@/lib/ambience";

// Fasl va bayram bezaklari header'da: oz sonli, sekin harakatlanadigan zarrachalar. Joylashuvi tasodifiy emas —
// indeksdan hisoblanadi (har ochilishda bir xil, server va brauzer farqi yo'q). Faqat brauzerda chiziladi va
// "harakatni kamaytirish" yoqilgan bo'lsa umuman chiqmaydi.

function rnd(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const noop = () => () => {};
function useMotionAllowed(): boolean {
  return useSyncExternalStore(
    noop,
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

function Snow({ count = 16 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const size = 2 + Math.round(rnd(i, 1) * 3);
        return (
          <span
            key={`s${i}`}
            className="amb-fall absolute top-0 rounded-full bg-sky-300 shadow-[0_0_3px_rgba(125,211,252,0.7)] dark:bg-white dark:shadow-[0_0_4px_rgba(255,255,255,0.8)]"
            style={
              {
                left: `${rnd(i, 2) * 100}%`,
                width: size,
                height: size,
                opacity: 0.45 + rnd(i, 3) * 0.45,
                animationDuration: `${7 + rnd(i, 4) * 7}s`,
                animationDelay: `${-rnd(i, 5) * 12}s`,
                "--dx": `${(rnd(i, 6) - 0.5) * 50}px`,
                "--rot": "0deg",
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

function Rain({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`r${i}`}
          className="amb-fall absolute top-0 h-3 w-px rounded-full bg-gradient-to-b from-transparent to-sky-400/70 dark:to-sky-300/60"
          style={
            {
              left: `${rnd(i, 7) * 100}%`,
              animationDuration: `${1.4 + rnd(i, 8) * 1.2}s`,
              animationDelay: `${-rnd(i, 9) * 3}s`,
              animationTimingFunction: "linear",
              "--dx": "-14px",
              "--rot": "0deg",
              rotate: "8deg",
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

function Petals({ count = 6, colors = ["#f9a8d4", "#fbcfe8", "#fda4af"] }: { count?: number; colors?: string[] }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`p${i}`}
          className="amb-fall absolute top-0 h-[5px] w-[8px] rounded-[60%_10%_60%_10%]"
          style={
            {
              left: `${rnd(i, 10) * 100}%`,
              background: colors[i % colors.length],
              opacity: 0.85,
              animationDuration: `${9 + rnd(i, 11) * 6}s`,
              animationDelay: `${-rnd(i, 12) * 14}s`,
              "--dx": `${(rnd(i, 13) - 0.3) * 90}px`,
              "--rot": `${180 + rnd(i, 14) * 360}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

function SunGlints({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`g${i}`}
          className="amb-rise absolute rounded-full bg-amber-300 shadow-[0_0_6px_2px_rgba(252,211,77,0.55)]"
          style={
            {
              left: `${rnd(i, 15) * 100}%`,
              top: `${30 + rnd(i, 16) * 40}%`,
              width: 3,
              height: 3,
              animationDuration: `${5 + rnd(i, 17) * 5}s`,
              animationDelay: `${-rnd(i, 18) * 9}s`,
              "--o": String(0.5 + rnd(i, 19) * 0.4),
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

const LEAF_COLORS = ["#f59e0b", "#ea580c", "#eab308", "#d97706", "#b45309"];
function Leaves({ count = 9 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`l${i}`}
          className="amb-fall absolute top-0"
          style={
            {
              left: `${rnd(i, 20) * 100}%`,
              color: LEAF_COLORS[i % LEAF_COLORS.length],
              opacity: 0.85,
              animationDuration: `${9 + rnd(i, 21) * 7}s`,
              animationDelay: `${-rnd(i, 22) * 15}s`,
              "--dx": `${(rnd(i, 23) - 0.4) * 110}px`,
              "--rot": `${(rnd(i, 24) > 0.5 ? 1 : -1) * (200 + rnd(i, 25) * 300)}deg`,
            } as React.CSSProperties
          }
        >
          <Leaf className="fill-current" style={{ width: 9 + rnd(i, 26) * 6, height: 9 + rnd(i, 26) * 6 }} strokeWidth={1.5} />
        </span>
      ))}
    </>
  );
}

const BULB_COLORS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc"];
/** Yangi yil: header ostida chiroqlar gulchambari */
function Garland() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-[5px] flex justify-around px-4">
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="amb-bulb h-[7px] w-[5px] rounded-full"
          style={{ background: BULB_COLORS[i % BULB_COLORS.length], color: BULB_COLORS[i % BULB_COLORS.length], animationDelay: `${(i % 5) * 0.35}s` }}
        />
      ))}
    </span>
  );
}

/** Header ichida: fasl yoki bayram effekti */
export function HeaderAmbience({ season, holiday }: { season: Season | null; holiday: Holiday }) {
  const allowed = useMotionAllowed();
  if (!allowed || (!season && !holiday)) return null;

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      >
        {(season === "winter" || holiday === "newyear") && <Snow count={holiday === "newyear" ? 20 : 16} />}
        {season === "spring" && (
          <>
            <Rain />
            <Petals />
          </>
        )}
        {holiday === "navruz" && <Petals count={10} colors={["#f9a8d4", "#ffffff", "#86efac", "#fbcfe8"]} />}
        {season === "summer" && <SunGlints />}
        {season === "autumn" && <Leaves />}
      </span>
      {holiday === "newyear" && <Garland />}
    </>
  );
}
