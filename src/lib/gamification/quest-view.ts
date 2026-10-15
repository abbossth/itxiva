import type mongoose from "mongoose";
import type { IQuest, IQuestData } from "@/lib/db/models/quest.model";

/** Brauzerga yuboriladigan topshiriq (ObjectId va sanalar matnga aylantirilgan) */
export type QuestView = Omit<IQuestData, "_id" | "audience" | "startsAt" | "endsAt" | "publishedAt" | "createdBy" | "createdAt" | "updatedAt"> & {
  _id: string;
  audience: { groupIds: string[]; grades: number[] };
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
};

export function toQuestView(q: IQuest | (IQuestData & { _id: mongoose.Types.ObjectId })): QuestView {
  const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
  return {
    _id: String(q._id),
    title: q.title,
    description: q.description ?? "",
    difficulty: q.difficulty,
    verify: q.verify,
    template: q.template ?? null,
    autoRule: q.autoRule ? { kind: q.autoRule.kind, target: q.autoRule.target } : null,
    evidence: { link: q.evidence?.link ?? "none", file: Boolean(q.evidence?.file), certId: Boolean(q.evidence?.certId), note: Boolean(q.evidence?.note) },
    guard: {
      uniqueProof: Boolean(q.guard?.uniqueProof),
      dateAfterJoin: Boolean(q.guard?.dateAfterJoin),
      monthlyLimit: q.guard?.monthlyLimit ?? null,
    },
    reward: { coinsMin: q.reward.coinsMin, coinsMax: q.reward.coinsMax, xp: q.reward.xp ?? null, places: [...(q.reward.places ?? [])] },
    audience: { groupIds: (q.audience?.groupIds ?? []).map(String), grades: [...(q.audience?.grades ?? [])] },
    repeat: q.repeat,
    startsAt: iso(q.startsAt),
    endsAt: iso(q.endsAt),
    status: q.status,
    isActive: q.isActive,
    notify: { announce: Boolean(q.notify?.announce), onSubmission: Boolean(q.notify?.onSubmission) },
    isSystem: Boolean(q.isSystem),
    publishedAt: iso(q.publishedAt),
  };
}

