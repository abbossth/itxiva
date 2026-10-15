import { requireMentorPage } from "@/lib/auth/guards";
import { getReviewQueue } from "@/actions/quest-review.actions";
import { ReviewQueue } from "@/components/mentor/quests/review-queue";

export const metadata = {
  title: "Tekshiruv navbati — ITXiva",
};

export default async function QuestReviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireMentorPage();
  const { view } = await searchParams;
  const mode = view === "approved" ? "approved" : "pending";
  const items = await getReviewQueue(mode);
  return <ReviewQueue key={mode} items={items} view={mode} />;
}
