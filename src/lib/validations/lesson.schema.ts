import { z } from "zod";

export const materialSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["file", "youtube", "link"]),
  title: z.string().min(1, "Material nomi kiritilishi shart").trim(),
  urlOrKey: z.string().min(1, "Havola yoki fayl kaliti kiritilishi shart"),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
});

export const lessonSchema = z.object({
  groupId: z.string().min(1, "Guruh tanlanishi shart"),
  quarter: z.coerce.number().min(1).max(4, "Chorak 1 dan 4 gacha bo'lishi kerak"),
  order: z.coerce.number().min(1).default(1),
  title: z.string().min(2, "Dars mavzusi kamida 2 ta belgi bo'lishi kerak").trim(),
  topic: z.string().optional().default(""),
  description: z.string().optional().default(""),
  date: z.string().optional(),
  isPublished: z.boolean().default(false),
  materials: z.array(materialSchema).default([]),
});

export type LessonInput = z.infer<typeof lessonSchema>;
export type MaterialInput = z.infer<typeof materialSchema>;
