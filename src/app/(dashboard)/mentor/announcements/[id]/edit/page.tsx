import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { getAnnouncementForMentor, getAnnouncementPreviewUrls } from "@/actions/announcement.actions";
import { PageHeader } from "@/components/ui/page-header";
import { AnnouncementForm } from "@/components/announcements/announcement-form";

export const metadata = { title: "E'lonni tahrirlash — ITXiva" };

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMentorPage();
  const { id } = await params;
  const [announcement, groups] = await Promise.all([getAnnouncementForMentor(id), getGroups()]);
  if (!announcement) notFound();
  const previewUrls = await getAnnouncementPreviewUrls(announcement.images.map((i) => i.key));
  return (
    <div className="space-y-4">
      <PageHeader icon={Megaphone} title="E'lonni tahrirlash" backHref={`/mentor/announcements/${id}`} backLabel="Statistika" />
      <AnnouncementForm
        initial={announcement}
        initialPreviewUrls={previewUrls}
        groups={groups.map((g) => ({ _id: String(g._id), name: g.name, shortName: g.shortName, grade: g.grade }))}
      />
    </div>
  );
}
