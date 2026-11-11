"use client";

import { useState } from "react";
import { CheckCircle2, Gamepad2, Skull, Swords, Trophy } from "lucide-react";
import type { LiveArenaView, LivePlayerState } from "@/actions/live-game.actions";
import { WAVES, arenaBonus } from "@/lib/live-game/arena-engine";
import { useCountdown } from "../live-ui";
import { ArenaGame, type ArenaResult } from "./arena-game";
import { cn, formatNumberUz } from "@/lib/utils";

// Arena: proyektorda jonli jadval (kim o'ynayapti, nechta dron, kim tugatdi), o'quvchida o'yinning o'zi.

export function ArenaHost({ arena }: { arena: LiveArenaView }) {
  const starts = useCountdown(arena.startsInMs, arena.startsInMs > 0);
  const left = useCountdown(arena.remainingMs, !arena.ended && arena.startsInMs === 0);
  return (
    <div className="flex h-full flex-col gap-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="quiz-pulse flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600">
            <Swords className="h-7 w-7" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Final bosqich</p>
            <p className="text-3xl font-black sm:text-5xl">Kiber arena</p>
          </div>
        </div>
        {starts > 0 ? (
          <span key={Math.ceil(starts / 1000)} className="quiz-count font-mono text-6xl font-black">
            {Math.ceil(starts / 1000)}
          </span>
        ) : arena.ended ? (
          <span className="live-pop rounded-full bg-emerald-500 px-4 py-2 text-lg font-black">Tugadi!</span>
        ) : (
          <span className={cn("font-mono text-5xl font-black tabular-nums sm:text-7xl", left <= 10_000 && "text-rose-400 quiz-shake")}>{Math.ceil(left / 1000)}</span>
        )}
      </div>
      <p className="text-sm text-slate-300 sm:text-base">
        Har kim o&apos;z qurilmasida dronlarga qarshi o&apos;ynaydi. To&apos;g&apos;ri javoblar — ko&apos;proq o&apos;q va zirh. {WAVES.length} to&apos;lqinni
        tugatganlarga katta bonus!
      </p>
      <ol className="live-noscroll grid min-h-0 flex-1 content-start gap-2 overflow-y-auto sm:grid-cols-2">
        {arena.rows.map((r, i) => (
          <li key={r.id} className={cn("flex items-center gap-3 rounded-2xl px-4 py-3", r.finished ? "bg-emerald-500/20 ring-1 ring-emerald-400/50" : r.dead ? "bg-white/[0.04] text-white/50" : "bg-white/10")}>
            <span className="w-6 font-mono font-black text-slate-400">{i + 1}</span>
            {r.finished ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : r.dead ? <Skull className="h-5 w-5" /> : <Gamepad2 className="h-5 w-5 text-fuchsia-300" />}
            <span className="min-w-0 flex-1 truncate text-lg font-black">{r.name}</span>
            <span className="text-sm font-bold text-slate-300">
              {r.waves}/{WAVES.length} · {r.kills} dron
            </span>
            {arena.ended && <span className="live-pop w-20 text-right font-mono font-black text-emerald-300">+{formatNumberUz(r.points)}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

type PlayerArena = NonNullable<LivePlayerState["arena"]>;

export function ArenaPlayer({ gameId, arena }: { gameId: string; arena: PlayerArena }) {
  const [result, setResult] = useState<ArenaResult | null>(null);
  const alreadyDone = arena.final || arena.ended;

  if (!result && !alreadyDone && arena.remainingMs > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ArenaGame gameId={gameId} loadout={{ ammo: arena.ammo, armor: arena.armor }} startsInMs={arena.startsInMs} remainingMs={arena.remainingMs} onDone={setResult} />
      </div>
    );
  }

  const r = result ?? { kills: arena.kills, waves: arena.waves, finished: arena.finished, dead: arena.dead };
  const expected = arenaBonus(r.kills, r.waves, r.finished);
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      {r.finished ? <Trophy className="h-16 w-16 text-amber-300" /> : r.dead ? <Skull className="h-16 w-16 text-rose-300" /> : <Swords className="h-16 w-16 text-fuchsia-300" />}
      <p className="text-3xl font-black lg:text-5xl">{r.finished ? "Arena zabt etildi!" : r.dead ? "Robotingiz yiqildi" : "Vaqt tugadi"}</p>
      <p className="font-mono text-lg text-slate-300 lg:text-2xl">
        {r.waves}/{WAVES.length} to&apos;lqin · {r.kills} dron
      </p>
      <p className="live-pop font-mono text-4xl font-black text-emerald-300 lg:text-6xl">+{formatNumberUz(arena.ended ? arena.points : expected)}</p>
      <p className="text-sm text-slate-400">{arena.ended ? "Bonus ochko qo'shildi" : "Boshqalar tugatishini kuting — g'oliblar tez orada"}</p>
    </div>
  );
}
