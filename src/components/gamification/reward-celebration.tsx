"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Star, Zap } from "lucide-react";
import { acknowledgeRewardsAction, getUnseenRewardsAction, type RewardSummary } from "@/actions/rewards.actions";
import { COIN_TYPE_COLORS } from "@/lib/coin-types";
import { fireConfetti, prefersReducedMotion } from "@/lib/confetti";
import { playRewardSound } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { LEVEL_UP_CLOSED_EVENT, REWARD_CHECK_EVENT, announceBalance } from "@/lib/rewards-client";
import { flyCoins } from "@/lib/coin-flight";
import { cn, formatNumberUz } from "@/lib/utils";

/** Sahifa almashganda yoki oynaga qaytilganda tekshiruvlar orasidagi eng kam vaqt */
const THROTTLE_MS = 15_000;
/** Amaldan keyin: server mukofotni javobdan keyin yozishi mumkin, shuning uchun bir necha marta tekshiriladi */
const AFTER_ACTION_DELAYS = [1200, 4000, 9000];

/**
 * O'quvchi coin yoki XP olganda — o'yindagidek katta tabrik oynasi. Mukofot qayerdan kelishidan qat'i nazar
 * (davomat, test, vazifa bahosi, topshiriq, nishon, kunlik kirish) keyingi ochilishda bir marta ko'rsatiladi.
 */
export function RewardCelebration({ waitForLevelUp }: { waitForLevelUp: boolean }) {
  const pathname = usePathname();
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const busy = useRef(false);
  const lastCheck = useRef(0);
  const blocked = useRef(waitForLevelUp);
  const open = useRef(false);

  const check = useCallback(async (force = false) => {
    if (busy.current || open.current || blocked.current) return;
    if (!force && Date.now() - lastCheck.current < THROTTLE_MS) return;
    busy.current = true;
    lastCheck.current = Date.now();
    try {
      const r = await getUnseenRewardsAction();
      if (r && !open.current) {
        open.current = true;
        setReward(r);
      }
    } catch {
      // Tabrik chiqmasa ham sahifa ishlayveradi
    } finally {
      busy.current = false;
    }
  }, []);

  // Sahifa ochilganda va boshqa sahifaga o'tilganda
  useEffect(() => {
    const t = setTimeout(() => void check(), 900);
    return () => clearTimeout(t);
  }, [pathname, check]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const onAction = () => AFTER_ACTION_DELAYS.forEach((d) => timers.push(setTimeout(() => void check(true), d)));
    const onLevelClosed = () => {
      blocked.current = false;
      timers.push(setTimeout(() => void check(true), 600));
    };
    const onVisible = () => document.visibilityState === "visible" && void check();
    window.addEventListener(REWARD_CHECK_EVENT, onAction);
    window.addEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener(REWARD_CHECK_EVENT, onAction);
      window.removeEventListener(LEVEL_UP_CLOSED_EVENT, onLevelClosed);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  // Yopilganda tangalar oynadan header'dagi balansga uchib boradi; balans birinchi tanga yetganda o'sadi
  const close = useCallback((coinRect?: DOMRect) => {
    if (!reward) return;
    if (reward.coins > 0 && reward.effects && coinRect) {
      const balance = reward.balance;
      flyCoins({ from: coinRect, amount: reward.coins, onFirstArrive: () => announceBalance(balance) });
    } else {
      announceBalance(reward.balance);
    }
    void acknowledgeRewardsAction(reward.until).catch(() => {});
    open.current = false;
    lastCheck.current = Date.now();
    setReward(null);
  }, [reward]);

  if (!reward) return null;
  return <RewardOverlay reward={reward} onClose={close} />;
}

function useCountUp(target: number, delayMs: number, durationMs = 1100): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        // Oxiriga yaqin sekinlashadi
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, delayMs, durationMs]);
  return value;
}

const SPARKLES = [
  { left: "12%", top: "18%", size: 14, delay: "0s" },
  { left: "82%", top: "14%", size: 18, delay: "0.5s" },
  { left: "88%", top: "52%", size: 12, delay: "1.1s" },
  { left: "6%", top: "58%", size: 16, delay: "0.8s" },
  { left: "70%", top: "34%", size: 10, delay: "1.4s" },
  { left: "26%", top: "40%", size: 10, delay: "0.3s" },
];

