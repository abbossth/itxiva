import { z } from "zod";
import mongoose from "mongoose";

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), "Noto'g'ri identifikator");
const coin = (label: string) => z.number({ error: `${label}: son kiriting` }).int(`${label}: butun son`).min(0, `${label}: manfiy bo'lmasin`).max(10000, `${label}: juda katta`);
const optionalDate = z
  .string()
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Sana noto'g'ri" });
      return z.NEVER;
    }
    return d;
  });

export const questInputSchema = z
  .object({
    title: z.string().trim().min(3, "Nomini yozing (kamida 3 ta belgi)").max(140, "Nom juda uzun"),
    description: z.string().trim().max(4000, "Tavsif juda uzun").default(""),
    difficulty: z.enum(["easy", "medium", "hard"]),
    verify: z.enum(["auto", "mentor", "proof", "competition"]),
    template: z.enum(["certificate", "project", "habit", "group_challenge", "weekly_problem"]).nullable().default(null),
    autoRule: z
      .object({
        kind: z.enum(["tests_today", "materials", "login", "login_streak", "month_attendance", "group_challenge"]),
        target: z.number().int().min(1, "Maqsad kamida 1").max(1000, "Maqsad juda katta"),
      })
      .nullable()
      .default(null),
    evidence: z.object({
      link: z.enum(["required", "optional", "none"]),
      file: z.boolean(),
      certId: z.boolean(),
      note: z.boolean(),
    }),
    guard: z.object({
      uniqueProof: z.boolean(),
      dateAfterJoin: z.boolean(),
      monthlyLimit: z.number().int().min(1, "Oylik limit kamida 1").max(100, "Oylik limit juda katta").nullable(),
    }),
    reward: z.object({
      coinsMin: coin("Coin (eng kami)"),
      coinsMax: coin("Coin (eng ko'pi)"),
      xp: z.number().int().min(0).max(10000).nullable(),
      places: z.array(coin("O'rin mukofoti")).max(3).default([]),
    }),
    audience: z.object({
      groupIds: z.array(objectId).max(50).default([]),
      grades: z.array(z.number().int().min(1).max(11)).max(11).default([]),
    }),
    repeat: z.enum(["once", "daily", "weekly", "unlimited"]),
    startsAt: optionalDate,
    endsAt: optionalDate,
    notify: z.object({ announce: z.boolean(), onSubmission: z.boolean() }),
    /** true — e'lon qilish, false — qoralama sifatida saqlash */
    publish: z.boolean(),
  })
  .superRefine((q, ctx) => {
    if (q.reward.coinsMax < q.reward.coinsMin) {
      ctx.addIssue({ code: "custom", path: ["reward", "coinsMax"], message: "Eng ko'p coin eng kamidan kichik bo'lmasin" });
    }
    if (q.verify === "auto" && !q.autoRule) {
      ctx.addIssue({ code: "custom", path: ["autoRule"], message: "Avtomatik topshiriq uchun shartni tanlang" });
    }
    if (q.verify === "auto" && q.reward.coinsMin !== q.reward.coinsMax) {
      ctx.addIssue({ code: "custom", path: ["reward"], message: "Avtomatik topshiriqda mukofot aniq miqdor bo'ladi" });
    }
    if (q.verify === "proof" && q.evidence.link === "none" && !q.evidence.file && !q.evidence.certId) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "Dalil uchun havola, fayl yoki sertifikat ID dan kamida bittasini so'rang" });
    }
    if (q.verify === "mentor" && q.evidence.link === "none" && !q.evidence.file && !q.evidence.note) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "O'quvchi nima yuborishini belgilang: havola, fayl yoki izoh" });
    }
    if (q.verify === "competition" && q.reward.places.length !== 3) {
      ctx.addIssue({ code: "custom", path: ["reward", "places"], message: "1–3-o'rinlar uchun mukofotni kiriting" });
    }
    if (q.startsAt && q.endsAt && q.endsAt <= q.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Tugash sanasi boshlanishdan keyin bo'lsin" });
    }
  });

export type QuestInput = z.input<typeof questInputSchema>;
