"use server";

import { connectToDatabase } from "@/lib/db/connect";
import { User, IUser } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { groupShortName } from "@/lib/group-name";
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
  /** Oxirgi 7 kunda reytingga qo'shilgan (yoki olingan) coin */
  weekCoins: number;
  isCurrentUser: boolean;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  currentUserEntry?: LeaderboardEntry | null;
  top3: LeaderboardEntry[];
  totalParticipants: number;
  /** Shu hafta eng ko'p coin yig'ganlar (faqat musbat natijalar), ko'pi bilan 3 ta */
  weekStars: LeaderboardEntry[];
  /** Ro'yxatdagi jami coin */
  totalCoins: number;
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
  const groupMap = new Map(matchingGroups.map((g) => [g._id.toString(), { name: groupShortName(g), grade: g.grade }]));

  // Query users
  const userQuery: Record<string, unknown> = {
    role: "student",
    isHiddenFromLeaderboard: false,
    groupId: { $in: matchingGroupIds },
  };

  const students = (await User.find(userQuery)
    .select("fullName groupId totalCoins")
    .sort({ totalCoins: -1, createdAt: 1 })
    .lean()) as unknown as IUser[];

  // Oxirgi 7 kundagi o'sish: do'kon xaridlari reytingga ta'sir qilmaydi, shuning uchun hisobga olinmaydi
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekRows = await CoinLedger.aggregate<{ _id: unknown; sum: number }>([
    { $match: { studentId: { $in: students.map((st) => st._id) }, createdAt: { $gte: weekAgo }, type: { $ne: "purchase" } } },
    { $group: { _id: "$studentId", sum: { $sum: "$amount" } } },
  ]);
  const weekMap = new Map(weekRows.map((r) => [String(r._id), r.sum]));

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
      weekCoins: weekMap.get(student._id.toString()) ?? 0,
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
    weekStars: entries
      .filter((e) => e.weekCoins > 0)
      .sort((a, b) => b.weekCoins - a.weekCoins)
      .slice(0, 3),
    totalCoins: entries.reduce((sum, e) => sum + e.totalCoins, 0),
  };
}
