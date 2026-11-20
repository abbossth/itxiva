import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getPlayableGamesAction, getStudentGameSetupAction } from "@/actions/live-game.actions";
import { StudentGamesHub } from "@/components/live/student-games-hub";

export const metadata = {
  title: "Jonli o'yinlar — ITXiva",
};

export default async function StudentLiveGamesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "mentor") redirect("/mentor/live");
  const [setup, games] = await Promise.all([getStudentGameSetupAction(), getPlayableGamesAction()]);
  return <StudentGamesHub setup={setup.success ? setup.data : null} games={games.success ? games.data : []} />;
}
