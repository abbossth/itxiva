import { describe, expect, it } from "vitest";
import { compareUz } from "@/lib/sort-uz";

describe("compareUz", () => {
  it("o'zbek alifbosi: Oʻ, Gʻ, Sh, Ch — Z dan keyin; apostrof turlari bir xil; sonlar son sifatida", () => {
    const names = ["Zafar", "O‘g‘il", "Og'abek", "Oybek", "G'ani", "Gulnora", "Shahzod", "Sardor", "Chori", "Abror", "abror", "8-A", "10-A", "9-B"];
    expect([...names].sort(compareUz)).toEqual(["8-A", "9-B", "10-A", "Abror", "abror", "Gulnora", "Oybek", "Og'abek", "Sardor", "Zafar", "O‘g‘il", "G'ani", "Shahzod", "Chori"]);
    expect(compareUz("Go‘zal", "Go'zal")).not.toBe(0); // deterministik (asl belgilar bo'yicha)
    expect(Math.sign(compareUz("Ali Valiyev", "Alijon"))).toBe(-1);
  });
});
