"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { ARENA_MAPS, MAP_IDS, MAP_PACKS, packOf, type MapId, type MapPack } from "@/lib/live-game/pvp";
import { drawMapPreview } from "./pvp-draw";
import { useCountdown } from "../live-ui";
import { cn } from "@/lib/utils";

// Jang oldidan xarita uchun ovoz berish. Ikki to'plam (Klassik olamlar, Yovvoyi dunyolar) — har birida 4 xarita.
// Proyektor: ikkala to'plam ikki qatorda, ekran balandligiga sig'adi. Telefon: avval to'plam, keyin xarita (4 tasi bir qatorda).

export interface MapVoteView {
  endsInMs: number;
  counts: Record<MapId, number>;
  voted: number;
  total: number;
}

function Preview({ id, className }: { id: MapId; className?: string }) {
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
  return <canvas ref={ref} className={cn("block aspect-[16/9] w-full rounded-lg bg-black/40", className)} aria-hidden />;
}

const packVotes = (p: MapPack, counts: Record<MapId, number>) => p.maps.reduce((n, id) => n + (counts[id] ?? 0), 0);

function Header({ vote, title, big }: { vote: MapVoteView; title: string; big: boolean }) {
  const left = useCountdown(vote.endsInMs, vote.endsInMs > 0);
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className={cn("font-black uppercase tracking-[0.3em] text-fuchsia-300", big ? "text-sm" : "text-[10px] sm:text-xs")}>Kiber jang</p>
        <p className={cn("font-black leading-tight", big ? "text-3xl lg:text-4xl" : "text-xl sm:text-2xl")}>{title}</p>
        <p className={cn("text-slate-300", big ? "text-base" : "text-xs sm:text-sm")}>
          Ovoz berdi: <b className="text-white">{vote.voted}</b> / {vote.total}
        </p>
      </div>
      <span key={Math.ceil(left / 1000)} className={cn("quiz-count shrink-0 font-mono font-black tabular-nums", big ? "text-5xl lg:text-6xl" : "text-3xl sm:text-4xl", left <= 3000 && "text-rose-400")}>
        {Math.ceil(left / 1000)}
      </span>
    </div>
  );
}

