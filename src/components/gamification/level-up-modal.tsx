"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Award, Coins } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LevelBadge, XpBar } from "@/components/gamification/level-badge";
import { acknowledgeLevelUpAction, type LevelUpInfo } from "@/actions/gamification.actions";
import { fireConfetti } from "@/lib/confetti";
import { formatNumberUz } from "@/lib/utils";
import { LEVEL_UP_CLOSED_EVENT } from "@/lib/rewards-client";

/** Yangi darajaga chiqqanda bir marta ko'rsatiladigan tabrik oynasi */
export function LevelUpModal({ info }: { info: LevelUpInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  // Oyna sahifa yuklanishi bilan ochiq: portal serverda chizilmaydi, shuning uchun faqat brauzerda ko'rsatiladi
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    void fireConfetti({ particleCount: 140, spread: 90, origin: { y: 0.4 } });
  }, []);

  const close = (goTo?: string) => {
    setOpen(false);
    // Ko'rildi deb belgilanadi; xato bo'lsa keyingi kirishda yana ko'rinadi — bu zararsiz
    void acknowledgeLevelUpAction().catch(() => {});
    // Kutib turgan coin/XP tabrigi endi ko'rsatilishi mumkin
    window.dispatchEvent(new Event(LEVEL_UP_CLOSED_EVENT));
    if (goTo) router.push(goTo);
  };

  const nextPercent =
    info.nextXp !== null ? Math.min(100, Math.round((info.xp / info.nextXp) * 100)) : 100;

  return (
    <Dialog open={open && mounted} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <LevelBadge level={info.level} size="xl" />
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-300">Tabriklaymiz!</p>
          <DialogTitle className="text-xl font-black leading-tight text-slate-900 dark:text-slate-100">
            Siz yangi darajaga chiqdingiz
          </DialogTitle>
          <p className="font-mono text-2xl font-black text-teal-600 dark:text-teal-400">{info.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatNumberUz(info.xp)} XP to&apos;pladingiz. Shu sur&apos;atda davom eting!
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {info.bonus > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                <Coins className="h-3.5 w-3.5" />+{info.bonus} bonus
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
              <Award className="h-3.5 w-3.5" />
              Yangi profil ramkasi
            </span>
          </div>

          {info.nextLevel !== null && info.nextXp !== null && (
            <div className="w-full rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-3 text-left">
              <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  Keyingisi:{" "}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {info.nextLevel} · {info.nextName}
                  </strong>
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {formatNumberUz(info.xp)} / {formatNumberUz(info.nextXp)}
                </span>
              </div>
              <XpBar percent={nextPercent} />
            </div>
          )}

          <Button onClick={() => close()} size="lg" className="mt-1 w-full rounded-2xl">
            Davom etish
          </Button>
          <button
            type="button"
            onClick={() => close("/achievements")}
            className="min-h-[44px] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer"
          >
            Yutuqlarimni ko&apos;rish
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
