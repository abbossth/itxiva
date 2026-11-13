"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { ARENA_MAPS, MAP_IDS, type MapId } from "@/lib/live-game/pvp";
import { drawMapPreview } from "./pvp-draw";
import { useCountdown } from "../live-ui";
import { cn } from "@/lib/utils";

// Jang oldidan xarita uchun ovoz berish: proyektorda (katta, jonli hisob) va telefonda (bosib tanlash).

export interface MapVoteView {
  endsInMs: number;
  counts: Record<MapId, number>;
  voted: number;
  total: number;
}

function Preview({ id }: { id: MapId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => drawMapPreview(c, ARENA_MAPS[id]);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [id]);
  return <canvas ref={ref} className="block aspect-[16/9] w-full rounded-xl bg-black/40" aria-hidden />;
}

export function MapVote({
  vote,
  myVote = null,
  onVote,
  big = false,
  busy = false,
}: {
  vote: MapVoteView;
  myVote?: MapId | null;
  /** O'quvchi: bosib ovoz berish; berilmasa — faqat ko'rish (proyektor) */
  onVote?: (id: MapId) => void;
  big?: boolean;
  busy?: boolean;
}) {
  const left = useCountdown(vote.endsInMs, vote.endsInMs > 0);
  const max = Math.max(1, ...MAP_IDS.map((id) => vote.counts[id] ?? 0));
  const leader = MAP_IDS.reduce((a, b) => ((vote.counts[b] ?? 0) > (vote.counts[a] ?? 0) ? b : a), MAP_IDS[0]);
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", big && "gap-5")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-300">Kiber jang</p>
          <p className={cn("font-black", big ? "text-4xl sm:text-5xl" : "text-2xl")}>{onVote ? "Xaritani tanlang!" : "Xarita uchun ovoz berish"}</p>
          <p className="text-sm text-slate-300">
            Ovoz berdi: <b className="text-white">{vote.voted}</b> / {vote.total}
          </p>
        </div>
        <span key={Math.ceil(left / 1000)} className={cn("quiz-count font-mono font-black tabular-nums", big ? "text-6xl" : "text-4xl", left <= 3000 && "text-rose-400")}>
          {Math.ceil(left / 1000)}
        </span>
      </div>
      <div className={cn("grid gap-3", big ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2")}>
        {MAP_IDS.map((id) => {
          const m = ARENA_MAPS[id];
          const n = vote.counts[id] ?? 0;
          const mine = myVote === id;
          const lead = n > 0 && id === leader;
          const Card = onVote ? "button" : "div";
          return (
            <Card
              key={id}
              {...(onVote ? { type: "button" as const, onClick: () => onVote(id), disabled: busy, "aria-pressed": mine } : {})}
              className={cn(
                "relative flex flex-col gap-2 rounded-2xl p-2.5 text-left ring-2 transition-all",
                onVote && "cursor-pointer active:scale-[0.98]",
                mine ? "bg-white/15 ring-amber-300" : lead ? "bg-white/10 ring-fuchsia-400/70" : "bg-white/5 ring-white/10"
              )}
            >
              <Preview id={id} />
              <div className="flex items-center gap-2">
                <span className={big ? "text-3xl" : "text-2xl"}>{m.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-black", big ? "text-xl" : "text-sm")}>{m.name}</span>
                  <span className={cn("block text-slate-300", big ? "text-xs" : "line-clamp-2 text-[11px]")}>{m.tagline}</span>
                </span>
                <span className={cn("font-mono font-black tabular-nums", big ? "text-3xl" : "text-xl")}>{n}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-300 transition-[width] duration-500" style={{ width: `${(n / max) * 100}%` }} />
              </div>
              {mine && (
                <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-slate-900 shadow-lg">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              )}
            </Card>
          );
        })}
      </div>
      {onVote && <p className="text-center text-xs text-slate-400">Ovoz tugaguncha boshqasini tanlash mumkin. Ovozi teng chiqsa — tasodifiy.</p>}
    </div>
  );
}
