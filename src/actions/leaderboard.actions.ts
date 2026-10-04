"use server";

import { connectToDatabase } from "@/lib/db/connect";
import { User, IUser } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { requireAuth } from "@/lib/auth/guards";
import { formatShortName } from "@/lib/utils";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  fullName?: string; // only for mentor
  groupName: string;
  grade: number;
  totalCoins: number;
  isCurrentUser: boolean;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  currentUserEntry?: LeaderboardEntry | null;
  top3: LeaderboardEntry[];
  totalParticipants: number;
}

export async function getLeaderboardAction({
  type = "all",
  groupId,
  grade,
}: {
  type?: "all" | "group" | "grade";
  groupId?: string;
  grade?: number;
  period?: "all" | "month" | "week";
}): Promise<LeaderboardData> {
  await connectToDatabase();
  const session = await requireAuth();

  // Find groups according to filter
  const groupFilter: Record<string, unknown> = { isActive: true };
  if (type === "group" && groupId) {
    groupFilter._id = groupId;
  } else if (type === "grade" && grade) {
    groupFilter.grade = grade;
  }

  const matchingGroups = await Group.find(groupFilter).lean();
  const matchingGroupIds = matchingGroups.map((g) => g._id);
  const groupMap = new Map(matchingGroups.map((g) => [g._id.toString(), { name: g.name, grade: g.grade }]));

  // Query users
  const userQuery: Record<string, unknown> = {
    role: "student",
    isHiddenFromLeaderboard: false,
    groupId: { $in: matchingGroupIds },
  };

  const students = (await User.find(userQuery)
    .sort({ totalCoins: -1, createdAt: 1 })
    .lean()) as unknown as IUser[];

  // Compute ranks with tie handling
  let currentRank = 1;
  const entries: LeaderboardEntry[] = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const prevCoins = i > 0 ? (students[i - 1]?.totalCoins ?? 0) : 0;
    const currentCoins = student.totalCoins ?? 0;
    if (i > 0 && currentCoins < prevCoins) {
      currentRank = i + 1;
    }

    const grp = student.groupId ? groupMap.get(student.groupId.toString()) : null;
    const isCurrentUser = student._id.toString() === session.userId;

    // Privacy formatting: student sees "Ali V.", mentor sees full name
    const displayName =
      session.role === "mentor" || isCurrentUser
        ? student.fullName
        : formatShortName(student.fullName);

    entries.push({
      rank: currentRank,
      userId: student._id.toString(),
      displayName,
      fullName: session.role === "mentor" ? student.fullName : undefined,
      groupName: grp ? grp.name : "—",
      grade: grp ? grp.grade : 0,
      totalCoins: student.totalCoins || 0,
      isCurrentUser,
    });
  }

  const currentUserEntry = entries.find((e) => e.isCurrentUser) || null;
  const top3 = entries.slice(0, 3);

  return {
    entries,
    currentUserEntry,
    top3,
    totalParticipants: entries.length,
  };
}
