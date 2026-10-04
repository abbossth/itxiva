import { z } from "zod";

export const loginSchema = z.object({
  login: z
    .string()
    .min(3, "Login kamida 3 ta belgidan iborat bo'lishi kerak")
    .max(50, "Login juda uzun")
    .trim(),
  password: z
    .string()
    .min(4, "Parol kamida 4 ta belgidan iborat bo'lishi kerak"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(6, "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak")
      .max(50, "Parol juda uzun"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parollar bir-biriga mos kelmadi",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
