import { describe, expect, it } from "vitest";
import { Smoother } from "@/components/live/arena/interp";

describe("raqiblarni silliq chizish", () => {
  it("kadrlar tarmoqda to'planib kelsa ham server soati bo'yicha bir tekis harakat (orqaga sakramaydi)", () => {
    const s = new Smoother(150);
    // Server har 66 ms da kadr tuzadi: o'yinchi o'ngga bir tekis yuradi (66 ms da 20 px)
    // Tarmoq: kadrlar notekis keladi — ba'zilari birga (bir xil vaqtda)
    const arrive = [1000, 1066, 1240, 1241, 1242, 1330, 1400, 1580, 1581, 1600];
    arrive.forEach((local, i) => {
      const server = 50_000 + i * 66;
      s.push("a", s.align(server, local), i * 20, 0, 0);
    });
    // Chizish: har 16 ms — x hech qachon kamaymasin va sakrash 20 px dan oshmasin
    let prev = -Infinity;
    let maxStep = 0;
    for (let t = 1200; t <= 1700; t += 16) {
      const v = s.sample("a", t)!;
      expect(v.x).toBeGreaterThanOrEqual(prev - 0.001);
      if (prev > -Infinity) maxStep = Math.max(maxStep, v.x - prev);
      prev = v.x;
    }
    expect(maxStep).toBeLessThan(20);
  });

  it("server vaqti bo'lmasa — kelgan vaqt ishlatiladi", () => {
    const s = new Smoother(100);
    expect(s.align(undefined, 1234)).toBe(1234);
  });
});
