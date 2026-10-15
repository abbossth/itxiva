"use server";

import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { getCurrentUser, requireStudent } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { buildLevels, levelProgress } from "@/lib/gamification/levels";

export interface LevelSummary {
  level: number;
  name: string;
  xp: number;
  /** Keyingi daraja chegarasi; oxirgi darajada null */
  nextXp: number | null;
  nextName: string | null;
  percent: number;
  toNext: number;
  balance: number;
}

export interface LevelUpInfo {
  level: number;
  name: string;
  xp: number;
  bonus: number;
  nextLevel: number | null;
  nextName: string | null;
  nextXp: number | null;
}

/** Yon menyu va sarlavha uchun: o'quvchining darajasi va tabrik oynasi (gamifikatsiya yoqilgan bo'lsa) */
export async function getStudentLevelState(): Promise<{ summary: LevelSummary; levelUp: LevelUpInfo | null } | null> {
  const session = await getCurrentUser();
  if (session?.role !== "student") return null;
  const { gamification } = await getAppSettings();
  if (!gamification.enabled) return null;

  await connectToDatabase();
  const user = await User.findById(session.userId).select("xp spendableBalance pendingLevelUp").lean();
  if (!user) return null;

  const levels = buildLevels(gamification.levelThresholds);
  const p = levelProgress(user.xp ?? 0, levels);
  const summary: LevelSummary = {
    level: p.current.level,
    name: p.current.name,
    xp: p.xp,
    nextXp: p.next?.minXp ?? null,
    nextName: p.next?.name ?? null,
    percent: p.percent,
    toNext: p.toNext,
    balance: user.spendableBalance ?? 0,
  };

  const pending = user.pendingLevelUp ?? null;
  const reached = pending ? levels[pending - 1] : null;
  const after = pending ? levels[pending] ?? null : null;
  const levelUp: LevelUpInfo | null = reached
    ? {
        level: reached.level,
        name: reached.name,
        xp: p.xp,
        bonus: gamification.levelUpBonus,
        nextLevel: after?.level ?? null,
        nextName: after?.name ?? null,
        nextXp: after?.minXp ?? null,
      }
    : null;
  return { summary, levelUp };
}

/** Tabrik oynasi yopildi — qayta ko'rsatilmaydi */
export async function acknowledgeLevelUpAction(): Promise<void> {
  const session = await requireStudent();
  await connectToDatabase();
  await User.updateOne({ _id: session.userId }, { $set: { pendingLevelUp: null } });
}
