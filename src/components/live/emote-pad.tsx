"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Lock, RefreshCw } from "lucide-react";
import Link from "@/components/ui/link";
import { playEmoteAction } from "@/actions/live-game.actions";
import { getMyCharacter } from "@/actions/character.actions";
import { EMOTES, EMOTE_GAP_MS, EMOTE_MS, hasEmote, type Emote } from "@/lib/character/emotes";
import type { GameLook } from "@/lib/character/catalog";
import { haptic } from "@/lib/haptics";
import { playRankUp, playWhoosh, unlockSound } from "@/lib/sound";
import { CharacterSvg } from "@/components/character/character-svg";
import { cn } from "@/lib/utils";
import { GoldCoin } from "@/components/ui/gold-coin";

// Kutish zalida: harakatlar g'ildiragi (PUBG'dagi kabi). Personaj sahna o'rtasida, atrofida 8 ta harakat tugmasi.
// Bosilganda: belgilar tugmadan personajga uchadi va atrofga sochiladi, tepada harakat nomi chiqadi; personaj telefonda
// darhol, katta ekranda ~1 s ichida shu harakatni qiladi. Bepul 3 ta harakat hammada bor; qolganlari — «Personajim».

const SLOTS = 8;
const hue = (id: string) => (id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360;

type Burst = { key: number; icon: string; from: { x: number; y: number } };

export function EmotePad({ gameId, look }: { gameId: string; look: GameLook | null }) {
  const [owned, setOwned] = useState<string[] | null>(null);
  const [playing, setPlaying] = useState<{ id: string; key: number } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(340);
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(-1e9);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void getMyCharacter()
      .then((c) => alive && setOwned(c?.owned ?? []))
      .catch(() => alive && setOwned([]));
    const fit = () => setSize(Math.max(280, Math.min(380, (box.current?.parentElement?.clientWidth ?? 360) - 8)));
    fit();
    window.addEventListener("resize", fit);
    return () => {
      alive = false;
      window.removeEventListener("resize", fit);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const mine = EMOTES.filter((e) => hasEmote(e, owned ?? []));
  const locked = EMOTES.filter((e) => !hasEmote(e, owned ?? [])).sort((a, b) => a.price - b.price);
  const pages = Math.max(1, Math.ceil(mine.length / SLOTS));
  const shown = mine.slice(page * SLOTS, page * SLOTS + SLOTS);
  const R = size * 0.4;
  const btn = Math.round(size * 0.19);
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (i / SLOTS) * Math.PI * 2;
    return { x: size / 2 + Math.cos(a) * R, y: size / 2 + Math.sin(a) * R };
  };

  const play = (e: Emote, slot: number, now: number) => {
    if (now - last.current < EMOTE_GAP_MS) return;
    last.current = now;
    unlockSound();
    playRankUp();
    playWhoosh(0.25);
    haptic([12, 30, 18]);
    setPlaying({ id: e.id, key: now });
    setBursts((b) => [...b.slice(-2), { key: now, icon: e.fx[0] ?? e.icon, from: pos(slot) }]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(null), EMOTE_MS);
    void playEmoteAction(gameId, e.id).catch(() => {});
  };
  const current = playing ? EMOTES.find((e) => e.id === playing.id) : null;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* G'ildirak */}
      <div ref={box} className="relative select-none" style={{ width: size, height: size }}>
        {/* Sahna: yorug'lik, aylanuvchi halqa */}
        <div aria-hidden className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(167,139,250,0.35),rgba(30,27,75,0.6)_55%,transparent_72%)]" />
        <div aria-hidden className="emote-ring absolute inset-[10%] rounded-full border-2 border-dashed border-fuchsia-300/30" />
        <div aria-hidden className={cn("absolute inset-[22%] rounded-full transition-all duration-500", current ? "bg-fuchsia-400/25 shadow-[0_0_80px_30px_rgba(232,121,249,0.35)]" : "bg-white/5")} />
        {/* Personaj */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[54%]">
          <CharacterSvg key={playing?.key ?? "idle"} look={look} size={Math.round(size * 0.36)} emote={playing?.id ?? null} pedestal={false} />
        </div>
        {/* Harakat nomi */}
        {current && (
          <div key={playing!.key} className="emote-banner pointer-events-none absolute left-1/2 top-[18%] z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-1 text-sm font-black text-white shadow-xl ring-2 ring-white/40">
            {current.icon} {current.name}
          </div>
        )}
        {/* Uchayotgan belgilar */}
        {bursts.map((b) => (
          <EmoteBurst key={b.key} icon={b.icon} from={b.from} to={{ x: size / 2, y: size / 2 }} onDone={() => setBursts((all) => all.filter((x) => x.key !== b.key))} />
        ))}
        {/* Tugmalar */}
        {Array.from({ length: SLOTS }, (_, i) => {
          const e = shown[i];
          const p = pos(i);
          const style = { left: p.x - btn / 2, top: p.y - btn / 2, width: btn, height: btn };
          if (!e) {
            const next = locked[i - shown.length];
            return (
              <Link
                key={`l${i}`}
                href="/profile?tab=character"
                className="absolute flex flex-col items-center justify-center rounded-full border border-dashed border-white/20 bg-black/30 text-white/60 backdrop-blur transition hover:border-amber-300/60"
                style={style}
                title="«Personajim» bo'limida oching"
              >
                <span className="text-lg leading-none opacity-50 grayscale">{next?.icon ?? "＋"}</span>
                {next && (
                  <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-black text-amber-200">
                    <Lock className="h-2.5 w-2.5" />
                    {next.price}
                  </span>
                )}
              </Link>
            );
          }
          const h = hue(e.id);
          const active = playing?.id === e.id;
          return (
            <button
              key={e.id}
              type="button"
              onClick={(ev) => play(e, i, ev.timeStamp)}
              className={cn("emote-btn absolute flex cursor-pointer flex-col items-center justify-center rounded-full text-white shadow-lg ring-2 transition active:scale-90", active ? "scale-110 ring-white" : "ring-white/25 hover:scale-105")}
              style={{ ...style, background: `radial-gradient(circle at 35% 30%, hsl(${h} 90% 72%), hsl(${h} 80% 45%) 70%)`, boxShadow: active ? `0 0 28px hsl(${h} 90% 60%)` : undefined, animationDelay: `${i * 60}ms` }}
              aria-label={e.name}
            >
              <span className={cn("leading-none drop-shadow", active && "emote-wiggle")} style={{ fontSize: btn * 0.42 }}>
                {e.icon}
              </span>
              <span className="mt-0.5 line-clamp-1 max-w-[90%] text-[9px] font-black leading-none drop-shadow">{e.name.split(" ")[0]}</span>
            </button>
          );
        })}
        {pages > 1 && (
          <button
            type="button"
            onClick={() => setPage((p) => (p + 1) % pages)}
            className="absolute bottom-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-black ring-1 ring-white/20"
          >
            <RefreshCw className="h-3 w-3" /> {page + 1}/{pages}
          </button>
        )}
      </div>

      <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-200/90">Bosing — personajingiz katta ekranda harakat qiladi</p>

      {/* Do'kondagi harakatlar */}
      {owned !== null && locked.length > 0 && (
        <div className="w-full max-w-md">
          <Link href="/profile?tab=character" className="mb-1.5 flex items-center justify-between px-1 text-xs font-black text-amber-200">
            <span>🛍️ Yana {locked.length} ta harakat</span>
            <span className="inline-flex items-center">
              Ochish <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
          <div className="live-noscroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {locked.slice(0, 12).map((e) => (
              <Link
                key={e.id}
                href="/profile?tab=character"
                className="flex w-[4.6rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl p-2 ring-1 ring-white/10"
                style={{ background: `linear-gradient(160deg, hsl(${hue(e.id)} 70% 35% / 0.55), rgba(15,23,42,0.6))` }}
              >
                <span className="text-2xl leading-none">{e.icon}</span>
                <span className="line-clamp-1 text-[10px] font-bold text-white/85">{e.name}</span>
                <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-slate-900"><GoldCoin /> {e.price}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tugmadan personajga uchib, atrofga sochiladigan belgilar */
function EmoteBurst({ icon, from, to, onDone }: { icon: string; from: { x: number; y: number }; to: { x: number; y: number }; onDone: () => void }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setStage(1)));
    const b = setTimeout(() => setStage(2), 420);
    const c = setTimeout(onDone, 1300);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(b);
      clearTimeout(c);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const parts = Array.from({ length: 8 }, (_, k) => {
    const ang = (k / 8) * Math.PI * 2;
    const dist = 70 + (k % 3) * 18;
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist };
  });
  return (
    <>
      {stage < 2 && (
        <span
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 text-3xl drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"
          style={{ left: stage === 0 ? from.x : to.x, top: stage === 0 ? from.y : to.y, transition: "left 400ms cubic-bezier(0.3,0.7,0.4,1), top 400ms cubic-bezier(0.3,0.7,0.4,1)" }}
        >
          {icon}
        </span>
      )}
      {stage === 2 &&
        parts.map((p, k) => (
          <span
            key={k}
            className="emote-spark pointer-events-none absolute z-30 text-xl"
            style={{ left: to.x, top: to.y, ["--dx" as string]: `${p.x}px`, ["--dy" as string]: `${p.y}px`, animationDelay: `${k * 15}ms` }}
          >
            {k % 2 ? "✨" : icon}
          </span>
        ))}
    </>
  );
}

