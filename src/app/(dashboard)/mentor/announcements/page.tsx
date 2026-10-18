import Link from "next/link";
import { BarChart3, Edit3, Megaphone, Plus } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getAnnouncementsForMentor } from "@/actions/announcement.actions";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { AnnouncementStatusBadge, AnnouncementStatusButtons } from "@/components/announcements/announcement-status";
import { THEME_META } from "@/lib/announcements";
import { formatDateTimeUz } from "@/lib/utils";

export const metadata = { title: "E'lonlar — ITXiva" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default async function AnnouncementsPage() {
  await requireMentorPage();
  const list = await getAnnouncementsForMentor();

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        icon={Megaphone}
        title="E'lonlar"
        subtitle="O'quvchilar platformaga kirganda modal oynada chiqadi: matn, rasm, havola va fayllar. Kim ko'rgani va bosgani — statistikada."
        actions={
          <Link href="/mentor/announcements/new" className={buttonVariants({ variant: "primary", className: "gap-2" })}>
            <Plus className="h-4 w-4" />
            Yangi e&apos;lon
          </Link>
        }
      />

      {list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center space-y-3">
          <div className="text-5xl">📢</div>
          <p className="font-bold text-slate-900 dark:text-slate-100">Hali e&apos;lon yo&apos;q</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Bayram tabrigi, imtihon eslatmasi yoki muhim xabar — o&apos;quvchilar kirishi bilan ko&apos;radi.</p>
          <Link href="/mentor/announcements/new" className={buttonVariants({ variant: "primary", className: "gap-2" })}>
            <Plus className="h-4 w-4" />
            Birinchi e&apos;lonni yaratish
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const meta = THEME_META[a.theme];
            const seen = pct(a.stats.seen, a.stats.audience);
            return (
              <li key={a._id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xl ${meta.gradient}`}>{meta.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/mentor/announcements/${a._id}`} className="font-bold text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300">
                        {a.title}
                      </Link>
                      <AnnouncementStatusBadge phase={a.phase} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {a.audienceLabel} · {formatDateTimeUz(a.startsAt)}
                      {a.endsAt ? ` — ${formatDateTimeUz(a.endsAt)}` : ""}
                      {a.images.length + a.files.length + a.links.length > 0 &&
                        ` · ${[a.images.length && `${a.images.length} rasm`, a.files.length && `${a.files.length} fayl`, a.links.length && `${a.links.length} havola`].filter(Boolean).join(", ")}`}
                    </p>
                    {a.status !== "draft" && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-teal-500" style={{ width: `${seen}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          <b>{a.stats.seen}</b>/{a.stats.audience} ko&apos;rdi · <b>{a.stats.dismissed}</b> tushundi · <b>{a.stats.clicked}</b> bosdi
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/mentor/announcements/${a._id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-[36px] gap-1.5" })}>
                      <BarChart3 className="h-3.5 w-3.5" /> Statistika
                    </Link>
                    <Link href={`/mentor/announcements/${a._id}/edit`} className={buttonVariants({ variant: "ghost", size: "sm", className: "min-h-[36px] gap-1.5" })}>
                      <Edit3 className="h-3.5 w-3.5" /> Tahrirlash
                    </Link>
                    <AnnouncementStatusButtons id={a._id} status={a.status} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
