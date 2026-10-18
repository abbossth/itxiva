import Link from "next/link";
import { Medal } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getBadgeStats } from "@/actions/quest.actions";
import { PageHeader } from "@/components/ui/page-header";
import { BADGE_BY_ID, TIER_LABEL } from "@/lib/gamification/badges";
import { BadgeMedal } from "@/components/gamification/badge-medal";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Marralar va nishonlar — ITXiva",
};

const TIER_TONE = {
  bronze: "bg-orange-700/10 text-orange-800 dark:text-orange-300",
  silver: "bg-slate-400/15 text-slate-700 dark:text-slate-300",
  gold: "bg-amber-400/20 text-amber-800 dark:text-amber-300",
} as const;

export default async function BadgesPage() {
  await requireMentorPage();
  const { rows, students } = await getBadgeStats();
  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        icon={Medal}
        title="Marralar va nishonlar"
        subtitle="Nishonlar avtomatik beriladi: har bir bosqich uchun bir marta coin. Darajalar chegaralari — sozlamalarda."
        actions={
          <Link href="/mentor/settings?tab=gamification" className="text-sm font-semibold text-teal-700 dark:text-teal-400 hover:underline">
            Darajalar va chegaralar →
          </Link>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((b) => (
          <section key={b.id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 space-y-3">
            <div className="flex items-center gap-3">
              <BadgeMedal id={b.id} tier="gold" size="sm" className="shrink-0" />
              <div>
                <h2 className="font-bold text-slate-900 dark:text-slate-100">{b.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{b.description}</p>
              </div>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {b.tiers.map((t) => (
                <li key={t.tier} className={cn("rounded-xl px-2.5 py-2", TIER_TONE[t.tier])}>
                  <div className="text-[11px] font-bold">
                    {BADGE_BY_ID[b.id]?.tierNames[t.tier]} <span className="font-normal opacity-75">· {TIER_LABEL[t.tier].toLowerCase()}</span>
                  </div>
                  <div className="font-mono text-sm font-black">{t.threshold}</div>
                  <div className="text-[11px]">+{t.coins} coin</div>
                  <div className="mt-1 text-[11px] font-semibold">
                    {t.students}/{students} o&apos;quvchi
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
