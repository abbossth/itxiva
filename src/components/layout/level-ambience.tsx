import { levelColor } from "@/components/gamification/level-badge";
import { levelGlowStrength } from "@/lib/ambience";

// O'quvchi darajasi oshgan sari platforma bezagi kuchayadi (minimal): sahifa tepasida daraja rangidagi
// yengil nur, 7-darajadan — sekin suzuvchi uchqunlar. Kontent ortida turadi va bosishga xalaqit bermaydi.

const MOTES = [
  { left: "12%", top: "60px", delay: "0s" },
  { left: "28%", top: "140px", delay: "1.4s" },
  { left: "47%", top: "90px", delay: "2.6s" },
  { left: "66%", top: "170px", delay: "0.8s" },
  { left: "82%", top: "110px", delay: "3.2s" },
  { left: "93%", top: "200px", delay: "2s" },
];

export function LevelBackdrop({ level }: { level: number }) {
  const strength = levelGlowStrength(level);
  if (strength <= 0) return null;
  const color = levelColor(level);
  const motes = level >= 10 ? 6 : level >= 8 ? 4 : level >= 7 ? 3 : 0;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[460px] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(60% 100% at 50% 0%, ${color}, transparent 70%)`, opacity: 0.05 + strength * 0.13 }}
      />
      {MOTES.slice(0, motes).map((m, i) => (
        <span
          key={i}
          className="level-float absolute h-1.5 w-1.5 rounded-full"
          style={{ left: m.left, top: m.top, background: color, boxShadow: `0 0 10px 2px ${color}`, animationDelay: m.delay }}
        />
      ))}
    </div>
  );
}

/** Header ostidagi daraja rangidagi chiziq; 5-darajadan bo'ylab yorug'lik yuradi */
export function LevelHeaderLine({ level }: { level: number }) {
  const strength = levelGlowStrength(level);
  if (strength <= 0) return null;
  const color = levelColor(level);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-[2px] overflow-hidden">
      <span className="absolute inset-0" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.35 + strength * 0.65 }} />
      {level >= 5 && (
        <span className="level-line-glint absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white to-transparent" style={{ opacity: 0.4 + strength * 0.5 }} />
      )}
    </span>
  );
}
