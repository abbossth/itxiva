import { z } from "zod";

export const productSchema = z.object({
  title: z.string().trim().min(2, "Mahsulot nomi kamida 2 ta belgi bo'lishi kerak").max(80),
  description: z.string().trim().max(500).optional().default(""),
  price: z.coerce.number().int("Narx butun son bo'lishi kerak").min(1, "Narx kamida 1 coin").max(100000),
  // Hayotdagi narxi (so'm), faqat mentor uchun. Berilmasa o'zgarmaydi; null — o'chiriladi
  realPrice: z.union([z.coerce.number().int().min(0).max(1_000_000_000), z.null()]).optional(),
  // Vaqtinchalik chegirma: berilmasa o'zgarmaydi; null — chegirma olib tashlanadi
  // null avval tekshiriladi: coerce null'ni 0 yoki 1970-yilga aylantirib yubormasin
  salePrice: z.union([z.null(), z.coerce.number().int("Chegirma narxi butun son bo'lsin").min(1, "Chegirma narxi kamida 1 coin")]).optional(),
  saleEndsAt: z.union([z.null(), z.coerce.date({ error: "Chegirma tugash sanasi noto'g'ri" })]).optional(),
  category: z.string().trim().max(30).optional().default(""),
  kind: z.enum(["item", "privilege", "streak_shield"]).optional().default("item"),
  imageKey: z.string().max(300).nullable().optional(),
  stock: z
    .union([z.coerce.number().int().min(0).max(100000), z.null()])
    .optional()
    .default(null),
  isActive: z.boolean().default(true),
}).superRefine((p, ctx) => {
  if (p.salePrice === undefined || p.salePrice === null) return;
  if (p.salePrice >= p.price) {
    ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Chegirma narxi asl narxdan arzon bo'lsin" });
  }
  if (!p.saleEndsAt) {
    ctx.addIssue({ code: "custom", path: ["saleEndsAt"], message: "Chegirma qachon tugashini belgilang" });
  } else if (p.saleEndsAt.getTime() <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["saleEndsAt"], message: "Chegirma tugash vaqti kelajakda bo'lsin" });
  }
});

export type ProductInput = z.input<typeof productSchema>;
