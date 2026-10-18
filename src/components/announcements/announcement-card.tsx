"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { THEME_META, type AnnouncementTheme } from "@/lib/announcements";
import { formatFileSize } from "@/lib/homework-status";
import { cn } from "@/lib/utils";

export interface AnnouncementCardData {
  title: string;
  body: string;
  theme: AnnouncementTheme;
  images: { url: string; name: string }[];
  files: { index: number; name: string; size: number }[];
  links: { index: number; label: string; url: string }[];
}

/**
 * E'lon mazmuni: rangli sarlavha, rasmlar, matn, havolalar va fayllar. O'quvchi modalida ham,
 * mentor tahrirlashdagi oldindan ko'rishda ham aynan shu ko'rinadi.
 */
export function AnnouncementCard({
  data,
  onImage,
  onLink,
  onFile,
  footer,
}: {
  data: AnnouncementCardData;
  onImage?: (index: number) => void;
  onLink?: (index: number) => void;
  /** Faylni ochish (havola serverdan olinadi); bo'lmasa — oldindan ko'rish rejimi */
  onFile?: (index: number) => Promise<void>;
  footer?: React.ReactNode;
}) {
  const meta = THEME_META[data.theme] ?? THEME_META.info;
  const [active, setActive] = useState(0);
  const [opening, setOpening] = useState<number | null>(null);
  const image = data.images[Math.min(active, data.images.length - 1)];

  return (
    <div className="overflow-hidden rounded-[1.75rem] bg-white dark:bg-surface shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
      {/* Sarlavha: mavzu rangidagi gradient, katta belgi */}
      <div className={cn("relative overflow-hidden bg-gradient-to-br px-5 pb-5 pt-6 text-white sm:px-6", meta.gradient)}>
        <span aria-hidden className="absolute -right-6 -top-8 text-[7rem] leading-none opacity-20 select-none">
          {meta.emoji}
        </span>
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.35),transparent_55%)]" />
        <p className="relative text-[11px] font-black uppercase tracking-[0.25em] text-white/85">
          {meta.emoji} {meta.label}
        </p>
        <h2 id="announcement-title" className="relative mt-1.5 text-xl sm:text-2xl font-black leading-tight">
          {data.title || "Sarlavha"}
        </h2>
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
        {image && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onImage?.(active)}
              className="block w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
              aria-label={`${image.name} — kattaroq ochish`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.name} className="max-h-80 w-full object-contain" />
            </button>
            {data.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {data.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`${i + 1}-rasm`}
                    className={cn(
                      "h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition cursor-pointer",
                      i === active ? "ring-teal-500" : "ring-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {data.body && <p className="whitespace-pre-line text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-200">{data.body}</p>}

        {data.links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.links.map((l) => (
              <a
                key={l.index}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!onLink) e.preventDefault();
                  else onLink(l.index);
                }}
                className="inline-flex min-h-[40px] max-w-full items-center gap-2 rounded-xl bg-teal-600 px-3.5 text-sm font-bold text-white hover:bg-teal-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span className="truncate">{l.label}</span>
              </a>
            ))}
          </div>
        )}

        {data.files.length > 0 && (
          <ul className="space-y-1.5">
            {data.files.map((f) => (
              <li key={f.index}>
                <button
                  type="button"
                  disabled={opening !== null}
                  onClick={async () => {
                    if (!onFile) return;
                    setOpening(f.index);
                    try {
                      await onFile(f.index);
                    } finally {
                      setOpening(null);
                    }
                  }}
                  className="flex w-full min-h-[48px] items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-left hover:border-teal-500/50 transition-colors cursor-pointer disabled:opacity-70"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{f.name}</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">{formatFileSize(f.size) || "Fayl"}</span>
                  </span>
                  {opening === f.index ? (
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                  ) : (
                    <Download className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {footer && <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 sm:px-6">{footer}</div>}
    </div>
  );
}
