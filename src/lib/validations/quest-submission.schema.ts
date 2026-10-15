import { z } from "zod";
import mongoose from "mongoose";

export const questEvidenceSchema = z.object({
  questId: z.string().refine((v) => mongoose.isValidObjectId(v), "Topshiriq topilmadi"),
  platform: z.string().trim().max(40).optional().default(""),
  courseName: z.string().trim().max(200, "Kurs nomi juda uzun").optional().default(""),
  url: z.string().trim().max(500, "Havola juda uzun").optional().default(""),
  certId: z.string().trim().max(120, "ID juda uzun").optional().default(""),
  issuedAt: z.string().trim().max(40).optional().default(""),
  note: z.string().trim().max(2000, "Izoh juda uzun").optional().default(""),
  file: z
    .object({
      key: z.string().min(1).max(400),
      name: z.string().trim().min(1).max(200),
      size: z.number().int().positive(),
      mimeType: z.string().max(100),
    })
    .nullable()
    .optional()
    .default(null),
  /** "Sertifikat menga tegishli va haqiqiy" tasdig'i */
  confirmed: z.boolean().optional().default(false),
});

export type QuestEvidenceInput = z.input<typeof questEvidenceSchema>;
