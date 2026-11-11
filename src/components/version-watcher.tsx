"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Sayt yangi versiyaga o'tsa (deploy), eski ochiq sahifa serverdagi yangi kod bilan mos kelmay qoladi.
// Jonli o'yin sahifalari darhol o'zini yangilaydi (o'yin hamma uchun bir xil ishlashi shart),
// boshqa sahifalarda — kichik "Yangilash" tugmasi chiqadi (yozilayotgan matn yo'qolmasin).

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CHECK_MS = 30_000;

export function VersionWatcher() {
  const pathname = usePathname();
  const [stale, setStale] = useState(false);
  const live = /^\/(mentor\/)?live\//.test(pathname ?? "");

  useEffect(() => {
    if (BUILD === "dev") return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await r.json()) as { build?: string };
        if (alive && build && build !== "dev" && build !== BUILD) setStale(true);
      } catch {
        // tarmoq yo'q — keyinroq
      }
    };
    void check();
    const t = setInterval(check, CHECK_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Jonli o'yinda: 100 ta telefon bir lahzada qayta yuklanmasin (tasodifiy 2–25 s), savol/jang/mini-o'yin
  // davomida esa kutadi — sahifa <html data-live-busy="1"> belgisini qo'ygan bo'ladi
  useEffect(() => {
    if (!stale || !live) return;
    const at = Date.now() + 2000 + Math.random() * 23_000;
    const t = setInterval(() => {
      if (Date.now() >= at && document.documentElement.dataset.liveBusy !== "1") window.location.reload();
    }, 1000);
    return () => clearInterval(t);
  }, [stale, live]);

  if (!stale || live) return null;
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="fixed bottom-24 left-1/2 z-[90] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-xl ring-1 ring-white/10 lg:bottom-6"
    >
      <RefreshCw className="h-4 w-4" /> Sayt yangilandi — yangilash
    </button>
  );
}
