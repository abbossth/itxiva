"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";
import { LIVE_MODES } from "@/lib/live-game/modes";
import { MODE_THEMES, themeBackground } from "@/lib/live-game/themes";
import { playModeJingle } from "@/lib/sound";
import { ThemeDecor } from "./live-ui";

// O'yin boshlanishidagi intro: rejim maskoti, nomi va qoidalari — proyektorda ham, telefonlarda ham bir vaqtda.

export function ModeIntro({ mode, ms, sound = true, compact = false }: { mode: LiveGameMode; ms: number; sound?: boolean; compact?: boolean }) {
  const t = MODE_THEMES[mode] ?? MODE_THEMES.classic;
  const info = LIVE_MODES[mode];
  const [left, setLeft] = useState(Math.ceil(ms / 1000));
  const total = useRef(ms);
  const played = useRef(false);

  useEffect(() => {
    if (sound && !played.current) {
      played.current = true;
      playModeJingle(t.music.transpose, t.music.wave, t.music.minor);
    }
  }, [sound, t]);

  useEffect(() => {
    const end = Date.now() + total.current;
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden px-6 text-center text-white" style={themeBackground(mode)}>
      <ThemeDecor mode={mode} />
      <div className="relative flex flex-col items-center">
        <div className="relative mb-4 flex items-center justify-center">
          <span className="live-intro-ring absolute h-40 w-40 rounded-full border-4" style={{ borderColor: t.accent }} />
          <span className="live-intro-ring absolute h-40 w-40 rounded-full border-4" style={{ borderColor: t.accent, animationDelay: "0.8s" }} />
          <span className={`live-intro-in relative drop-shadow-2xl ${compact ? "text-8xl" : "text-[9rem] leading-none"}`}>{t.emoji}</span>
        </div>
        <p className="live-intro-up text-xs font-black uppercase tracking-[0.5em]" style={{ color: t.accent, animationDelay: "0.35s" }}>
          Jonli o&apos;yin
        </p>
        <h1 className={`live-intro-up font-black tracking-tight ${compact ? "text-4xl" : "text-5xl sm:text-7xl lg:text-8xl"}`} style={{ animationDelay: "0.5s" }}>
          {info.title}
        </h1>
        <p className={`live-intro-up mt-2 font-bold text-white/80 ${compact ? "text-base" : "text-lg sm:text-2xl"}`} style={{ animationDelay: "0.7s" }}>
          {info.tagline}
        </p>
        <ul className={`mt-6 grid max-w-3xl gap-2 ${compact ? "text-sm" : "text-base sm:text-xl"}`}>
          {info.rules.map((r, i) => (
            <li key={r} className="live-intro-up rounded-2xl bg-black/30 px-5 py-2.5 font-semibold ring-1 ring-white/10 backdrop-blur" style={{ animationDelay: `${1 + i * 0.35}s` }}>
              {r}
            </li>
          ))}
        </ul>
        <p key={left} className="live-pop mt-6 font-mono text-5xl font-black" style={{ color: t.accent }}>
          {left > 0 ? left : "Boshladik!"}
        </p>
      </div>
    </div>
  );
}
