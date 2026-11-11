"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Music } from "lucide-react";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";

// Jonli o'yin fon musiqasi YouTube'dan: rasmiy YouTube pleeri (ko'rinib turadi) orqali chalinadi —
// audio yuklab olinmaydi. Havola har o'yin turi uchun brauzerda saqlanadi; klassik tur uchun sukutdagi havola bor.

/** Mentor tanlagan sukutdagi kuy (klassik tur) */
const DEFAULT_LINKS: Partial<Record<LiveGameMode, string>> = {
  classic: "https://www.youtube.com/watch?v=wc4_B6Tm_N8",
};

const KEY = (mode: LiveGameMode) => `itxiva:live-music:${mode}`;
const EVENT = "itxiva:live-music";

/** youtube.com/watch?v=…, youtu.be/…, /embed/…, /shorts/… → video ID */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.trim().match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function read(mode: LiveGameMode): string {
  try {
    const v = localStorage.getItem(KEY(mode));
    // "" — mentor original kuyni tanlagan
    return v ?? DEFAULT_LINKS[mode] ?? "";
  } catch {
    return DEFAULT_LINKS[mode] ?? "";
  }
}

export function setYoutubeLink(mode: LiveGameMode, link: string) {
  try {
    localStorage.setItem(KEY(mode), link.trim());
  } catch {
    // Saqlab bo'lmasa — shu sahifada ishlamaydi
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

/** Shu tur uchun tanlangan YouTube havolasi ("" — original kuy) */
export function useYoutubeLink(mode: LiveGameMode): string {
  return useSyncExternalStore(
    subscribe,
    () => read(mode),
    () => DEFAULT_LINKS[mode] ?? ""
  );
}

/** Ko'rinib turadigan kichik YouTube pleer (burchakda); `playing` o'zgarsa — to'xtaydi yoki davom etadi */
function sendCommand(frame: HTMLIFrameElement | null, func: string) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "https://www.youtube-nocookie.com");
}

export function YoutubeMusic({ videoId, playing }: { videoId: string; playing: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const func = playing ? "playVideo" : "pauseVideo";
    sendCommand(ref.current, func);
    // Pleer yuklanishiga ulgurmagan bo'lishi mumkin — bir necha marta takrorlanadi
    const timers = [800, 2000, 4000].map((d) => setTimeout(() => sendCommand(ref.current, func), d));
    return () => timers.forEach(clearTimeout);
  }, [playing, videoId]);

  // Sahifaning istalgan joyida bosilganda (brauzer ovozga ruxsat bergach) davom etadi
  useEffect(() => {
    if (!playing) return;
    const onClick = () => sendCommand(ref.current, "playVideo");
    window.addEventListener("pointerdown", onClick, { once: true });
    return () => window.removeEventListener("pointerdown", onClick);
  }, [playing, videoId]);

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&enablejsapi=1&controls=1&rel=0&playsinline=1`;
  return (
    <div className="fixed bottom-3 left-3 z-[61] overflow-hidden rounded-2xl bg-black/80 shadow-2xl ring-1 ring-white/15">
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-white/80">
        <Music className="h-3.5 w-3.5" /> Fon musiqasi
      </div>
      <iframe
        ref={ref}
        title="Fon musiqasi"
        src={src}
        width={200}
        height={200}
        allow="autoplay; encrypted-media"
        className="block"
      />
    </div>
  );
}
