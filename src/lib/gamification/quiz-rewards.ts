import mongoose from "mongoose";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { getAppSettings } from "@/lib/settings";
import { dateFromKey } from "@/lib/schedule";
import { awardCoins } from "./award";
import { dayKey } from "./periods";
import { evaluateAutoQuests, recordActivity } from "./quests";

// Testdan coin (gamifikatsiya): har savol uchun faqat birinchi to'g'ri javobga, kunlik chegara bilan.

export interface AnsweredQuestion {
  questionId: string;
  isCorrect?: boolean;
}

/** Bugun (Toshkent) testlardan olingan coin */
export async function quizCoinsToday(studentId: mongoose.Types.ObjectId): Promise<number> {
  const since = dateFromKey(dayKey());
  const [row] = await CoinLedger.aggregate<{ sum: number }>([
    { $match: { studentId, type: "quiz", createdAt: { $gte: since }, amount: { $gt: 0 } } },
    { $group: { _id: null, sum: { $sum: "$amount" } } },
  ]);
  return row?.sum ?? 0;
}

/**
 * Javob berilgan savollarni faollik sifatida yozadi va to'g'ri javoblar uchun coin beradi.
 * Natija: berilgan coin. Gamifikatsiya o'chiq bo'lsa hech narsa qilmaydi.
 */
export async function rewardQuizAnswers(studentIdRaw: string | mongoose.Types.ObjectId, answers: AnsweredQuestion[]): Promise<number> {
  const { gamification: s } = await getAppSettings();
  if (!s.enabled) return 0;
  const studentId = new mongoose.Types.ObjectId(String(studentIdRaw));

  for (const a of answers) await recordActivity(studentId, "quiz_answer", a.questionId, Boolean(a.isCorrect));

  let given = 0;
  const per = s.quizCoinPerQuestion;
  if (per > 0) {
    let remaining = s.quizDailyCap - (await quizCoinsToday(studentId));
    for (const a of answers) {
      if (!a.isCorrect) continue;
      if (remaining < per) break;
      const res = await awardCoins({
        studentId,
        coin: per,
        type: "quiz",
        description: "Test savoliga to'g'ri javob",
        // Savol uchun mukofot bir marta: qayta to'g'ri javob coin bermaydi
        idempotencyKey: `quiz:${studentId}:${a.questionId}`,
      });
      if (res.ok && res.applied) {
        given += per;
        remaining -= per;
      }
    }
  }

  await evaluateAutoQuests(studentId, s);
  return given;
}
