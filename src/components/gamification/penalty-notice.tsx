"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarX2, ClipboardX, TriangleAlert } from "lucide-react";
import { acknowledgePenaltiesAction, getUnseenPenaltiesAction, type PenaltyNotice as Notice } from "@/actions/penalty.actions";
import { prefersReducedMotion } from "@/lib/confetti";
import { haptic } from "@/lib/haptics";
import { LEVEL_UP_CLOSED_EVENT, OVERLAY_FREE_EVENT, REWARD_CHECK_EVENT, claimOverlay, overlayBusy, releaseOverlay } from "@/lib/rewards-client";
import { drainCoins } from "@/lib/coin-flight";
import { formatNumberUz } from "@/lib/utils";

/** Sahifa almashganda yoki oynaga qaytilganda tekshiruvlar orasidagi eng kam vaqt */
const THROTTLE_MS = 15_000;

const NEXT_HINT = {
  absence: "Shu oyda yana sababsiz dars qoldirsangiz",
  homework: "Shu oyda yana vazifani topshirmasangiz",
} as const;

/**
 * Jarima haqida xabar: sababsiz qoldirilgan dars yoki muddatida topshirilmagan vazifa uchun balansdan coin olinganda
 * o'quvchi saytga keyingi kirishida bir marta ko'radi — qancha olingani, nega va keyingi safar qancha bo'lishi.
 */
export function PenaltyNotice({ waitForLevelUp }: { waitForLevelUp: boolean }) {
  const pathname = usePathname();
  // Daraja oynasi ochiq bo'lsa, u yopilguncha kutiladi
  const blocked = useRef(waitForLevelUp);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);
  const open = useRef(false);
  const lastCheck = useRef(0);

  const check = useCallback(async (force = false) => {
    if (busy.current || open.current || blocked.current || overlayBusy("penalty")) return;
    if (!force && Date.now() - lastCheck.current < THROTTLE_MS) return;
    busy.current = true;
    lastCheck.current = Date.now();
    try {
      const n = await getUnseenPenaltiesAction();
      if (n && !open.current && !overlayBusy("penalty")) {
        open.current = true;
        claimOverlay("penalty");
        setNotice(n);
      }
    } catch {
      // Oyna chiqmasa ham sahifa ishlayveradi
    } finally {
      busy.current = false;
    }
  }, []);

  // Mukofot oynasidan oldinroq tekshiriladi: avval jarima, keyin tabrik
  useEffect(() => {
    const t = setTimeout(() => void check(), 600);
    return () => clearTimeout(t);
  }, [pathname, check]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const onVisible = () => document.visibilityState === "visible" && void check();
    const onOverlayFree = () => timers.push(setTimeout(() => void check(), 500));
    const onAction = () => timers.push(setTimeout(() => void check(true), 1500));
    const onLevelClosed = () => {
      blocked.current = false;
      timers.push(setTimeout(() => void check(true), 300));
    };
    window.addEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
    window.addEventListener(OVERLAY_FREE_EVENT, onOverlayFree);
    window.addEventListener(REWARD_CHECK_EVENT, onAction);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
      window.removeEventListener(OVERLAY_FREE_EVENT, onOverlayFree);
      window.removeEventListener(REWARD_CHECK_EVENT, onAction);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const close = useCallback(() => {
    if (!notice) return;
    void acknowledgePenaltiesAction(notice.items.map((i) => i.id)).catch(() => {});
    open.current = false;
    lastCheck.current = Date.now();
    setNotice(null);
    releaseOverlay("penalty");
  }, [notice]);

  if (!notice) return null;
  return <PenaltyOverlay notice={notice} onClose={close} />;
}

function useCountDown(from: number, to: number, delayMs: number, durationMs = 1200): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : from));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [from, to, delayMs, durationMs]);
  return value;
}

