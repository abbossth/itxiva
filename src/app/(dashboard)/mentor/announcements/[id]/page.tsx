import { notFound } from "next/navigation";
import Link from "next/link";
import { BarChart3, Edit3, ExternalLink, FileText, ImageIcon } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getAnnouncementPreviewUrls, getAnnouncementStats } from "@/actions/announcement.actions";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { AnnouncementAudience } from "@/components/announcements/announcement-audience";
import { AnnouncementStatusBadge, AnnouncementStatusButtons } from "@/components/announcements/announcement-status";
import { formatDateTimeUz } from "@/lib/utils";

export const metadata = { title: "E'lon statistikasi — ITXiva" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const KIND_ICON = { link: ExternalLink, file: FileText, image: ImageIcon };

export default async function AnnouncementStatsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMentorPage();
  const { id } = await params;
  const stats = await getAnnouncementStats(id);
  if (!stats) notFound();
  const a = stats.announcement;
  const t = stats.totals;
  const imageUrls = await getAnnouncementPreviewUrls(a.images.map((i) => i.key));

  const tiles = [
    { label: "Auditoriya", value: t.audience, hint: a.audienceLabel },
    { label: "Ko'rdi", value: t.seen, hint: `${pct(t.seen, t.audience)}% · jami ${t.views} marta ochildi`, bar: pct(t.seen, t.audience) },
    { label: "Tushundi", value: t.dismissed, hint: `${pct(t.dismissed, t.audience)}% "Tushunarli" bosdi`, bar: pct(t.dismissed, t.audience) },
    { label: "Bosdi", value: t.clicked, hint: "havola, fayl yoki rasmni ochdi", bar: pct(t.clicked, t.audience) },
  ];

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        icon={BarChart3}
        title={a.title}
        subtitle={`${a.audienceLabel} · ${formatDateTimeUz(a.startsAt)}${a.endsAt ? ` — ${formatDateTimeUz(a.endsAt)}` : ""}`}
        backHref="/mentor/announcements"
        backLabel="E'lonlar"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AnnouncementStatusBadge phase={a.phase} />
            <Link href={`/mentor/announcements/${a._id}/edit`} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-[36px] gap-1.5" })}>
              <Edit3 className="h-3.5 w-3.5" /> Tahrirlash
            </Link>
            <AnnouncementStatusButtons id={a._id} status={a.status} />
          </div>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{tile.label}</div>
            <div className="mt-1 font-mono text-2xl font-black tabular-nums text-slate-900 dark:text-slate-100">{tile.value}</div>
            {tile.bar !== undefined && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-teal-500" style={{ width: `${tile.bar}%` }} />
              </div>
            )}
            <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{tile.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-4 min-w-0">
          {stats.targets.length > 0 && (
            <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5 space-y-3">
              <h2 className="font-bold text-slate-900 dark:text-slate-100">Nimani bosishdi</h2>
              <ul className="space-y-2">
                {stats.targets.map((x) => {
                  const Icon = KIND_ICON[x.kind];
                  return (
                    <li key={x.id} className="flex items-center gap-3 text-sm">
                      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{x.label}</span>
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct(x.students, t.audience)}%` }} />
                      </div>
                      <span className="w-16 text-right font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {x.students} o&apos;q.
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <AnnouncementAudience students={stats.students} />
        </div>

        <aside className="space-y-2 lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">O&apos;quvchi shunday ko&apos;radi</p>
          <AnnouncementCard
            data={{
              title: a.title,
              body: a.body,
              theme: a.theme,
              images: a.images.map((img, i) => ({ url: imageUrls[i], name: img.name })),
              files: a.files.map((f, index) => ({ index, name: f.name, size: f.size })),
              links: a.links.map((l, index) => ({ index, label: l.label || l.url, url: l.url })),
            }}
          />
        </aside>
      </div>
    </div>
  );
}
