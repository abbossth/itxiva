"use client";

import { useRef, useState } from "react";
import { playPushAction, type LivePlayerState } from "@/actions/live-game.actions";
import { CharacterSvg } from "@/components/character/character-svg";
import type { GameLook } from "@/lib/character/catalog";
import type { PushDir } from "@/lib/live-game/push";
import { haptic } from "@/lib/haptics";
import { playWhoosh, unlockSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

// Kutish zali: chap va o'ng qo'shni bilan hazillashish — itarish. O'ziga, qo'shnisiga va proyektorda ko'rinadi.

type Lobby = NonNullable<LivePlayerState["lobby"]>;

export function LobbyPush({ gameId, lobby, look, onDone }: { gameId: string; lobby: Lobby; look: GameLook | null; onDone: () => void }) {
  // Bosilgan zahoti o'zida ko'rinsin (server javobini kutmasdan)
  const [local, setLocal] = useState<{ dir: PushDir; at: number; name: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const last = useRef(-1e9);

  const push = (dir: PushDir, ts: number) => {
    const who = lobby[dir];
    if (!who || ts - last.current < 1500) return;
    last.current = ts;
    unlockSound();
    playWhoosh(0.5);
    haptic([25, 20, 40]);
    setLocal({ dir, at: ts, name: who.name });
    setMsg(null);
    void playPushAction(gameId, dir)
      .then((r) => {
        if (!r.success) setMsg(r.error);
        onDone();
      })
      .catch(() => {});
  };

  const mine = local ?? (lobby.myPush ? { dir: lobby.myPush.dir, at: lobby.myPush.at, name: lobby.myPush.name } : null);
  const hit = lobby.pushedBy;
  // Kim harakatda: men itaryapman (tashlanaman) yoki meni itarishdi (uchaman)
  const meCls = hit ? (hit.dir === "left" ? "pushed-l" : "pushed-r") : mine ? (mine.dir === "left" ? "push-l" : "push-r") : undefined;
  const sideCls = (side: PushDir) => (mine && mine.dir === side ? (side === "left" ? "pushed-l" : "pushed-r") : undefined);

  if (!lobby.left && !lobby.right) {
    return <p className="mt-2 text-center text-xs text-white/50">Yoningizga boshqalar qo&apos;shilsa — ularni hazil qilib itarishingiz mumkin</p>;
  }

  return (
    <div className="mx-auto mt-3 w-full max-w-sm rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="flex items-end justify-center gap-1">
        <Side who={lobby.left} cls={sideCls("left")} k={mine?.dir === "left" ? mine.at : 0} />
        <div key={`me${mine?.at ?? 0}-${hit?.at ?? 0}`} className={cn("relative z-[1] flex flex-col items-center", meCls)}>
          <CharacterSvg look={look} size={74} mood="idle" pedestal={false} />
          <span className="-mt-1 rounded-full bg-amber-400 px-2 text-[10px] font-black text-slate-950">Siz</span>
        </div>
        <Side who={lobby.right} cls={sideCls("right")} k={mine?.dir === "right" ? mine.at : 0} />
      </div>
      {hit && (
        <p key={hit.at} className="live-pop mt-2 text-center text-sm font-black text-amber-300">
          {hit.name.split(" ")[0]} sizni itarib yubordi!
        </p>
      )}
      {!hit && mine && (
        <p key={mine.at} className="live-pop mt-2 text-center text-sm font-black text-emerald-300">
          {mine.name.split(" ")[0]}ni itarib yubordingiz!
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["left", "right"] as const).map((dir) => {
          const who = lobby[dir];
          return (
            <button
              key={dir}
              type="button"
              disabled={!who}
              onClick={(ev) => push(dir, ev.timeStamp)}
              className="flex min-h-[48px] cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-b from-sky-500 to-indigo-600 px-2 text-sm font-black text-white shadow-lg transition active:scale-95 disabled:cursor-default disabled:opacity-30"
            >
              {dir === "left" && <span aria-hidden>◀</span>}
              <span className="truncate">{who ? `${who.name.split(" ")[0]}ni itarish` : "Hech kim yo'q"}</span>
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
    <div key={`s${k}`} className={cn("flex flex-col items-center opacity-90", cls)}>
      <CharacterSvg look={who.look} size={58} mood="idle" pedestal={false} />
      <span className="-mt-1 max-w-[70px] truncate rounded-full bg-white/15 px-2 text-[10px] font-bold text-white">{who.name.split(" ")[0]}</span>
    </div>
  );
}
