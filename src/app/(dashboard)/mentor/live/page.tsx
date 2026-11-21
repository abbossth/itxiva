import { requireMentorPage } from "@/lib/auth/guards";
import { getLiveGamesForMentorAction, getStudentGamesForMentorAction } from "@/actions/live-game.actions";
import { LiveGamesManager } from "@/components/live/live-games-manager";
import { StudentGamesPanel } from "@/components/live/student-games-panel";
import { RecentCheatsCard } from "@/components/mentor/recent-cheats-card";
import { getAppSettings } from "@/lib/settings";

export const metadata = {
  title: "Jonli o'yin — ITXiva",
};

export default async function MentorLiveGamesPage() {
  await requireMentorPage();
  const [res, student, settings] = await Promise.all([getLiveGamesForMentorAction(), getStudentGamesForMentorAction(), getAppSettings()]);
  const studentGames = student.success ? student.data : [];
  const panel = <StudentGamesPanel initialSettings={settings.studentGames} initialGames={studentGames} />;
  // O'quvchilar o'yini ketayotgan bo'lsa — kuzatuv paneli tepada
  const live = studentGames.some((g) => g.status !== "finished");
  return (
    <div className="space-y-6">
      {live && panel}
      <LiveGamesManager games={res.success ? res.data : []} />
      {!live && panel}
      <RecentCheatsCard />
    </div>
  );
}
