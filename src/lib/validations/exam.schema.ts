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

export const examAnswerItemSchema = z.object({
  questionId: z.string().min(1),
  type: z.enum([
    "single_choice",
    "multiple_choice",
    "open_ended",
    "project_upload",
    "github_repo",
  ]),
  value: z.union([z.string(), z.array(z.string())]).optional(),
  fileKey: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  repoUrl: z.string().url("To'g'ri GitHub URL kiriting").optional().or(z.literal("")),
});

export const examSaveDraftSchema = z.object({
  examId: z.string().min(1),
  answers: z.array(examAnswerItemSchema),
});

export const examSubmitSchema = z.object({
  examId: z.string().min(1),
  answers: z.array(examAnswerItemSchema),
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
