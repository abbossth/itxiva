"use client";

import { useEffect, useRef, useState } from "react";
import type { GameLook } from "@/lib/character/catalog";
import { playRankUp, unlockSound } from "@/lib/sound";
import { CharacterSvg, type CharMood } from "./character-svg";

// Profildagi jonli 2D personaj: ko'zlari va boshi sichqoncha (barmoq) tomonga qaraydi,
// bosilganda xursand bo'lib sakraydi, ustiga olib borilsa — qo'l silkitadi.

export function Character2D({ look, size = 220, sound = true, emote = null }: { look: Partial<GameLook>; size?: number; sound?: boolean; emote?: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const [mood, setMood] = useState<CharMood>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = box.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.32;
        const dx = (e.clientX - cx) / Math.max(200, window.innerWidth / 2);
        const dy = (e.clientY - cy) / Math.max(200, window.innerHeight / 2);
        setGaze({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const play = (m: CharMood, ms: number) => {
    setMood(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMood("idle"), ms);
  };

  return (
    <div
      ref={box}
      className="relative mx-auto flex cursor-pointer select-none items-end justify-center"
      style={{ width: size, height: size * 1.24 }}
      onPointerEnter={() => mood === "idle" && play("fly", 900)}
      onClick={() => {
        unlockSound();
        if (sound) playRankUp();
        play(Math.random() < 0.5 ? "cheer" : "jump", 1400);
      }}
      title="Bosing — personaj sakraydi!"
    >
      <CharacterSvg look={look} size={size} mood={mood} gaze={gaze} emote={emote} />
    </div>
  );
}
