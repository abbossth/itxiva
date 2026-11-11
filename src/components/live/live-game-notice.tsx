"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Gamepad2, X } from "lucide-react";
import Link from "@/components/ui/link";
import { LIVE_MODES } from "@/lib/live-game/modes";
import type { LiveGameMode, LiveGameStatus } from "@/lib/db/models/live-game.model";
import { OVERLAY_FREE_EVENT, claimOverlay, overlayBusy, releaseOverlay } from "@/lib/rewards-client";
import { haptic } from "@/lib/haptics";
import { MODE_COLORS, MODE_ICONS } from "./live-games-manager";
import { cn } from "@/lib/utils";

// O'quvchi guruhida jonli o'yin ochilganda: headerda tugma va (har o'yin uchun bir marta) ekran o'rtasida xabar.
// Tekshiruvni bitta komponent qiladi (layout'da), header tugmasi shu yerdagi umumiy holatni o'qiydi.

type ActiveGame = { id: string; mode: LiveGameMode; status: LiveGameStatus; joined: boolean } | null;

let current: ActiveGame = null;
const listeners = new Set<() => void>();
function setActive(next: ActiveGame) {
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function useActiveGame(): ActiveGame {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

const POLL_MS = 20_000;
const seenKey = (id: string) => `itxiva:live-notice:${id}`;

function wasSeen(id: string): boolean {
  try {
    return localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
}
function markSeen(id: string) {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {
    // Saqlab bo'lmasa — oyna shu sahifada qayta chiqmaydi, keyingi kirishda yana chiqishi mumkin
  }
}

/** Layout'da (faqat o'quvchi): tekshiradi va xabar oynasini ko'rsatadi */
export function LiveGameNotice() {
  const pathname = usePathname();
  const game = useActiveGame();
  const [open, setOpen] = useState<ActiveGame>(null);
  const shownFor = useRef<string | null>(null);

  const check = useCallback(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch("/api/live/active", { cache: "no-store", signal: ctrl.signal });
      if (res.ok) setActive(((await res.json()) as { game: ActiveGame }).game ?? null);
    } catch {
      // Tarmoq xatosi — keyingi tekshiruvda
    } finally {
      clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void check(), 400);
    return () => clearTimeout(t);
  }, [pathname, check]);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && void check(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    // iOS Safari/Chrome sahifani orqaga qaytishda keshdan (bfcache) tiklaydi — shunda ham darhol tekshiriladi
    const onPageShow = (e: PageTransitionEvent) => e.persisted && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [check]);

  // Har o'yin uchun bir marta ekran o'rtasida (o'yin sahifasida va qo'shilib bo'lganda — yo'q)
  useEffect(() => {
    if (!game || game.joined || pathname.startsWith("/live/") || shownFor.current === game.id || wasSeen(game.id)) return;
    const tryShow = () => {
      if (overlayBusy("live") || shownFor.current === game.id) return;
      shownFor.current = game.id;
      claimOverlay("live");
      haptic([40, 60, 40]);
      setOpen(game);
    };
    const t = setTimeout(tryShow, 300);
    window.addEventListener(OVERLAY_FREE_EVENT, tryShow);
    return () => {
      clearTimeout(t);
      window.removeEventListener(OVERLAY_FREE_EVENT, tryShow);
    };
  }, [game, pathname]);

  const close = () => {
    if (open) markSeen(open.id);
    setOpen(null);
    releaseOverlay("live");
  };

  if (!open) return null;
  const Icon = MODE_ICONS[open.mode];
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="live-notice-title">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm animate-in fade-in" onClick={close} aria-hidden />
      <div className="reward-pop relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-center text-white shadow-2xl ring-1 ring-white/10">
        <button type="button" onClick={close} aria-label="Yopish" className="absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <span className={cn("quiz-pulse mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br", MODE_COLORS[open.mode])}>
          <Icon className="h-10 w-10" />
        </span>
        <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-fuchsia-300">Jonli o&apos;yin boshlandi</p>
        <h2 id="live-notice-title" className="mt-1 text-3xl font-black">
          {LIVE_MODES[open.mode].title}
        </h2>
        <p className="mt-1 text-sm text-slate-300">{LIVE_MODES[open.mode].tagline}</p>
        <Link
          href={`/live/${open.id}`}
          onClick={close}
          className="mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-black text-slate-900 transition-transform hover:scale-[1.02]"
        >
          <Gamepad2 className="h-5 w-5" /> Qo&apos;shilish
        </Link>
        <button type="button" onClick={close} className="mt-2 min-h-[44px] w-full cursor-pointer text-sm font-semibold text-slate-400 hover:text-white">
          Keyinroq
        </button>
      </div>
    </div>
  );
}

/** Header'dagi tugma: guruhda jonli o'yin ochiq bo'lsa ko'rinadi */
export function LiveGameHeaderButton() {
  const game = useActiveGame();
  const pathname = usePathname();
  if (!game || pathname.startsWith("/live/")) return null;
  return (
    <Link
      href={`/live/${game.id}`}
      title="Jonli o'yinga qo'shilish"
      className="relative inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-2.5 text-sm font-black text-white shadow-md shadow-fuchsia-600/30 transition-transform hover:scale-[1.03] sm:px-3"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <Gamepad2 className="h-4 w-4" />
      <span className="hidden md:inline">{game.joined ? "Jonli o'yinga qaytish" : "Jonli o'yinga qo'shilish"}</span>
    </Link>
  );
}
