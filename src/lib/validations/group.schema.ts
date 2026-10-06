import { z } from "zod";

export const scheduleSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1, "Kamida bitta dars kunini tanlang"),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Vaqt HH:MM ko'rinishida bo'lishi kerak"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Vaqt HH:MM ko'rinishida bo'lishi kerak"),
  })
  .refine((s) => s.endTime > s.startTime, "Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak");

export const groupSchema = z.object({
  name: z
    .string()
    .min(2, "Guruh nomi kamida 2 ta belgi bo'lishi kerak")
    .max(20, "Guruh nomi 20 belgidan oshmasligi kerak")
    .trim(),
  grade: z.coerce
    .number()
    .refine((val) => [8, 9, 10, 11].includes(val), "Sinf faqat 8, 9, 10 yoki 11 bo'lishi mumkin"),
  academicYear: z.string().default("2026-2027"),
  isActive: z.boolean().default(true),
  schedule: scheduleSchema.nullable().optional(),
});

export type GroupInput = z.infer<typeof groupSchema>;

export const importStudentsSchema = z.object({
  groupId: z.string().min(1, "Guruh tanlanishi shart"),
  rawText: z.string().min(2, "O'quvchilar ro'yxati kiritilmadi"),
});

export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
