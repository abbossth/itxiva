import { requireAuth } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { getLeaderboardAction } from "@/actions/leaderboard.actions";
import { getGroups } from "@/actions/group.actions";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";

export const metadata = {
  title: "Reyting — ITXiva",
};

interface LeaderboardPageProps {
  searchParams: Promise<{
    type?: "all" | "group" | "grade";
    groupId?: string;
    grade?: string;
    /** "coin" — jami coin bo'yicha (sukutda XP, gamifikatsiya yoqilgan bo'lsa) */
    metric?: string;
  }>;
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const session = await requireAuth();
  const resolvedSearchParams = await searchParams;

  const type = resolvedSearchParams.type === "group" || resolvedSearchParams.type === "grade" ? resolvedSearchParams.type : "all";
  const groupId = resolvedSearchParams.groupId;
  const grade = resolvedSearchParams.grade ? parseInt(resolvedSearchParams.grade, 10) : undefined;
  const metric = resolvedSearchParams.metric === "coin" ? "coin" : undefined;

  await connectToDatabase();
  const [data, groups, viewer] = await Promise.all([
    getLeaderboardAction({ type, groupId, grade, metric }),
    getGroups(),
    User.findById(session.userId).select("celebrationsEnabled").lean(),
  ]);

  return (
    <LeaderboardView
      data={data}
      groups={groups}
      type={type}
      groupId={groupId}
      grade={grade}
      metric={metric}
      role={session.role === "mentor" ? "mentor" : "student"}
      viewerGroupId={session.groupId ? String(session.groupId) : null}
      // Salyutni har kim profil sozlamalarida o'zi uchun o'chirib qo'yishi mumkin
      celebrate={viewer?.celebrationsEnabled !== false}
    />
  );
}
