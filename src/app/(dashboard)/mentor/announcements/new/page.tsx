import { Megaphone } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { PageHeader } from "@/components/ui/page-header";
import { AnnouncementForm } from "@/components/announcements/announcement-form";

export const metadata = { title: "Yangi e'lon — ITXiva" };

export default async function NewAnnouncementPage() {
  await requireMentorPage();
  const groups = await getGroups();
  return (
    <div className="space-y-4">
      <PageHeader icon={Megaphone} title="Yangi e'lon" subtitle="O'quvchilar platformaga kirganda modal oynada ko'radi" backHref="/mentor/announcements" backLabel="E'lonlar" />
      <AnnouncementForm groups={groups.map((g) => ({ _id: String(g._id), name: g.name, shortName: g.shortName, grade: g.grade }))} />
    </div>
  );
}
