import { requireMentorPage } from "@/lib/auth/guards";
import { academicYearOptions, getAppSettings } from "@/lib/settings";
import { getArchiveItems } from "@/actions/archive.actions";
import { PlatformSettingsView } from "@/components/mentor/platform-settings-view";

export const metadata = {
  title: "Platforma sozlamalari — ITXiva",
};

export default async function PlatformSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireMentorPage();
  const [settings, archive, { tab }] = await Promise.all([getAppSettings(), getArchiveItems(), searchParams]);
  return (
    <PlatformSettingsView
      settings={settings}
      yearOptions={academicYearOptions(settings.academicYear)}
      archive={archive}
      initialTab={tab === "archive" || tab === "gamification" ? tab : "general"}
    />
  );
}
