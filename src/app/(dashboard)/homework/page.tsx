import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, ChevronRight, Clock } from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { getMyHomeworkList, MyHomeworkItem } from "@/actions/homework.actions";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { CoinBadge } from "@/components/ui/coin-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { describeDue, HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS } from "@/lib/homework-status";
import { formatDateTimeUz } from "@/lib/utils";

export const metadata = {
  title: "Vazifalarim — ITXiva",
};

function HomeworkRow({ item }: { item: MyHomeworkItem }) {
  const due = describeDue(item.dueAt);
  const needsWork = item.state === "missing" || item.state === "returned";
  return (
    <li>
      <Link
        href={`/lessons/${item.lessonId}#homework`}
        className="group flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] hover:border-teal-500/40 hover:shadow-md transition-all min-h-[72px]"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {item.quarter}-chorak · {item.order}-dars
            </span>
            <Badge variant={HOMEWORK_STATE_BADGE[item.state]}>{HOMEWORK_STATE_LABELS[item.state]}</Badge>
            {item.isLate && <Badge variant="danger">Kechikkan</Badge>}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            {item.lessonTitle}
          </h3>
          {item.dueAt && item.state !== "graded" && (
            <p
              className={`flex flex-wrap items-center gap-1.5 text-xs font-medium ${
                needsWork && due?.overdue ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{formatDateTimeUz(item.dueAt)}</span>
              {needsWork && due && <span>· {due.remaining}</span>}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {item.state === "graded" ? (
            <>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">{item.score}</span>
              {item.coinsAwarded > 0 && <CoinBadge amount={item.coinsAwarded} size="sm" animate={false} />}
            </>
          ) : (
            <CoinBadge amount={item.coinsReward} size="sm" animate={false} />
          )}
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
      </Link>
    </li>
  );
}

function Section({ title, items }: { title: string; items: MyHomeworkItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
        {title} <span className="text-slate-400 font-semibold">({items.length})</span>
      </h2>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <HomeworkRow key={item.lessonId} item={item} />
        ))}
      </ul>
    </section>
  );
}

export default async function MyHomeworkPage() {
  const session = await requireAuth();
  if (session.role === "mentor") redirect("/mentor/homework");

  const items = await getMyHomeworkList();
  const todo = items.filter((i) => i.state === "missing" || i.state === "returned");
  const waiting = items.filter((i) => i.state === "submitted");
  const graded = items.filter((i) => i.state === "graded");

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <PageHeader
        icon={ClipboardCheck}
        title="Vazifalarim"
        subtitle={
          todo.length > 0 ? `${todo.length} ta vazifani topshirish kerak` : "Uyga vazifalaringiz va baholaringiz"
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Hozircha uyga vazifa yo'q"
          description="Mentor darsga vazifa biriktirganda u shu yerda paydo bo'ladi."
        />
      ) : (
        <>
          <Section title="Topshirish kerak" items={todo} />
          <Section title="Tekshirilmoqda" items={waiting} />
          <Section title="Baholangan" items={graded} />
        </>
      )}
    </div>
  );
}
