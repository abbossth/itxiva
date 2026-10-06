import { z } from "zod";
import {
  HOMEWORK_MAX_FILES,
  HOMEWORK_MAX_LINKS,
  HOMEWORK_MAX_TEXT,
} from "@/lib/homework-status";

const httpUrl = z
  .string()
  .trim()
  .max(500, "Havola juda uzun")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Havola http:// yoki https:// bilan boshlanishi kerak");

export const homeworkFileSchema = z.object({
  key: z.string().min(1).max(400),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().max(150).optional(),
  size: z.number().nonnegative().optional(),
});

export const homeworkSubmitSchema = z
  .object({
    lessonId: z.string().min(1),
    text: z.string().max(HOMEWORK_MAX_TEXT, `Matn ${HOMEWORK_MAX_TEXT} belgidan oshmasligi kerak`).default(""),
    links: z.array(httpUrl).max(HOMEWORK_MAX_LINKS, `Ko'pi bilan ${HOMEWORK_MAX_LINKS} ta havola`).default([]),
    files: z.array(homeworkFileSchema).max(HOMEWORK_MAX_FILES, `Ko'pi bilan ${HOMEWORK_MAX_FILES} ta fayl`).default([]),
  })
  .refine((v) => v.text.trim().length > 0 || v.links.length > 0 || v.files.length > 0, {
    message: "Javob bo'sh: matn yozing, havola qo'shing yoki fayl yuklang",
  });

export const homeworkGradeSchema = z.object({
  submissionId: z.string().min(1),
  score: z.coerce.number().int("Ball butun son bo'lishi kerak").min(0).max(100, "Ball 0 dan 100 gacha"),
  feedback: z.string().trim().max(3000, "Izoh juda uzun").default(""),
  coins: z.coerce.number().int().min(0),
});

export const homeworkReturnSchema = z.object({
  submissionId: z.string().min(1),
  feedback: z.string().trim().min(3, "Nimani tuzatish kerakligini yozing").max(3000, "Izoh juda uzun"),
});

export type HomeworkSubmitInput = z.input<typeof homeworkSubmitSchema>;
export type HomeworkGradeInput = z.input<typeof homeworkGradeSchema>;
