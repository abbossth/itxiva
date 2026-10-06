import { z } from "zod";

export const productSchema = z.object({
  title: z.string().trim().min(2, "Mahsulot nomi kamida 2 ta belgi bo'lishi kerak").max(80),
  description: z.string().trim().max(500).optional().default(""),
  price: z.coerce.number().int("Narx butun son bo'lishi kerak").min(1, "Narx kamida 1 coin").max(100000),
  category: z.string().trim().max(30).optional().default(""),
  imageKey: z.string().max(300).nullable().optional(),
  stock: z
    .union([z.coerce.number().int().min(0).max(100000), z.null()])
    .optional()
    .default(null),
  isActive: z.boolean().default(true),
});

export type ProductInput = z.input<typeof productSchema>;
