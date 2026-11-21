"use client";

import { useEffect, useRef, useState } from "react";
import { playPushAction, type LivePlayerState } from "@/actions/live-game.actions";
import { CharacterSvg } from "@/components/character/character-svg";
import type { GameLook } from "@/lib/character/catalog";
import { PUSH_GAP_MS, type PushDir } from "@/lib/live-game/push";
import { haptic } from "@/lib/haptics";
import { playBoom, playHurt, playWhoosh, unlockSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { PushCrack } from "./push-crack";

// Kutish zali: chap yoki o'ng qo'shnini hazil qilib ko'tarib otish. O'ziga, qo'shnisiga va proyektorda ko'rinadi.
// Bir marta otgandan keyin 10 soniya tugma yopiq.

type Lobby = NonNullable<LivePlayerState["lobby"]>;

/** Animatsiya bosqichlari (4,2 s ichida): otish, ekranga urilish, yerga tushish */
const THROW_AT = 1900;
const HIT_AT = 2100;
const LAND_AT = 3400;

export function LobbyPush({ gameId, lobby, look, onDone }: { gameId: string; lobby: Lobby; look: GameLook | null; onDone: () => void }) {
  // Bosilgan zahoti o'zida ko'rinsin (server javobini kutmasdan)
  const [local, setLocal] = useState<{ dir: PushDir; at: number; name: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Vaqtlar performance.now() asosida (bosish hodisasining timeStamp bilan bir xil)
  const [coolUntil, setCoolUntil] = useState(0);
  const [coolMs, setCoolMs] = useState(PUSH_GAP_MS);
  const [cool, setCool] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Qayta itarishgacha qolgan soniyalar
  useEffect(() => {
    if (!coolUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((coolUntil - performance.now()) / 1000));
      setCool(left);
      return left;
    };
    tick();
    const id = setInterval(() => tick() === 0 && clearInterval(id), 250);
    return () => clearInterval(id);
  }, [coolUntil]);

  const sounds = (thrown: boolean) => {
    timers.current.push(
      setTimeout(() => playWhoosh(0.7), THROW_AT),
      // Ekran oynasiga urilish
      setTimeout(() => {
        playBoom();
        if (thrown) playHurt();
        haptic(thrown ? [80, 30, 120] : [40]);
      }, HIT_AT),
      // Yerga tushish
      setTimeout(() => {
        playWhoosh(0.3);
        if (thrown) haptic([30]);
      }, LAND_AT)
    );
  };

  // Meni otishdi: ovoz va titrash (har bir otish uchun bir marta)
  const heard = useRef(0);
  useEffect(() => {
    const at = lobby.pushedBy?.at ?? 0;
    if (!at || heard.current === at) return;
    heard.current = at;
    unlockSound();
    haptic([20]);
    sounds(true);
  }, [lobby.pushedBy?.at]);

  const push = (dir: PushDir, ts: number) => {
    const who = lobby[dir];
    if (!who || ts < coolUntil) return;
    unlockSound();
    haptic([25, 20, 40]);
    sounds(false);
    setLocal({ dir, at: ts, name: who.name });
    setCoolUntil(ts + PUSH_GAP_MS);
    setCoolMs(PUSH_GAP_MS);
    setMsg(null);
    void playPushAction(gameId, dir)
      .then((r) => {
        if (!r.success) setMsg(r.error);
        else if (!r.data.pushed && r.data.waitMs > 0) {
          setCoolUntil(ts + r.data.waitMs);
          setCoolMs(r.data.waitMs);
        }
        onDone();
      })
      .catch(() => {});
  };

  const mine = local ?? (lobby.myPush ? { dir: lobby.myPush.dir, at: lobby.myPush.at, name: lobby.myPush.name } : null);
  const hit = lobby.pushedBy;
  // Otish davom etayotganda (men otayotgan yoki meni otishgan bo'lsa) — tugaguncha bosib bo'lmaydi
  const meBusy = Boolean(hit) || Boolean(lobby.myPush);
  // Kim harakatda: men ko'taraman (tashlanaman) yoki meni otishdi (uchaman)
  const meCls = hit ? (hit.dir === "left" ? "pushed-l" : "pushed-r") : mine ? (mine.dir === "left" ? "push-l" : "push-r") : undefined;
  const sideCls = (side: PushDir) => (mine && !hit && mine.dir === side ? (side === "left" ? "pushed-l" : "pushed-r") : undefined);

  if (!lobby.left && !lobby.right) {
    return <p className="mt-2 text-center text-xs text-white/50">Yoningizga boshqalar qo&apos;shilsa — ularni hazil qilib ko&apos;tarib otishingiz mumkin</p>;
  }

  return (
    <div className="mx-auto mt-3 w-full max-w-sm rounded-3xl bg-white/5 px-3 pb-3 pt-14 ring-1 ring-white/10">
      <div className={cn("flex items-end justify-center gap-1", hit && "push-shake")} key={`st${hit?.at ?? 0}`}>
        <Side who={lobby.left} cls={sideCls("left")} k={mine?.dir === "left" ? mine.at : 0} />
        <div key={`me${mine?.at ?? 0}-${hit?.at ?? 0}`} className={cn("relative flex flex-col items-center", meCls)}>
          <CharacterSvg look={look} size={74} mood="idle" pedestal={false} />
          {hit && (
            <>
              <PushCrack />
              <span className="push-dust" />
            </>
          )}
          <span className="-mt-1 rounded-full bg-amber-400 px-2 text-[10px] font-black text-slate-950">Siz</span>
        </div>
        <Side who={lobby.right} cls={sideCls("right")} k={mine?.dir === "right" ? mine.at : 0} />
      </div>
      {hit && (
        <p key={hit.at} className="live-pop mt-2 text-center text-sm font-black text-amber-300">
          {hit.name.split(" ")[0]} sizni ko&apos;tarib ekranga otdi!
        </p>
      )}
      {!hit && mine && (
        <p key={mine.at} className="live-pop mt-2 text-center text-sm font-black text-emerald-300">
          {mine.name.split(" ")[0]}ni ko&apos;tarib ekranga otdingiz!
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["left", "right"] as const).map((dir) => {
          const who = lobby[dir];
          return (
            <button
              key={dir}
              type="button"
              disabled={!who || cool > 0 || meBusy || who.busy}
              onClick={(ev) => push(dir, ev.timeStamp)}
              className="relative flex min-h-[48px] cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-500 to-indigo-600 px-2 text-sm font-black text-white shadow-lg transition active:scale-95 disabled:cursor-default disabled:opacity-40"
            >
              {/* Qayta itarishgacha qolgan vaqt — tugma ustida to'lib boruvchi chiziq */}
              {cool > 0 && who && (
                <span
                  key={coolUntil}
                  className="push-cool absolute inset-y-0 left-0 bg-white/20"
                  style={{ animationDuration: `${coolMs / 1000}s` }}
                />
              )}
              {dir === "left" && <span aria-hidden>◀</span>}
              <span className="relative truncate">
                {!who ? "Hech kim yo'q" : meBusy ? "Otish tugashini kuting" : who.busy ? `${who.name.split(" ")[0]} otishda…` : cool > 0 ? `${cool} s kuting` : `${who.name.split(" ")[0]}ni otish`}
              </span>
              {dir === "right" && <span aria-hidden>▶</span>}
            </button>
          );
        })}
      </div>
      {msg && <p className="mt-1 text-center text-xs font-bold text-rose-300">{msg}</p>}
    </div>
  );
}

function Side({ who, cls, k }: { who: Lobby["left"]; cls?: string; k: number }) {
  if (!who) return <div className="w-[64px]" />;
  return (
    <div key={`s${k}`} className={cn("relative flex flex-col items-center opacity-90", cls)}>
      <CharacterSvg look={who.look} size={58} mood="idle" pedestal={false} />
      {cls && (
        <>
          <PushCrack />
          <span className="push-dust" />
        </>
      )}
      <span className="-mt-1 max-w-[70px] truncate rounded-full bg-white/15 px-2 text-[10px] font-bold text-white">{who.name.split(" ")[0]}</span>
    </div>
  );
}