export function PenaltyOverlay({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const coinRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wantedTotal = notice.items.reduce((sum, i) => sum + i.wanted, 0);
  const lost = useCountDown(0, notice.total, 700);
  const balance = useCountDown(notice.balance + notice.total, notice.balance, 900);
  const short = notice.total < wantedTotal;

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const timer = setTimeout(() => {
      const rect = coinRef.current?.getBoundingClientRect();
      if (rect && notice.total > 0) drainCoins({ to: rect, amount: notice.total });
      if (notice.effects) haptic([70, 50, 70]);
    }, 350);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [notice, onClose]);

  const nextHints = (Object.entries(notice.next) as [keyof typeof NEXT_HINT, number][]).filter(([, n]) => n > 0);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="penalty-title">
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm animate-in fade-in" onClick={onClose} aria-hidden />

      <div className="pointer-events-none relative flex min-h-full items-center justify-center p-4">
        <div className="reward-pop pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-red-400/30 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-2xl shadow-red-600/20">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.32),transparent_70%)]" />

          <div className="relative flex flex-col items-center px-5 pb-5 pt-7 text-center sm:px-6 sm:pb-6 sm:pt-8">
            {/* Tanga: balansdan tushgan tangalar shu yerga yig'iladi va u "yorilib" titraydi */}
            <div ref={coinRef} className="penalty-coin relative h-24 w-24">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-300 via-slate-400 to-slate-600 shadow-[0_0_40px_rgba(239,68,68,0.45)]" />
              <div className="absolute inset-[7px] rounded-full border-2 border-slate-200/60 bg-gradient-to-br from-slate-300 to-slate-500" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-4xl font-black text-slate-700 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">₵</span>
              </div>
              {/* Yoriq */}
              <svg aria-hidden viewBox="0 0 96 96" className="penalty-crack absolute inset-0 h-full w-full">
                <path d="M52 6 L44 30 L56 42 L40 60 L50 74 L44 92" fill="none" stroke="rgb(127 29 29)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/40">
                <TriangleAlert className="h-4 w-4 text-white" />
              </span>
            </div>

            <p id="penalty-title" className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-red-300">
              Balansdan coin olindi
            </p>

            <div className="reward-number mt-1 flex items-baseline gap-2">
              <span className="font-mono text-6xl font-black tabular-nums text-red-400 drop-shadow-[0_4px_18px_rgba(239,68,68,0.35)]">
                −{formatNumberUz(lost)}
              </span>
              <span className="text-lg font-black text-red-200">coin</span>
            </div>

            <ul className="mt-4 w-full space-y-2 text-left">
              {notice.items.slice(0, 5).map((item, i) => {
                const Icon = item.kind === "absence" ? CalendarX2 : ClipboardX;
                return (
                  <li
                    key={item.id}
                    className="reward-item flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5"
                    style={{ animationDelay: `${0.9 + i * 0.12}s` }}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-white">{item.reason}</span>
                    <span className="shrink-0 text-right font-mono text-sm font-black tabular-nums text-red-300">
                      −{item.applied}
                      {item.applied < item.wanted && <span className="block text-[10px] font-semibold text-slate-400 line-through">−{item.wanted}</span>}
                    </span>
                  </li>
                );
              })}
              {notice.items.length > 5 && (
                <li className="text-center text-xs text-slate-400">yana {notice.items.length - 5} ta jarima</li>
              )}
            </ul>

            {short && (
              <p className="reward-item mt-3 text-xs text-slate-400" style={{ animationDelay: "1.3s" }}>
                Balansda yetarli coin yo&apos;q edi — bor coinlar olindi.
              </p>
            )}

            <p className="reward-item mt-3 text-sm text-slate-300" style={{ animationDelay: "1.4s" }}>
              Balansingiz: <strong className="font-mono text-amber-200 tabular-nums">{formatNumberUz(balance)} coin</strong>
            </p>

            {nextHints.length > 0 && (
              <div className="reward-item mt-4 w-full space-y-1 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3.5 py-2.5 text-left text-xs text-amber-100" style={{ animationDelay: "1.5s" }}>
                {nextHints.map(([kind, amount]) => (
                  <p key={kind}>
                    {NEXT_HINT[kind]}: <strong className="font-mono text-amber-300">−{amount} coin</strong>
                  </p>
                ))}
              </div>
            )}

            <button
              ref={buttonRef}
              type="button"
              onClick={onClose}
              className="reward-item mt-5 inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-2xl bg-white text-base font-black text-slate-900 shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-red-300/50"
              style={{ animationDelay: "1.6s" }}
            >
              Tushundim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
