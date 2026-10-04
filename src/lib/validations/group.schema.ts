import { z } from "zod";

export const groupSchema = z.object({
  name: z
    .string()
    .min(2, "Guruh nomi kamida 2 ta belgi bo'lishi kerak")
    .max(20, "Guruh nomi 20 belgidan oshmasligi kerak")
    .trim(),
  grade: z.coerce
    .number()
    .refine((val) => [8, 9, 11].includes(val), "Sinf faqat 8, 9 yoki 11 bo'lishi mumkin"),
  academicYear: z.string().default("2025-2026"),
  isActive: z.boolean().default(true),
});

export type GroupInput = z.infer<typeof groupSchema>;

export const importStudentsSchema = z.object({
  groupId: z.string().min(1, "Guruh tanlanishi shart"),
  rawText: z.string().min(2, "O'quvchilar ro'yxati kiritilmadi"),
});

export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
