import { requireMentorPage } from "@/lib/auth/guards";
import { getHomeworkInbox } from "@/actions/homework.actions";
import { HomeworkInbox } from "@/components/homework/homework-inbox";

export const metadata = {
  title: "Vazifa javoblari — ITXiva",
};

// Navigatsiyadagi son shu sahifaga olib keladi: kim qaysi vazifani topshirgani va tekshirish
export default async function MentorHomeworkPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  await requireMentorPage();
  const [{ group }, inbox] = await Promise.all([searchParams, getHomeworkInbox()]);
  return <HomeworkInbox pending={inbox.pending} recent={inbox.recent} initialGroupId={group} />;
}
