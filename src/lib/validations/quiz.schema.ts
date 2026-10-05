import { z } from "zod";

export const quizQuestionSchema = z.object({
  _id: z.string().optional(),
  type: z.enum(["single_choice", "multiple_choice", "short_answer", "open_ended"]),
  prompt: z.string().min(3, "Savol matni kamida 3 ta belgidan iborat bo'lishi kerak"),
  options: z.array(z.string().min(1, "Variant bo'sh bo'lishi mumkin emas")).optional().default([]),
  correctAnswers: z.array(z.string()).default([]),
  points: z.coerce.number().min(1, "Ball kamida 1 bo'lishi kerak").default(1),
  explanation: z.string().optional(),
}).superRefine((q, ctx) => {
  if (q.type === "single_choice" || q.type === "multiple_choice") {
    if (q.options.length < 2) {
      ctx.addIssue({ code: "custom", message: `"${q.prompt}" savolida kamida 2 ta variant bo'lishi kerak` });
    }
    if (new Set(q.options).size !== q.options.length) {
      ctx.addIssue({ code: "custom", message: `"${q.prompt}" savolida variantlar takrorlanmasligi kerak` });
    }
    if (q.correctAnswers.length === 0 || q.correctAnswers.some((a) => !q.options.includes(a))) {
      ctx.addIssue({ code: "custom", message: `"${q.prompt}" savolida to'g'ri javobni belgilang` });
    }
    if (q.type === "single_choice" && q.correctAnswers.length > 1) {
      ctx.addIssue({ code: "custom", message: `"${q.prompt}" savolida faqat bitta to'g'ri javob bo'lishi kerak` });
    }
  }
  if (q.type === "short_answer" && q.correctAnswers.filter((a) => a.trim()).length === 0) {
    ctx.addIssue({ code: "custom", message: `"${q.prompt}" savoli uchun to'g'ri javobni kiriting` });
  }
});

export const quizUpsertSchema = z.object({
  lessonId: z.string().min(1, "Dars ID kiritilishi shart"),
  title: z.string().min(3, "Test sarlavhasi kamida 3 ta belgidan iborat bo'lishi kerak"),
  description: z.string().optional(),
  questions: z.array(quizQuestionSchema).min(1, "Kamida bitta savol bo'lishi kerak"),
  isPublished: z.boolean().default(true),
  passingScore: z.coerce.number().min(0).max(100).default(60),
});

export const quizSubmitSchema = z.object({
  quizId: z.string().min(1, "Quiz ID kiritilishi shart"),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      value: z.union([z.string(), z.array(z.string())]),
    })
  ),
});

export const quizGradeSchema = z.object({
  submissionId: z.string().min(1, "Topshiriq ID kiritilishi shart"),
  grades: z.array(
    z.object({
      questionId: z.string().min(1),
      pointsAwarded: z.coerce.number().min(0),
      mentorFeedback: z.string().optional(),
    })
  ),
});