/** Bitta xarita kartasi: ixcham (4 tasi bir qatorga sig'adi) */
function MapCard({
  id,
  n,
  max,
  mine,
  lead,
  big,
  onPick,
  busy,
}: {
  id: MapId;
  n: number;
  max: number;
  mine: boolean;
  lead: boolean;
  big: boolean;
  onPick?: () => void;
  busy?: boolean;
}) {
  const m = ARENA_MAPS[id];
  const Card = onPick ? "button" : "div";
  return (
    <Card
      {...(onPick ? { type: "button" as const, onClick: onPick, disabled: busy, "aria-pressed": mine } : {})}
      className={cn(
        "relative flex min-w-0 flex-col rounded-xl text-left ring-2 transition-all",
        big ? "gap-1.5 p-2" : "gap-1 p-1 sm:gap-1.5 sm:p-2",
        onPick && "cursor-pointer active:scale-[0.97]",
        mine ? "bg-white/15 ring-amber-300" : lead ? "bg-white/10 ring-fuchsia-400/70" : "bg-white/5 ring-white/10"
      )}
    >
      <Preview id={id} />
      <div className="flex min-w-0 items-center gap-1">
        <span className={cn("shrink-0", big ? "text-xl lg:text-2xl" : "text-sm sm:text-lg")}>{m.emoji}</span>
        <span className={cn("min-w-0 flex-1 font-black leading-tight", big ? "truncate text-sm lg:text-lg" : "line-clamp-2 text-[11px] sm:text-sm")}>{m.name}</span>
        <span className={cn("shrink-0 font-mono font-black tabular-nums", big ? "text-lg lg:text-2xl" : "text-sm sm:text-lg")}>{n}</span>
      </div>
      {big && <p className="truncate text-xs text-slate-300">{m.tagline}</p>}
      <div className={cn("overflow-hidden rounded-full bg-white/10", big ? "h-1.5" : "h-1")}>
        <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-300 transition-[width] duration-500" style={{ width: `${(n / max) * 100}%` }} />
      </div>
      {mine && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-900 shadow-lg sm:h-6 sm:w-6">
          <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={3} />
        </span>
      )}
    </Card>
  );
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
  const max = Math.max(1, ...MAP_IDS.map((id) => vote.counts[id] ?? 0));
  const leader = MAP_IDS.reduce((a, b) => ((vote.counts[b] ?? 0) > (vote.counts[a] ?? 0) ? b : a), MAP_IDS[0]);
  const isLead = (id: MapId) => (vote.counts[id] ?? 0) > 0 && id === leader;

  // Proyektor: ikkala to'plam ikki qatorda; kenglik ekran balandligidan cheklanadi — hammasi skrollsiz sig'adi
  if (!onVote) {
    return (
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 lg:gap-4" style={{ maxWidth: "min(100%, calc((100dvh - 300px) * 2.9))" }}>
        <Header vote={vote} title="Xarita uchun ovoz berish" big={big} />
        {MAP_PACKS.map((p) => (
          <section key={p.id} className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm font-black lg:text-base">
              <span className="text-lg">{p.emoji}</span> {p.name}
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-xs">{packVotes(p, vote.counts)} ovoz</span>
            </p>
            <div className="grid grid-cols-4 gap-2 lg:gap-3">
              {p.maps.map((id) => (
                <MapCard key={id} id={id} n={vote.counts[id] ?? 0} max={max} mine={false} lead={isLead(id)} big={big} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return <PlayerVote vote={vote} myVote={myVote} onVote={onVote} busy={busy} max={max} isLead={isLead} />;
}

/** Telefon: 1) to'plamni tanlash, 2) xaritani tanlash (4 tasi bir qatorda) */
function PlayerVote({
  vote,
  myVote,
  onVote,
  busy,
  max,
  isLead,
}: {
  vote: MapVoteView;
  myVote: MapId | null;
  onVote: (id: MapId) => void;
  busy: boolean;
  max: number;
  isLead: (id: MapId) => boolean;
}) {
  const [pack, setPack] = useState<MapPack["id"] | null>(myVote ? packOf(myVote).id : null);
  const current = MAP_PACKS.find((p) => p.id === pack) ?? null;

  if (!current) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <Header vote={vote} title="Xaritalar to'plamini tanlang" big={false} />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
          {MAP_PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPack(p.id)}
              className="group flex cursor-pointer flex-col gap-2 rounded-2xl bg-white/5 p-2.5 text-left ring-2 ring-white/10 transition-all hover:bg-white/10 active:scale-[0.98]"
            >
              <div className="grid grid-cols-4 gap-1 sm:grid-cols-2">
                {p.maps.map((id) => (
                  <Preview key={id} id={id} className="rounded-md" />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black leading-tight">{p.name}</span>
                  <span className="block text-xs leading-snug text-slate-300">{p.tagline}</span>
                </span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-xs font-black">{packVotes(p, vote.counts)}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-slate-400">Avval to&apos;plamni, keyin xaritani tanlang</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <Header vote={vote} title="Xaritani tanlang!" big={false} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPack(null)}
          className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-xl bg-white/10 px-2.5 text-xs font-bold hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" /> To&apos;plamlar
        </button>
        <span className="min-w-0 truncate text-sm font-black">
          {current.emoji} {current.name}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {current.maps.map((id) => (
          <MapCard key={id} id={id} n={vote.counts[id] ?? 0} max={max} mine={myVote === id} lead={isLead(id)} big={false} onPick={() => onVote(id)} busy={busy} />
        ))}
      </div>
      {myVote && (
        <p className="text-center text-xs font-semibold text-amber-200">
          Sizning ovozingiz: {ARENA_MAPS[myVote].emoji} {ARENA_MAPS[myVote].name}
        </p>
      )}
      <p className="text-center text-xs text-slate-400">Ovoz tugaguncha boshqasini (boshqa to&apos;plamdan ham) tanlash mumkin. Ovozi teng chiqsa — tasodifiy.</p>
    </div>
  );
}
