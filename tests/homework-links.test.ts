import { describe, expect, it } from "vitest";
import { parseLinkDraft } from "@/lib/homework-status";

describe("uyga vazifa havolalari", () => {
  it("bitta maydonga joylangan bir nechta havola alohida qo'shiladi", () => {
    expect(parseLinkDraft("https://github.com/ali/a  scratch.mit.edu/projects/1\nhttps://drive.google.com/x").links).toEqual([
      "https://github.com/ali/a",
      "https://scratch.mit.edu/projects/1",
      "https://drive.google.com/x",
    ]);
    expect(parseLinkDraft("https://a.uz/1, https://b.uz/2,https://c.uz/3").links).toEqual(["https://a.uz/1", "https://b.uz/2", "https://c.uz/3"]);
  });

  it("havola ichidagi vergul saqlanadi, takrorlar olib tashlanadi, noto'g'rilari ajratiladi", () => {
    expect(parseLinkDraft("https://a.uz/?q=1,2").links).toEqual(["https://a.uz/?q=1,2"]);
    expect(parseLinkDraft("https://a.uz https://a.uz").links).toEqual(["https://a.uz"]);
    expect(parseLinkDraft("javascript:alert(1)")).toEqual({ links: [], invalid: ["javascript:alert(1)"] });
    expect(parseLinkDraft("   ")).toEqual({ links: [], invalid: [] });
  });
});
