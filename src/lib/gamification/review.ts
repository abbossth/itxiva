import mongoose from "mongoose";
import { Quest, type IQuest } from "@/lib/db/models/quest.model";
import { QuestSubmission, type IQuestCheck, type IQuestEvidence } from "@/lib/db/models/quest-submission.model";
import { CertificateRegistry } from "@/lib/db/models/certificate-registry.model";
import { User } from "@/lib/db/models/user.model";
import { withTransaction } from "@/lib/db/transaction";
import { formatDateUz } from "@/lib/utils";
import { awardCoins, syncLevel } from "./award";
import { monthKey } from "./periods";
import { questXp } from "./quests";

// Dalil tekshiruvi: tizim tekshiruvlari, atomik tasdiqlash, rad etish va bekor qilish.

type Id = string | mongoose.Types.ObjectId;

export class ReviewError extends Error {
  constructor(message: string, readonly code: "not_pending" | "duplicate" | "not_found" | "invalid") {
    super(message);
  }
}

/**
 * Mentorga avtomatik ko'rsatiladigan tekshiruvlar: havola/ID takrorlanmagan, sana o'quvchi qo'shilgan kundan keyin,
 * oylik limit. `excludeId` — tekshirilayotgan yuborishning o'zi.
 */
export async function systemChecks(
  quest: Pick<IQuest, "_id" | "guard">,
  student: { _id: mongoose.Types.ObjectId; createdAt?: Date },
  evidence: IQuestEvidence,
  excludeId?: Id
): Promise<IQuestCheck[]> {
  const checks: IQuestCheck[] = [];
  const not = excludeId ? { _id: { $ne: new mongoose.Types.ObjectId(String(excludeId)) } } : {};

  if (evidence.normUrl || evidence.normCertId) {
    const or = [
      ...(evidence.normUrl ? [{ "evidence.normUrl": evidence.normUrl }] : []),
      ...(evidence.normCertId ? [{ "evidence.normCertId": evidence.normCertId }] : []),
    ];
    const [inRegistry, other] = await Promise.all([
      CertificateRegistry.findOne({
        $or: [...(evidence.normUrl ? [{ normUrl: evidence.normUrl }] : []), ...(evidence.normCertId ? [{ normCertId: evidence.normCertId }] : [])],
      })
        .select("submissionId")
        .lean(),
      QuestSubmission.findOne({ ...not, status: { $in: ["pending", "approved"] }, $or: or }).select("studentId").lean(),
    ]);
    const dupInRegistry = inRegistry && String(inRegistry.submissionId) !== String(excludeId ?? "");
    checks.push(
      dupInRegistry
        ? { key: "duplicate", ok: false, message: "Bu havola yoki ID avval qabul qilingan" }
        : other
          ? {
              key: "duplicate",
              ok: false,
              message: String(other.studentId) === String(student._id) ? "Xuddi shu dalil boshqa yuborishda bor" : "Xuddi shu dalilni boshqa o'quvchi yuborgan",
            }
          : { key: "duplicate", ok: true, message: "Havola va ID takrorlanmagan" }
    );
  }

  if (quest.guard?.dateAfterJoin && evidence.issuedAt && student.createdAt) {
    const joined = new Date(student.createdAt);
    joined.setHours(0, 0, 0, 0);
    const ok = new Date(evidence.issuedAt) >= joined;
    checks.push({
      key: "date",
      ok,
      message: ok ? "Sana dasturga qo'shilgandan keyin" : `Sana dasturga qo'shilishdan (${formatDateUz(student.createdAt)}) oldin`,
    });
  }

  if (quest.guard?.monthlyLimit) {
    const used = await QuestSubmission.countDocuments({
      ...not,
      questId: quest._id,
      studentId: student._id,
      monthKey: monthKey(),
      status: { $in: ["pending", "approved"] },
    });
    const ok = used < quest.guard.monthlyLimit;
    checks.push({ key: "monthly_limit", ok, message: `Shu oy ${used + (excludeId ? 1 : 0)}/${quest.guard.monthlyLimit}` });
  }
  return checks;
}

export interface ApproveInput {
  submissionId: Id;
  /** Oraliq mukofotda mentor tanlagan miqdor; musobaqada e'tiborga olinmaydi (o'rin bo'yicha) */
  coins: number;
  checklist?: { name?: boolean; course?: boolean; date?: boolean; program?: boolean };
  reviewerId: Id;
}

export interface ApproveResult {
  studentId: mongoose.Types.ObjectId;
  quest: IQuest;
  coins: number;
  xp: number;
  place: number | null;
}

/**
 * Atomik tasdiqlash: holat faqat pending → approved (shartli yangilash), reyestr yozuvi va coin bitta tranzaksiyada.
 * Ikki marta bosish yoki ikki mentor bir vaqtda tasdiqlashi ikki marta coin bermaydi.
 */
