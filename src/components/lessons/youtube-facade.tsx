"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface YouTubeFacadeProps {
  url: string;
  title?: string;
  className?: string;
}

function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export function YouTubeFacade({ url, title = "YouTube Video", className }: YouTubeFacadeProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    return (
      <div className={cn("aspect-video rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-4 text-center text-sm text-slate-500", className)}>
        Noto&apos;g&apos;ri YouTube havolasi: {url}
      </div>
    );
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  if (isPlaying) {
    return (
      <div className={cn("relative aspect-video w-full rounded-2xl overflow-hidden shadow-lg", className)}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsPlaying(true)}
      className={cn(
        "group relative aspect-video w-full rounded-2xl overflow-hidden cursor-pointer shadow-md bg-slate-900 border border-slate-200 dark:border-slate-800",
        className
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsPlaying(true);
        }
      }}
      aria-label={`${title} videosini ko'rish`}
    >
      <Image
        src={thumbnailUrl}
        alt={title}
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-105 opacity-90 group-hover:opacity-100"
        sizes="(max-width: 768px) 100vw, 800px"
      />
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />

      {/* Play Button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
          <Play className="w-8 h-8 fill-current translate-x-0.5" />
        </div>
      </div>

      <div className="absolute bottom-3 left-4 right-4 text-white text-xs sm:text-sm font-medium drop-shadow-md truncate">
        {title}
      </div>
    </div>
  );
}
