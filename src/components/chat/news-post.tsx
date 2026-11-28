"use client";

import Link from "next/link";
import { Megaphone, Sparkles } from "lucide-react";
import type { NewsCard } from "@/lib/chat/news-feed";
import { DEFAULT_LOOK, gameLook } from "@/lib/character/catalog";
import { Art } from "@/components/news/whats-new-modal";

const LOOK = gameLook({ ...DEFAULT_LOOK, hair: "side", color: 1 }, 5);

/** Platform announcement in the chat: the "What's new" slides as one picture + text card from IT Xiva */
export function NewsPost({ card, stamp }: { card: NewsCard; stamp: React.ReactNode }) {
  const first = card.slides[0];
  return (
    <article className="w-full max-w-[22rem] overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-teal-900">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[repeating-conic-gradient(rgba(94,234,212,0.12)_0deg_10deg,transparent_10deg_24deg)]" />
        <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-black text-slate-950">
          <Sparkles className="h-3 w-3" /> {card.badge}
        </span>
        {first && (
          <div className="absolute inset-0 flex origin-bottom scale-[0.72] items-end justify-center pb-2">
            <Art art={first.art} look={LOOK} emoji={first.emoji} />
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
          <Megaphone className="h-3.5 w-3.5" /> IT Xiva · Yangilik
        </p>
        <h3 className="text-lg font-black leading-tight text-slate-900 dark:text-slate-100">{card.title}</h3>
        {card.slides.map((s, i) => (
          <div key={i} className="space-y-0.5">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{s.title}</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.text}</p>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 pt-1">
          {card.cta ? (
            <Link href={card.cta.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-itxiva-gradient px-4 text-sm font-black text-white">
              {card.cta.label}
            </Link>
          ) : (
            <span />
          )}
          {stamp}
        </div>
      </div>
    </article>
  );
}