export async function approveSubmission(input: ApproveInput): Promise<ApproveResult> {
  const current = await QuestSubmission.findById(input.submissionId).lean();
  if (!current) throw new ReviewError("Yuborish topilmadi", "not_found");
  if (current.status !== "pending") throw new ReviewError("Bu ish allaqachon tekshirilgan", "not_pending");
  const quest = await Quest.findById(current.questId);
  if (!quest) throw new ReviewError("Topshiriq topilmadi", "not_found");

  let coins = Math.round(input.coins);
  if (quest.verify !== "competition" && (coins < quest.reward.coinsMin || coins > quest.reward.coinsMax)) {
    throw new ReviewError(`Mukofot ${quest.reward.coinsMin}–${quest.reward.coinsMax} coin oralig'ida bo'lsin`, "invalid");
  }
  await Promise.all([CertificateRegistry.init(), QuestSubmission.init()]);

  const result = await withTransaction(async (session) => {
    let place: number | null = null;
    if (quest.verify === "competition") {
      // Haftalik masala: tasdiqlanish tartibida birinchi uchtasi o'rin oladi
      const before = await QuestSubmission.countDocuments({ questId: quest._id, periodKey: current.periodKey, status: "approved" }).session(session ?? null);
      place = before < quest.reward.places.length ? before + 1 : null;
      coins = place ? quest.reward.places[place - 1] : 0;
    }
    const xp = questXp(quest, coins);

    const sub = await QuestSubmission.findOneAndUpdate(
      { _id: current._id, status: "pending" },
      {
        $set: {
          status: "approved",
          coins,
          xp,
          place,
          checklist: input.checklist ?? {},
          reviewedBy: input.reviewerId,
          reviewedAt: new Date(),
          rejectReason: "",
        },
      },
      { returnDocument: "after", session }
    );
    if (!sub) throw new ReviewError("Bu ish allaqachon tekshirilgan", "not_pending");

    if (quest.guard?.uniqueProof && (sub.evidence?.normUrl || sub.evidence?.normCertId)) {
      try {
        await CertificateRegistry.create(
          [
            {
              ...(sub.evidence.normUrl ? { normUrl: sub.evidence.normUrl } : {}),
              ...(sub.evidence.normCertId ? { normCertId: sub.evidence.normCertId } : {}),
              studentId: sub.studentId,
              questId: quest._id,
              submissionId: sub._id,
              platform: sub.evidence.platform,
              courseName: sub.evidence.courseName,
            },
          ],
          { session }
        );
      } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new ReviewError("Bu havola yoki ID avval qabul qilingan", "duplicate");
        throw error;
      }
    }

    if (coins > 0 || xp > 0) {
      const award = await awardCoins({
        studentId: sub.studentId,
        coin: coins,
        xp,
        type: "quest",
        referenceId: quest._id,
        description: `Topshiriq: ${quest.title}${place ? ` (${place}-o'rin)` : ""}`,
        idempotencyKey: `quest:${sub._id}`,
        session,
      });
      if (!award.ok) throw new ReviewError("O'quvchi topilmadi", "not_found");
    }
    return { studentId: sub.studentId as mongoose.Types.ObjectId, coins, xp, place };
  });

  // Tranzaksiyadan keyin: daraja (bonus va tabrik)
  if (result.xp > 0) await syncLevel(result.studentId);
  return { ...result, quest };
}

/** Rad etish: faqat kutilayotgan ish; o'quvchi qayta yubora oladi */
export async function rejectSubmission(submissionId: Id, reason: string, reviewerId: Id) {
  const sub = await QuestSubmission.findOneAndUpdate(
    { _id: submissionId, status: "pending" },
    { $set: { status: "rejected", rejectReason: reason, reviewedBy: reviewerId, reviewedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!sub) throw new ReviewError("Bu ish allaqachon tekshirilgan", "not_pending");
  return sub;
}

/**
 * Tasdiqlangan mukofotni bekor qilish (soxta dalil aniqlansa): coin va XP qaytariladi. Balans yetmasa — bor qismi.
 * Reyestr yozuvi qoladi (revoked) — xuddi shu dalil qayta qabul qilinmaydi.
 */
export async function revokeSubmission(submissionId: Id, reason: string, reviewerId: Id) {
  const sub = await QuestSubmission.findOneAndUpdate(
    { _id: submissionId, status: "approved", auto: false },
    { $set: { status: "rejected", rejectReason: reason, revokedAt: new Date(), reviewedBy: reviewerId } },
    { returnDocument: "after" }
  );
  if (!sub) throw new ReviewError("Faqat tasdiqlangan ishni bekor qilish mumkin", "not_pending");
  const user = await User.findById(sub.studentId).select("spendableBalance").lean();
  const coin = -Math.min(sub.coins, Math.max(user?.spendableBalance ?? 0, 0));
  if (coin !== 0 || sub.xp > 0) {
    await awardCoins({
      studentId: sub.studentId,
      coin,
      xp: -sub.xp,
      type: "adjustment",
      referenceId: sub.questId,
      description: `Topshiriq mukofoti bekor qilindi: ${reason}`,
      idempotencyKey: `quest-revoke:${sub._id}`,
    });
  }
  await CertificateRegistry.updateOne({ submissionId: sub._id }, { $set: { revoked: true } });
  return sub;
}
