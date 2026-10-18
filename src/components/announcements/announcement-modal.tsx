"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check } from "lucide-react";
import {
  dismissAnnouncementAction,
  getAnnouncementFileUrlAction,
  getPendingAnnouncement,
  markAnnouncementSeenAction,
  trackAnnouncementClickAction,
  type StudentAnnouncement,
} from "@/actions/announcement.actions";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { LEVEL_UP_CLOSED_EVENT, OVERLAY_FREE_EVENT, claimOverlay, overlayBusy, releaseOverlay } from "@/lib/rewards-client";
import { fireConfetti, prefersReducedMotion } from "@/lib/confetti";
import { openResolvedUrl } from "@/lib/open-tab";

/**
 * Mentor e'loni: o'quvchi platformaga kirganda modal oynada chiqadi va "Tushunarli" bosilguncha har kirishda
 * ko'rsatiladi. Bir nechta bo'lsa — navbat bilan. Yangi daraja yoki mukofot oynasi ochiq bo'lsa, u yopilishini kutadi.
 */
export function AnnouncementModal({ waitForLevelUp, effects }: { waitForLevelUp: boolean; effects: boolean }) {
  const [item, setItem] = useState<StudentAnnouncement | null>(null);
  const blocked = useRef(waitForLevelUp);
  const loading = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (loading.current || blocked.current || overlayBusy("announcement")) return;
    loading.current = true;
    try {
      const next = await getPendingAnnouncement();
      if (next && !overlayBusy("announcement")) {
        claimOverlay("announcement");
        setItem(next);
        void markAnnouncementSeenAction(next._id).catch(() => {});
      }
    } catch {
      // E'lon chiqmasa ham sahifa ishlayveradi
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 600);
    const onLevelClosed = () => {
      blocked.current = false;
      setTimeout(() => void load(), 400);
    };
    const onFree = () => setTimeout(() => void load(), 300);
    window.addEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
    window.addEventListener(OVERLAY_FREE_EVENT, onFree);
    return () => {
      clearTimeout(t);
      window.removeEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
      window.removeEventListener(OVERLAY_FREE_EVENT, onFree);
    };
  }, [load]);

  // Ochilganda: tugmaga fokus, Escape — yopish; bayram e'lonida konfetti
  useEffect(() => {
    if (!item) return;
    buttonRef.current?.focus({ preventScroll: true });
    if (effects && (item.theme === "holiday" || item.theme === "celebration") && !prefersReducedMotion()) {
      void fireConfetti({ particleCount: 90, spread: 80, origin: { y: 0.3 }, zIndex: 80 });
    }
  }, [item, effects]);

  const dismiss = useCallback(() => {
    if (!item) return;
    setItem(null);
    // Yopilgani serverga yozilgach oyna bo'shatiladi — shundan keyin navbatdagi e'lon (bo'lsa) yoki mukofot chiqadi
    void dismissAnnouncementAction(item._id)
      .catch(() => {})
      .finally(() => releaseOverlay("announcement"));
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, dismiss]);

  if (!item) return null;

  return createPortal(
    <div className="fixed inset-0 z-[72] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm animate-in fade-in" onClick={dismiss} aria-hidden />
      <div className="pointer-events-none relative flex min-h-full items-center justify-center p-4">
        <div className="reward-pop pointer-events-auto relative w-full max-w-lg">
          <AnnouncementCard
            data={item}
            onImage={(i) => {
              void trackAnnouncementClickAction(item._id, `image:${i}`).catch(() => {});
              window.open(item.images[i].url, "_blank", "noopener,noreferrer");
            }}
            onLink={(i) => void trackAnnouncementClickAction(item._id, `link:${i}`).catch(() => {})}
            onFile={async (i) => {
              await openResolvedUrl(async () => {
                const res = await getAnnouncementFileUrlAction(item._id, i);
                return res.success ? res.url ?? null : null;
              });
            }}
            footer={
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {item.remaining > 0 ? `Yana ${item.remaining} ta e'lon bor` : "Mentoringizdan e'lon"}
                </span>
                <button
                  ref={buttonRef}
                  type="button"
                  onClick={dismiss}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-5 text-sm font-black text-white dark:text-slate-900 hover:opacity-90 transition cursor-pointer focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-teal-500/40"
                >
                  {item.remaining > 0 ? (
                    <>
                      Keyingisi <ArrowRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Tushunarli
                    </>
                  )}
                </button>
              </div>
            }
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
