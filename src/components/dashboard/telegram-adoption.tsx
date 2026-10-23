import Link from "@/components/ui/link";
import { CheckCircle2, Coins, Send } from "lucide-react";
import type { MentorDashboard } from "@/actions/dashboard.actions";
import { DashCard } from "@/components/dashboard/dashboard-parts";
import { TelegramAvatarStack } from "@/components/profile/telegram-community";
import { TELEGRAM_LINK_REWARD } from "@/lib/telegram/reward";
import { cn } from "@/lib/utils";

// Mentor bosh sahifasi: nechta o'quvchi Telegram'ni ulagan — umumiy ulush va guruhlar bo'yicha

const pct = (part: number, total: number) => (total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0);

function PercentRing({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-slate-100 dark:stroke-slate-800" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="stroke-sky-500 transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-extrabold tabular-nums leading-none text-slate-900 dark:text-slate-100">{percent}%</span>
        <Send className="mt-1 h-3.5 w-3.5 text-sky-500" aria-hidden />
      </span>
    </div>
  );
}

export function TelegramAdoptionCard({ telegram, groups }: { telegram: NonNullable<MentorDashboard["telegram"]>; groups: MentorDashboard["groups"] }) {
  const percent = pct(telegram.linked, telegram.total);
  const others = Math.max(0, telegram.linked - telegram.recent.length);
  const rows = groups.filter((g) => g.students > 0);
  const missing = telegram.total - telegram.linked;

  return (
    <DashCard title="Telegram'ni ulaganlar" icon={Send}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,18rem)_1fr] md:gap-8">
        <div className="flex items-center gap-4">
          <PercentRing percent={percent} />
          <div className="min-w-0 space-y-2">
            <p className="leading-tight">
              <span className="font-display text-2xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{telegram.linked}</span>
              <span className="text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400"> / {telegram.total}</span>
              <span className="block text-xs text-slate-600 dark:text-slate-400">o&apos;quvchi ulagan</span>
            </p>
            {telegram.linked > 0 && <TelegramAvatarStack recent={telegram.recent} others={others} />}
          </div>
        </div>

        {rows.length > 0 && (
          <ul className="space-y-1" aria-label="Guruhlar bo'yicha">
            {rows.map((g) => {
              const p = pct(g.telegram, g.students);
              const full = g.telegram >= g.students;
              return (
                <li key={g._id}>
                  <Link
                    href={`/mentor/groups/${g._id}`}
                    className="group flex min-h-[40px] items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="w-16 shrink-0 truncate font-mono text-xs font-bold text-teal-700 dark:text-teal-300" title={g.name}>
                      {g.shortName}
                    </span>
                    <span
                      className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      role="progressbar"
                      aria-valuenow={p}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${g.shortName}: Telegram ulaganlar`}
                    >
                      <span className={cn("block h-full rounded-full", full ? "bg-emerald-500" : "bg-sky-500")} style={{ width: `${p}%` }} />
                    </span>
                    <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {full && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Hammasi ulagan" />}
                      {g.telegram}/{g.students}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {missing > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-500/20 dark:text-amber-200">
          <Coins className="h-4 w-4 shrink-0" />
          {missing} ta o&apos;quvchi hali ulamagan — eslatib qo&apos;ying: ulasa +{TELEGRAM_LINK_REWARD} coin oladi.
        </p>
      )}
    </DashCard>
  );
}
