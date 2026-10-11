import { requireMentorPage } from "@/lib/auth/guards";
import { academicYearOptions, getAppSettings } from "@/lib/settings";
import { PlatformSettingsView } from "@/components/mentor/platform-settings-view";

export const metadata = {
  title: "Platforma sozlamalari — ITXiva",
};

export default async function PlatformSettingsPage() {
  await requireMentorPage();
  const settings = await getAppSettings();
  return <PlatformSettingsView settings={settings} yearOptions={academicYearOptions(settings.academicYear)} />;
}
