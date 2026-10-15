import { describe, expect, it } from "vitest";
import { textSimilarity } from "@/lib/similarity";

const original = `1) 3 KB = 24 bayt
2) 5 MB = 5120 KB
3) 2 GB = 2024 MB
11)32:2 = 16 film sig'adi
12)Yoq yozib bolmaydi chunki joy yetmaydi`;

describe("javoblar o'xshashligi", () => {
  it("ko'chirilgan javob (bo'shliq va harf kattaligi o'zgargan) yuqori o'xshashlik beradi", () => {
    const copied = original.toUpperCase().replace(/\n/g, "  \n ");
    expect(textSimilarity(original, copied)).toBeGreaterThan(0.95);
  });

  it("mustaqil yozilgan javob past o'xshashlik beradi", () => {
    const own = `Birinchi qism: 3KB > 1024*3 > 3072 bayt, 5MB = 5*1024 = 5120KB, 2GB = 2*1024 = 2048MB.
Ikkinchi qism: 32 ni 2 ga bo'lsak 16 ta film. Oxirgisi — sig'maydi, joy kam.`;
    expect(textSimilarity(original, own)).toBeLessThan(0.4);
  });

  it("qisqa javoblar va topshiriqdan ko'chirilgan qism hisobga olinmaydi", () => {
    expect(textSimilarity("Foto yubordim", "Foto yubordim")).toBe(0);
    const task = "Quyidagi birliklarni o'tkazing va har birini alohida qatorda yozing: kilobayt, megabayt, gigabayt";
    const a = `${task}\n1) 3072 bayt keladi, chunki bir kilobaytda 1024 bayt bor ekan`;
    const b = `${task}\nmen bilmadim bu misolni, keyingi darsda so'rayman ustozdan albatta`;
    expect(textSimilarity(a, b)).toBeGreaterThan(0.5);
    expect(textSimilarity(a, b, task)).toBeLessThan(0.2);
  });
});
