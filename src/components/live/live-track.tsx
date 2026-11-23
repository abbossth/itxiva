"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";

// Jonli o'yin fon musiqasi — audio fayl (public/audio): ekranda pleer ko'rinmaydi, takrorlanib chalinadi.
// Har o'yin turi uchun tanlov brauzerda saqlanadi: tayyor kuy yoki o'yinning original (sintez) kuylari.

export const MUSIC_TRACKS = {
  "quiz-show": { title: "Quiz Show", src: "/audio/quiz-show.mp3" },
} as const;
export type MusicChoice = keyof typeof MUSIC_TRACKS | "synth";

/** Sukutda: klassik turda — Quiz Show kuyi, qolganlarida — original kuylar */
const DEFAULTS: Partial<Record<LiveGameMode, MusicChoice>> = { classic: "quiz-show" };

const KEY = (mode: LiveGameMode) => `itxiva:live-track:${mode}`;
const EVENT = "itxiva:live-track";

function read(mode: LiveGameMode): MusicChoice {
  try {
    const v = localStorage.getItem(KEY(mode));
    if (v === "synth" || (v && v in MUSIC_TRACKS)) return v as MusicChoice;
  } catch {
    // Saqlangan tanlov o'qilmasa — sukutdagisi
  }
  return DEFAULTS[mode] ?? "synth";
}

export function setMusicChoice(mode: LiveGameMode, choice: MusicChoice) {
  try {
    localStorage.setItem(KEY(mode), choice);
  } catch {
    // Saqlab bo'lmasa — faqat shu sahifada
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useMusicChoice(mode: LiveGameMode): MusicChoice {
  return useSyncExternalStore(subscribe, () => read(mode), () => DEFAULTS[mode] ?? "synth");
}

// Musiqa balandligi (0..1): tayyor kuy ham, original kuylar ham — brauzerda saqlanadi
const VOL_KEY = "itxiva:live-music-volume";

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    if (localStorage.getItem(VOL_KEY) !== null && Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  } catch {
    // o'qib bo'lmasa — sukutdagisi
  }
  return 1;
}

export function setMusicVolume(v: number) {
  try {
    localStorage.setItem(VOL_KEY, String(Math.max(0, Math.min(1, v))));
  } catch {
    // saqlab bo'lmasa — faqat shu sahifada
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useMusicVolume(): number {
  return useSyncExternalStore(subscribe, readVolume, () => 1);
}

/**
 * Fon kuyi: `playing` bo'lsa chaladi (silliq ko'tariladi), aks holda to'xtaydi.
 * Brauzer ovozni foydalanuvchi bosguncha bermasligi mumkin — shunda birinchi bosishda boshlanadi.
 */
export function BackgroundTrack({ src, playing, volume = 0.55 }: { src: string; playing: boolean; volume?: number }) {
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio(src);
    a.loop = true;
    a.preload = "auto";
    a.volume = 0;
    audio.current = a;
    return () => {
      a.pause();
      a.src = "";
      audio.current = null;
    };
  }, [src]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    let fade: ReturnType<typeof setInterval> | null = null;
    const fadeTo = (target: number, then?: () => void) => {
      if (fade) clearInterval(fade);
      fade = setInterval(() => {
        const next = a.volume + (target > a.volume ? 0.05 : -0.05);
        if ((target > a.volume && next >= target) || (target <= a.volume && next <= target)) {
          a.volume = Math.max(0, Math.min(1, target));
          if (fade) clearInterval(fade);
          then?.();
        } else a.volume = Math.max(0, Math.min(1, next));
      }, 50);
    };
    if (!playing) {
      fadeTo(0, () => a.pause());
      return () => {
        if (fade) clearInterval(fade);
      };
    }
    const start = () => {
      a.play()
        .then(() => fadeTo(volume))
        .catch(() => {
          // Ruxsat yo'q — birinchi bosishni kutamiz
          window.addEventListener("pointerdown", start, { once: true });
        });
    };
    start();
    return () => {
      if (fade) clearInterval(fade);
      window.removeEventListener("pointerdown", start);
    };
  }, [playing, volume, src]);

  return null;
}
