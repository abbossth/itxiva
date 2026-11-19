"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { getPendingNewsAction, markNewsSeenAction } from "@/actions/news.actions";
import type { NewsArt, NewsItem } from "@/lib/whats-new";
import type { GameLook } from "@/lib/character/catalog";
import { LEVEL_UP_CLOSED_EVENT, OVERLAY_FREE_EVENT, claimOverlay, overlayBusy, releaseOverlay } from "@/lib/rewards-client";
import { fireConfetti, prefersReducedMotion } from "@/lib/confetti";
import { playRankUp, playWhoosh, unlockSound } from "@/lib/sound";
import { CharacterSvg } from "@/components/character/character-svg";
import { cn } from "@/lib/utils";

/**
 * "Yangilik" e'loni: platformaga yangi imkoniyat qo'shilganda o'quvchiga kirishda bir marta slaydlar bilan
 * tushuntiriladi (ro'yxati — lib/whats-new.ts). Daraja, mukofot va mentor e'loni oynalari bilan navbat bilan chiqadi.
 */
export function WhatsNewModal({ waitForLevelUp }: { waitForLevelUp: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<{ item: NewsItem; look: GameLook } | null>(null);
  const [i, setI] = useState(0);
  const blocked = useRef(waitForLevelUp);
  const loading = useRef(false);
  const done = useRef(false);

  const load = useCallback(async () => {
    if (done.current || loading.current || blocked.current || overlayBusy("news")) return;
    loading.current = true;
    try {
      const next = await getPendingNewsAction();
      if (next && !overlayBusy("news")) {
        done.current = true;
        claimOverlay("news");
        setData(next);
        if (!prefersReducedMotion()) void fireConfetti({ particleCount: 80, spread: 75, origin: { y: 0.3 }, zIndex: 80 });
      }
    } catch {
      // Chiqmasa ham sahifa ishlayveradi
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    // Mentor e'loni (0,6 s) birinchi chiqsin — yangilik undan keyin
    const t = setTimeout(() => void load(), 1800);
    const onLevelClosed = () => {
      blocked.current = false;
      setTimeout(() => void load(), 900);
    };
    const onFree = () => setTimeout(() => void load(), 700);
    window.addEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
    window.addEventListener(OVERLAY_FREE_EVENT, onFree);
    return () => {
      clearTimeout(t);
      window.removeEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
      window.removeEventListener(OVERLAY_FREE_EVENT, onFree);
    };
  }, [load]);

  const close = useCallback(
    (go?: string) => {
      if (!data) return;
      const id = data.item.id;
      setData(null);
      void markNewsSeenAction(id)
        .catch(() => {})
        .finally(() => releaseOverlay("news"));
      if (go) router.push(go);
    },
    [data, router]
  );

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((v) => Math.min(data.item.slides.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, close]);

  if (!data) return null;
  const { item, look } = data;
  const slide = item.slides[i];
  const last = i === item.slides.length - 1;
  const go = (d: number) => {
    unlockSound();
    playWhoosh(0.3);
    setI((v) => Math.max(0, Math.min(item.slides.length - 1, v + d)));
  };

  return createPortal(
    <div className="fixed inset-0 z-[73] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="news-title">
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm animate-in fade-in" aria-hidden onClick={() => close()} />
      <div className="pointer-events-none relative flex min-h-full items-center justify-center p-4">
        <div className="reward-pop pointer-events-auto relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
          <button type="button" onClick={() => close()} aria-label="Yopish" className="absolute right-3 top-3 z-10 cursor-pointer rounded-full bg-black/20 p-1.5 text-white hover:bg-black/40">
            <X className="h-4 w-4" />
          </button>
          {/* Rasm */}
          <div className="relative h-64 overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-teal-900 sm:h-72">
            <div aria-hidden className="live-rays pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[repeating-conic-gradient(rgba(94,234,212,0.12)_0deg_10deg,transparent_10deg_24deg)]" />
            <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-slate-950">
              <Sparkles className="h-3.5 w-3.5" /> {item.badge}
            </span>
            <div key={i} className="live-intro-up absolute inset-0 flex items-end justify-center pb-4">
              <Art art={slide.art} look={look} emoji={slide.emoji} />
            </div>
          </div>
          {/* Matn */}
          <div className="space-y-3 p-5 sm:p-6">
            {i === 0 && <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-600 dark:text-teal-400">{item.title}</p>}
            <h2 id="news-title" key={`t${i}`} className="live-intro-up text-2xl font-black text-slate-900 dark:text-slate-100">
              {slide.title}
            </h2>
            <p key={`p${i}`} className="live-intro-up text-sm leading-relaxed text-slate-600 dark:text-slate-300" style={{ animationDelay: "80ms" }}>
              {slide.text}
            </p>
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {item.slides.map((_, k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`${k + 1}-slayd`}
                  onClick={() => setI(k)}
                  className={cn("h-2 cursor-pointer rounded-full transition-all", k === i ? "w-6 bg-teal-600" : "w-2 bg-slate-300 dark:bg-slate-700")}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              {i > 0 ? (
                <button type="button" onClick={() => go(-1)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  <ArrowLeft className="h-4 w-4" /> Orqaga
                </button>
              ) : (
                <button type="button" onClick={() => close()} className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                  Keyinroq
                </button>
              )}
              {last ? (
                <button
                  type="button"
                  onClick={() => {
                    unlockSound();
                    playRankUp();
                    close(item.cta?.href);
                  }}
                  className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-itxiva-gradient px-5 text-sm font-black text-white shadow-md shadow-teal-500/20"
                >
                  <Sparkles className="h-4 w-4" /> {item.cta?.label ?? "Tushunarli"}
                </button>
              ) : (
                <button type="button" onClick={() => go(1)} className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white dark:bg-white dark:text-slate-900">
                  Keyingisi <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Slayd rasmi: o'quvchining o'z personaji bilan */
function Art({ art, look, emoji }: { art: NewsArt; look: GameLook; emoji?: string }) {
  switch (art) {
    case "character-hello":
      return (
        <div className="flex items-end gap-4">
          <CharacterSvg look={{ ...look, hair: "spiky", head: "cap", color: 1, level: 1 }} size={90} mood="idle" className="opacity-80" />
          <CharacterSvg look={look} size={150} mood="happy" />
          <CharacterSvg look={{ ...look, hair: "long", outfit: "hoodie", color: 4, eyes: "happy", level: 1 }} size={90} mood="idle" className="opacity-80" />
        </div>
      );
    case "character-levels":
      return (
        <div className="flex items-end gap-1 sm:gap-3">
          {[1, 4, 7, 10].map((lvl, k) => (
            <div key={lvl} className="flex flex-col items-center">
              <CharacterSvg look={{ ...look, level: lvl, power: Math.min(5, k * 2) }} size={58 + k * 14} mood={k === 3 ? "happy" : "idle"} />
              <span className="mt-1 rounded-full bg-white/15 px-2 text-[11px] font-black text-white">{lvl}-daraja</span>
            </div>
          ))}
        </div>
      );
    case "character-shop":
      return (
        <div className="flex items-end gap-3">
          <div className="mb-6 grid grid-cols-2 gap-1.5">
            {["🗡️", "🦸", "👑", "🐱"].map((e) => (
              <span key={e} className="live-chest-idle flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl ring-1 ring-white/15">
                {e}
              </span>
            ))}
          </div>
          <CharacterSvg look={{ ...look, level: Math.max(look.level, 6), back: "cape", hand: "sword", head: "crown", pet: "cat", power: 4 }} size={150} mood="happy" />
          <span className="mb-10 rounded-full bg-amber-400 px-3 py-1 text-sm font-black text-slate-950">🪙 → ⚡</span>
        </div>
      );
    case "character-games":
      return (
        <div className="relative h-44 w-[22rem] overflow-hidden rounded-2xl bg-[#1f2937] ring-1 ring-white/10">
          <div className="adv-road absolute inset-x-0 top-1/2 h-[3px] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.35)_0_48px,transparent_48px_96px)]" />
          <div className="absolute right-4 top-0 h-full w-3 bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:12px_12px]" />
          <div className="absolute bottom-3 left-[38%]">
            <CharacterSvg look={look} size={70} mood="run" pedestal={false} />
          </div>
          <div className="absolute bottom-16 left-[14%] opacity-80">
            <CharacterSvg look={{ ...look, color: 2, hair: "bun", skin: "tan", level: 1, power: 0 }} size={52} mood="run" pedestal={false} />
          </div>
          <span className="absolute left-3 top-2 text-xs font-black text-white/70">🏁 Robot poyga</span>
        </div>
      );
    case "character-prizes":
      return (
        <div className="flex items-end gap-4">
          <span className="live-chest mb-6 text-7xl">🎁</span>
          <CharacterSvg look={{ ...look, back: "wings", power: Math.max(look.power, 3) }} size={140} mood="happy" />
          <span className="mb-8 text-5xl">🎡</span>
        </div>
      );
    case "emotes":
      return (
        <div className="flex items-end gap-2">
          <CharacterSvg look={{ ...look, level: 1 }} size={90} emote="wave" pedestal={false} />
          <CharacterSvg look={look} size={140} emote="kiss" />
          <CharacterSvg look={{ ...look, level: 1 }} size={90} emote="jump" pedestal={false} />
        </div>
      );
    case "games":
      return (
        <div className="flex items-end gap-3">
          <div className="mb-4 flex flex-col items-center rounded-2xl bg-emerald-500/20 p-2 ring-1 ring-emerald-300/40">
            <CharacterSvg look={{ ...look, level: 1 }} size={70} mood="run" pedestal={false} />
            <span className="text-[10px] font-black text-emerald-200">Yashil zona</span>
          </div>
          <CharacterSvg look={look} size={130} emote="karate" />
          <div className="mb-4 flex flex-col items-center rounded-2xl bg-violet-500/20 p-2 ring-1 ring-violet-300/40">
            <span className="text-4xl">🚀</span>
            <CharacterSvg look={look} size={34} headOnly />
            <span className="text-[10px] font-black text-violet-200">Galaktika</span>
          </div>
        </div>
      );
    case "boosters":
      return (
        <div className="flex items-end gap-4">
          <CharacterSvg look={look} size={120} mood="happy" />
          <div className="mb-6 grid gap-2">
            {[
              ["✂️", "50/50"],
              ["⚡", "×2 ochko"],
              ["🛡️", "Qalqon"],
            ].map(([i, n]) => (
              <span key={n} className="live-pop inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-sm font-black text-white shadow-lg">
                <span className="text-xl">{i}</span>
                {n}
              </span>
            ))}
          </div>
        </div>
      );
    case "xp-penalty":
      return (
        <div className="flex items-end gap-4">
          <CharacterSvg look={look} size={130} mood="sad" />
          <div className="mb-8 flex flex-col gap-2">
            <span className="rounded-2xl bg-rose-600 px-4 py-2 font-mono text-2xl font-black text-white shadow-lg">−10 🪙</span>
            <span className="rounded-2xl bg-violet-600 px-4 py-2 font-mono text-2xl font-black text-white shadow-lg">−10 XP</span>
          </div>
        </div>
      );
    default:
      return <span className="text-8xl">{emoji ?? "✨"}</span>;
  }
}
