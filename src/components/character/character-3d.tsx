"use client";

import { useEffect, useRef, useState } from "react";
import type { GameLook } from "@/lib/character/catalog";
import { playRankUp, unlockSound } from "@/lib/sound";
import type { Character3DScene } from "./character-3d-scene";

// 3D personaj ko'rinishi: three.js faqat shu ko'rinish ochilganda yuklanadi.
// WebGL ishlamasa (eski telefon) — `onFail` chaqiriladi va 2D ko'rinishga qaytiladi.

export function Character3D({ look, height = 320, sound = true, onFail }: { look: Partial<GameLook>; height?: number; sound?: boolean; onFail?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<Character3DScene | null>(null);
  const [ready, setReady] = useState(false);
  const lookRef = useRef(look);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => {
    let cancelled = false;
    const el = box.current;
    if (!el) return;
    Promise.all([import("three"), import("./character-3d-scene")])
      .then(([THREE, mod]) => {
        if (cancelled) return;
        try {
          scene.current = new mod.Character3DScene(THREE, el, lookRef.current, () => {
            unlockSound();
            if (soundRef.current) playRankUp();
          });
          setReady(true);
        } catch {
          onFail?.();
        }
      })
      .catch(() => onFail?.());
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
    // Sahna bir marta quriladi; ko'rinish o'zgarsa — pastdagi effekt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    lookRef.current = look;
    scene.current?.setLook(look);
  }, [look]);

  return (
    <div className="relative mx-auto w-full" style={{ height, position: "relative" }}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-400">3D yuklanmoqda…</div>}
    </div>
  );
}