/** Ixcham qator: javob berib kutayotganda — egalikdagi harakatlar (katta ekrandagi personaj qatorida ko'rinadi) */
export function EmoteStrip({ gameId }: { gameId: string }) {
  const [owned, setOwned] = useState<string[] | null>(null);
  const [on, setOn] = useState<string | null>(null);
  const last = useRef(-1e9);
  useEffect(() => {
    void getMyCharacter()
      .then((c) => setOwned(c?.owned ?? []))
      .catch(() => setOwned([]));
  }, []);
  if (!owned) return null;
  const mine = EMOTES.filter((e) => hasEmote(e, owned)).slice(0, 8);
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {mine.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={(ev) => {
            if (ev.timeStamp - last.current < EMOTE_GAP_MS) return;
            last.current = ev.timeStamp;
            unlockSound();
            playRankUp();
            haptic([12]);
            setOn(e.id);
            setTimeout(() => setOn((x) => (x === e.id ? null : x)), 900);
            void playEmoteAction(gameId, e.id).catch(() => {});
          }}
          className={cn("flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-xl shadow ring-2 transition active:scale-90", on === e.id ? "scale-110 ring-white" : "ring-white/20")}
          style={{ background: `radial-gradient(circle at 35% 30%, hsl(${hue(e.id)} 90% 72%), hsl(${hue(e.id)} 80% 45%) 70%)` }}
          aria-label={e.name}
          title={e.name}
        >
          <span className={cn(on === e.id && "emote-wiggle")}>{e.icon}</span>
        </button>
      ))}
    </div>
  );
}
