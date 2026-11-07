import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getLiveHostStateAction } from "@/actions/live-game.actions";
import { LiveHostScreen } from "@/components/live/live-host-screen";

export const metadata = {
  title: "Jonli o'yin — ITXiva",
};

export default async function LiveHostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMentorPage();
  const { id } = await params;
  const res = await getLiveHostStateAction(id);
  if (!res.success) notFound();
  return <LiveHostScreen initial={res.data} />;
}
