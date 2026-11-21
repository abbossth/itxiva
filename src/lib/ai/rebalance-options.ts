import { z } from "zod";
import { generateStructured } from "@/lib/ai/claude";
import { answerLengthBias, type ChoiceQuestionLike } from "@/lib/quiz-quality";

// AI bilan variantlarni tenglashtirish: to'g'ri javob uzunligidan bilinib qolmasin.
// To'g'ri javob ma'nosi saqlanadi (qisqartiriladi), noto'g'rilari shu uslub va uzunlikda qayta yoziladi.

export interface BalanceInput extends ChoiceQuestionLike {
  prompt: string;
  options: string[];
  correctAnswers: string[];
}
export interface BalanceResult {
  options: string[];
  correctAnswers: string[];
}

const schema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().describe("Savolning tartib raqami (berilgandek)"),
      options: z.array(z.string()).describe("Qayta yozilgan variantlar — soni avvalgidek"),
      correctIndexes: z.array(z.number().int()).describe("To'g'ri variantlarning options ichidagi o'rni (0 dan)"),
    })
  ),
});

export const BALANCE_RULES = `- Barcha variantlar bir xil uslubda va deyarli bir xil uzunlikda bo'lsin (farq 20% dan oshmasin, so'zlar soni ham yaqin).
- To'g'ri javob eng uzun, eng batafsil yoki eng "ilmiy" variant bo'lib qolmasin; noto'g'ri variantlar ham xuddi shunday aniq va ishonarli bo'lsin.
- "Hammasi to'g'ri", "Hech biri" kabi variantlar, to'g'ri javobni savol matnidan so'zma-so'z takrorlash ishlatilmasin.
- To'g'ri javob ma'nosi va to'g'riligi o'zgarmasin.`;

/** Natijani tekshiradi: variantlar soni, to'g'ri javoblar soni, takrorlar va uzunlik muvozanati */
export function acceptBalanced(orig: BalanceInput, options: string[], correctIndexes: number[]): BalanceResult | null {
  const opts = options.map((o) => o.trim());
  if (opts.length !== orig.options.length || opts.some((o) => !o) || new Set(opts).size !== opts.length) return null;
  const idx = [...new Set(correctIndexes)];
  const wanted = orig.correctAnswers.filter((a) => orig.options.includes(a)).length;
  if (idx.length !== wanted || idx.some((i) => i < 0 || i >= opts.length)) return null;
  const next = { type: orig.type, options: opts, correctAnswers: idx.map((i) => opts[i]) };
  const before = answerLengthBias(orig);
  const after = answerLengthBias(next);
  if (after.biased && after.ratio >= before.ratio) return null;
  return { options: next.options, correctAnswers: next.correctAnswers };
}

/**
 * Berilgan savollarni AI bilan tenglashtiradi. Qaytaradi: savol indeksi → yangi variantlar
 * (yaroqsiz yoki yaxshilanmagan natija qaytarilmaydi — savol o'z holicha qoladi).
 */
export async function rebalanceChoices(questions: BalanceInput[]): Promise<Map<number, BalanceResult>> {
  const out = new Map<number, BalanceResult>();
  if (questions.length === 0) return out;
  const list = questions
    .map((q, i) => {
      const correct = q.options.map((o, j) => (q.correctAnswers.includes(o) ? j : -1)).filter((j) => j >= 0);
      return `#${i}. ${q.prompt}\nVariantlar:\n${q.options.map((o, j) => `  [${j}] ${o}`).join("\n")}\nTo'g'ri: ${correct.join(", ")}`;
    })
    .join("\n\n");
  const data = await generateStructured({
    schema,
    prompt: `Quyidagi test savollarida to'g'ri javob boshqa variantlardan ancha uzun — o'quvchilar uni mazmunidan emas, uzunligidan topib olishyapti. Har bir savol variantlarini qayta yoz.

Qoidalar:
${BALANCE_RULES}
- To'g'ri javobni keraksiz so'zlardan tozalab qisqartir; noto'g'ri variantlarni unga mos uzunlikda, ishonarli qilib yoz.
- Variantlar soni va to'g'ri javoblar soni o'zgarmasin; variantlar tartibini aralashtirsang bo'ladi — correctIndexes ni shunga mos yoz.
- Savol matnini o'zgartirma. Javob tili — savol tili.

${list}`,
    maxTokens: 12000,
  });
  for (const item of data.items) {
    const orig = questions[item.id];
    if (!orig) continue;
    const ok = acceptBalanced(orig, item.options, item.correctIndexes);
    if (ok) out.set(item.id, ok);
  }
  return out;
}