export function RewardOverlay({ reward, onClose: closeWith }: { reward: RewardSummary; onClose: (coinRect?: DOMRect) => void }) {
  const { effects } = reward;
  const coinRef = useRef<HTMLDivElement>(null);
  const onClose = useCallback(() => closeWith(coinRef.current?.getBoundingClientRect()), [closeWith]);
  const mainIsCoin = reward.coins > 0;
  const main = useCountUp(mainIsCoin ? reward.coins : reward.xp, 500);
  const xpCount = useCountUp(reward.xp, 900);
  const [barPercent, setBarPercent] = useState(reward.level?.percentBefore ?? 0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Fokus oynani pastga surib yubormasin: tanga va raqam ko'rinib tursin
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const timers = [setTimeout(() => setBarPercent(reward.level?.percentAfter ?? 0), 1100)];
    if (effects) {
      const big = reward.coins + reward.xp >= 20;
      timers.push(
        setTimeout(() => {
          playRewardSound();
          haptic(big ? [30, 60, 30, 60, 90] : [30, 60, 40]);
          const colors = ["#fbbf24", "#f59e0b", "#fde68a", "#14b8a6", "#ffffff"];
          void fireConfetti({ particleCount: big ? 120 : 70, spread: 90, startVelocity: 42, origin: { y: 0.42 }, colors, zIndex: 80 });
          if (big) {
            void fireConfetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors, zIndex: 80 });
            void fireConfetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors, zIndex: 80 });
          }
        }, 450)
      );
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      timers.forEach(clearTimeout);
    };
  }, [effects, onClose, reward]);

  const title = reward.coins + reward.xp >= 30 ? "Zo'r natija!" : "Mukofot!";
  const items = reward.items.slice(0, 4);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm animate-in fade-in" onClick={onClose} aria-hidden />

      {/* Past ekranda oyna skroll qilinadi: tepasi kesilib qolmaydi */}
      <div className="pointer-events-none relative flex min-h-full items-center justify-center p-4">
        <div className="reward-pop pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-amber-300/30 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-2xl shadow-amber-500/20">
          {/* Nurlar va yulduzchalar */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[5.5rem] h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2">
            <div
              className="reward-rays h-full w-full rounded-full opacity-40"
              style={{
                background: "repeating-conic-gradient(from 0deg, rgba(251,191,36,0.55) 0deg 10deg, transparent 10deg 30deg)",
                maskImage: "radial-gradient(circle, black 18%, transparent 62%)",
                WebkitMaskImage: "radial-gradient(circle, black 18%, transparent 62%)",
              }}
            />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.35),transparent_70%)]" />
          {SPARKLES.map((s, i) => (
            <Star
              key={i}
              aria-hidden
              className="reward-twinkle pointer-events-none absolute fill-amber-200 text-amber-200"
              style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
            />
          ))}

          <div className="relative flex flex-col items-center px-5 pb-5 pt-7 text-center sm:px-6 sm:pb-6 sm:pt-8">
            {/* Tanga */}
            <div ref={coinRef} className="reward-coin relative h-24 w-24" style={{ perspective: 600 }}>
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-[0_0_40px_rgba(251,191,36,0.6)]" />
              <div className="absolute inset-[7px] rounded-full border-2 border-amber-200/70 bg-gradient-to-br from-amber-300 to-amber-500" />
              <div className="absolute inset-0 flex items-center justify-center">
                {mainIsCoin ? (
                  <span className="font-mono text-4xl font-black text-amber-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">₵</span>
                ) : (
                  <Zap className="h-11 w-11 fill-amber-700 text-amber-800" />
                )}
              </div>
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <div className="reward-shine absolute inset-y-0 left-0 w-1/3 bg-white/40" />
              </div>
            </div>

            <p id="reward-title" className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-amber-300">
              {title}
            </p>

            <div className="reward-number mt-1 flex items-baseline gap-2">
              <span className="bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 bg-clip-text font-mono text-6xl font-black tabular-nums text-transparent drop-shadow-[0_4px_18px_rgba(251,191,36,0.35)]">
                +{formatNumberUz(main)}
              </span>
              <span className="text-lg font-black text-amber-200">{mainIsCoin ? "coin" : "XP"}</span>
            </div>

            {mainIsCoin && reward.xp > 0 && (
              <span
                className="reward-item mt-2 inline-flex items-center gap-1.5 rounded-full border border-teal-300/30 bg-teal-400/15 px-3.5 py-1.5 text-sm font-black text-teal-200"
                style={{ animationDelay: "0.8s" }}
              >
                <Zap className="h-4 w-4 fill-teal-300 text-teal-300" />+{formatNumberUz(xpCount)} XP
              </span>
            )}

            {items.length > 0 && (
              <ul className="mt-4 w-full space-y-2 text-left">
                {items.map((item, i) => (
                  <li
                    key={item.type}
                    className="reward-item flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5"
                    style={{ animationDelay: `${1 + i * 0.12}s` }}
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", COIN_TYPE_COLORS[item.type].bar)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-white">
                        {item.label}
                        {item.count > 1 && <span className="font-semibold text-slate-400"> ×{item.count}</span>}
                      </span>
                      {item.count === 1 && item.description && (
                        <span className="block truncate text-[11px] text-slate-400">{item.description}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-right font-mono text-sm font-black tabular-nums">
                      {item.coins > 0 && <span className="text-amber-300">+{item.coins}</span>}
                      {item.coins > 0 && item.xp > 0 && reward.xp > 0 && <span className="text-slate-500"> · </span>}
                      {item.xp > 0 && reward.xp > 0 && <span className="text-teal-300">+{item.xp} XP</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {reward.level && (
              <div className="reward-item mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left" style={{ animationDelay: "1.4s" }}>
                <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-bold text-white">
                    {reward.level.level}-daraja · {reward.level.name}
                  </span>
                  {reward.level.nextName && (
                    <span className="text-slate-400">
                      {reward.level.nextName}gacha <strong className="text-teal-300">{formatNumberUz(reward.level.toNext)} XP</strong>
                    </span>
                  )}
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 shadow-[0_0_12px_rgba(45,212,191,0.7)] transition-[width] duration-1000 ease-out"
                    style={{ width: `${barPercent}%` }}
                  />
                </div>
              </div>
            )}

            <p className="reward-item mt-4 text-xs text-slate-400" style={{ animationDelay: "1.5s" }}>
              Balansingiz: <strong className="font-mono text-amber-200">{formatNumberUz(reward.balance)} coin</strong>
            </p>

            <button
              ref={buttonRef}
              type="button"
              onClick={onClose}
              className="reward-item mt-5 inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-base font-black text-amber-950 shadow-lg shadow-amber-500/30 transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-amber-300/50"
              style={{ animationDelay: "1.6s" }}
            >
              <Sparkles className="h-5 w-5" />
              Zo&apos;r, davom etamiz!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
