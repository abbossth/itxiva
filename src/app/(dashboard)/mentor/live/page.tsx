import { requireMentorPage } from "@/lib/auth/guards";
import { getLiveGamesForMentorAction } from "@/actions/live-game.actions";
import { LiveGamesManager } from "@/components/live/live-games-manager";

export const metadata = {
  title: "Jonli o'yin — ITXiva",
};

export default async function MentorLiveGamesPage() {
  await requireMentorPage();
  const res = await getLiveGamesForMentorAction();
  return <LiveGamesManager games={res.success ? res.data : []} />;
}
