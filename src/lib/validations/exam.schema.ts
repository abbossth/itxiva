import { z } from "zod";

export const examQuestionSchema = z.object({
  _id: z.string().optional(),
  type: z.enum([
    "single_choice",
    "multiple_choice",
    "open_ended",
    "project_upload",
    "github_repo",
  ]),
  prompt: z.string().min(3, "Savol matni kamida 3 ta belgidan iborat bo'lishi kerak"),
  options: z.array(z.string().min(1)).optional().default([]),
  correctAnswers: z.array(z.string()).default([]),
  points: z.coerce.number().min(1, "Ball kamida 1 bo'lishi kerak").default(5),
  allowedFileTypes: z.array(z.string()).optional().default([".zip", ".pdf", ".png", ".jpg"]),
  maxFileSizeMb: z.coerce.number().min(1).max(100).default(50),
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
});

export const examUpsertSchema = z
  .object({
    groupIds: z.array(z.string()).min(1, "Kamida bitta guruh tanlanishi shart"),
    quarter: z.coerce.number().min(1).max(4),
    title: z.string().min(3, "Imtihon nomi kamida 3 ta belgidan iborat bo'lishi kerak"),
    description: z.string().optional(),
    startTime: z.string().min(1, "Boshlanish vaqti kiritilishi shart"),
    endTime: z.string().min(1, "Tugash vaqti kiritilishi shart"),
    durationMinutes: z.coerce.number().min(5, "Davomiyligi kamida 5 daqiqa bo'lishi kerak").max(300),
    maxAttempts: z.coerce.number().min(1).max(5).default(1),
    passingScore: z.coerce.number().min(0).max(100).default(60),
    isPublished: z.boolean().default(false),
    isResultsPublished: z.boolean().default(false),
    questions: z.array(examQuestionSchema).min(1, "Kamida bitta savol bo'lishi kerak"),
  })
  .refine(
    (data) => new Date(data.endTime) > new Date(data.startTime),
    {
      message: "Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak",
      path: ["endTime"],
    }
  );

// Havola mentor sahifasida bosiladigan bo'lib chiqadi — faqat http(s) (javascript: kabi sxemalar o'tmaydi)
const repoUrlSchema = z
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
  }, "Havola https:// bilan boshlanishi kerak");

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Noto'g'ri identifikator");

export const examAnswerItemSchema = z.object({
  questionId: z.string().min(1).max(64),
  type: z.enum([
    "single_choice",
    "multiple_choice",
    "open_ended",
    "project_upload",
    "github_repo",
  ]),
  // Hajm chegaralari: o'quvchi bazaga cheksiz katta javob yoza olmasligi uchun
  value: z.union([z.string().max(20000, "Javob juda uzun"), z.array(z.string().max(1000)).max(50)]).optional(),
  fileKey: z.string().max(400).optional(),
  fileName: z.string().max(300).optional(),
  fileSize: z.number().nonnegative().optional(),
  repoUrl: repoUrlSchema.optional().or(z.literal("")),
});

export const examSaveDraftSchema = z.object({
  examId: objectIdSchema,
  answers: z.array(examAnswerItemSchema).max(200),
});

export const examSubmitSchema = z.object({
  examId: objectIdSchema,
  answers: z.array(examAnswerItemSchema).max(200),
});

export const examGradeSchema = z.object({
  submissionId: z.string().min(1),
  grades: z.array(
    z.object({
      questionId: z.string().min(1),
      pointsAwarded: z.coerce.number().min(0),
      mentorFeedback: z.string().optional(),
    })
  ),
  mentorGeneralFeedback: z.string().optional(),
});
