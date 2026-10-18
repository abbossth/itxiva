"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Coins, Sparkles } from "lucide-react";
import { LevelBadge, XpBar } from "@/components/gamification/level-badge";
import { LevelStage, celebrateLevel } from "@/components/gamification/level-reveal";
import { acknowledgeLevelUpAction, type LevelUpInfo } from "@/actions/gamification.actions";
import { formatNumberUz } from "@/lib/utils";
import { LEVEL_UP_CLOSED_EVENT } from "@/lib/rewards-client";
import { LEVEL_MATERIALS } from "@/lib/gamification/levels";

/**
 * Yangi darajaga chiqqanda bir marta: ekran qorayadi, yangi daraja emblemasi markazda kichikdan kattalashib,
 * aylanib "tushadi", chaqnaydi va nurlar ichida turadi; keyin unvon va tugmalar chiqadi.
 * Daraja bonusi coinlari keyingi mukofot oynasidan header'dagi balansga uchib boradi.
 */
export function LevelUpModal({ info }: { info: LevelUpInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Oyna sahifa yuklanishi bilan ochiq: portal serverda chizilmaydi, shuning uchun faqat brauzerda ko'rsatiladi
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const close = useCallback(
    (goTo?: string) => {
      setOpen(false);
      // Ko'rildi deb belgilanadi; xato bo'lsa keyingi kirishda yana ko'rinadi — bu zararsiz
      void acknowledgeLevelUpAction().catch(() => {});
      // Kutib turgan coin/XP tabrigi endi ko'rsatilishi mumkin
      window.dispatchEvent(new Event(LEVEL_UP_CLOSED_EVENT));
      if (goTo) router.push(goTo);
    },
    [router]
  );

  useEffect(() => {
    if (!mounted || !open) return;
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    // Emblema "tushgan" paytda: ovoz, titrash va ikki tomondan konfetti
    const t = setTimeout(celebrateLevel, 750);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [mounted, open, close]);

  if (!mounted || !open) return null;

  const nextPercent = info.nextXp !== null ? Math.min(100, Math.round((info.xp / info.nextXp) * 100)) : 100;

  return createPortal(
    <div className="fixed inset-0 z-[75] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="level-up-title">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md animate-in fade-in" onClick={() => close()} aria-hidden />

      <div className="pointer-events-none relative flex min-h-full flex-col items-center justify-center p-4 text-center text-white">
        {/* Emblema: markazda kattalashib tushadi, orqasida nurlar va chaqnash */}
        <LevelStage level={info.level} />

        <div className="pointer-events-auto relative -mt-2 w-full max-w-sm space-y-3">
          <p className="reward-item text-xs font-black uppercase tracking-[0.35em] text-amber-300" style={{ animationDelay: "1s" }}>
            Yangi daraja!
          </p>
          <h2 id="level-up-title" className="level-title text-3xl sm:text-4xl font-black leading-tight">
            <span className="bg-gradient-to-b from-white via-amber-100 to-amber-300 bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(251,191,36,0.35)]">
              {info.name}
            </span>
          </h2>
          <p className="reward-item text-sm text-white/75" style={{ animationDelay: "1.35s" }}>
            {info.level}-daraja · {LEVEL_MATERIALS[info.level - 1] ?? ""} emblema · {formatNumberUz(info.xp)} XP to&apos;pladingiz. Shu sur&apos;atda davom eting!
          </p>

          {info.bonus > 0 && (
            <p className="reward-item" style={{ animationDelay: "1.45s" }}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3.5 py-1.5 text-sm font-black text-amber-200">
                <Coins className="h-4 w-4" />+{info.bonus} coin bonus
              </span>
            </p>
          )}

          {info.nextLevel !== null && info.nextXp !== null && (
            <div className="reward-item flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left" style={{ animationDelay: "1.55s" }}>
              <LevelBadge level={info.nextLevel} size="sm" locked />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-white/70">
                    Keyingisi: <strong className="text-white">{info.nextName}</strong>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-white/60">
                    {formatNumberUz(info.xp)} / {formatNumberUz(info.nextXp)}
                  </span>
                </div>
                <XpBar percent={nextPercent} className="bg-white/10 dark:bg-white/10" />
              </div>
            </div>
          )}

          <button
            ref={buttonRef}
            type="button"
            onClick={() => close()}
            className="reward-item inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-base font-black text-amber-950 shadow-lg shadow-amber-500/30 transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-amber-300/50"
            style={{ animationDelay: "1.7s" }}
          >
            <Sparkles className="h-5 w-5" />
            Davom etish
          </button>
          <button
            type="button"
            onClick={() => close("/achievements")}
            className="reward-item min-h-[44px] w-full cursor-pointer text-sm font-semibold text-white/70 hover:text-white"
            style={{ animationDelay: "1.8s" }}
          >
            Yutuqlarimni ko&apos;rish
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
