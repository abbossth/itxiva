import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getLivePlayerStateAction } from "@/actions/live-game.actions";
import { LivePlayerScreen } from "@/components/live/live-player-screen";

export const metadata = {
  title: "Jonli o'yin — ITXiva",
};

export default async function LivePlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (user?.role === "mentor") redirect(`/mentor/live/${id}`);
  const res = await getLivePlayerStateAction(id);
  if (!res.success) notFound();
  return <LivePlayerScreen initial={res.data} />;
}
