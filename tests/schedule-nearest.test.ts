import { describe, expect, it } from "vitest";
import { pickNearestLessonGroup } from "@/lib/schedule";

// 2026-10-16 — Juma (5). Vaqtlar Toshkent bo'yicha (UTC+5)
const at = (iso: string) => new Date(`${iso}+05:00`);
const toq = (startTime: string, endTime: string) => ({ days: [1, 3, 5], startTime, endTime });
const juft = (startTime: string, endTime: string) => ({ days: [2, 4, 6], startTime, endTime });

describe("darsi eng yaqin guruh", () => {
  const groups = [
    { name: "8.10", schedule: juft("09:00", "10:30") },
    { name: "8.2", schedule: toq("14:00", "15:30") },
    { name: "9.2", schedule: toq("16:00", "17:30") },
    { name: "TEST", schedule: null },
  ];

  it("bugungi eng yaqin dars guruhi tanlanadi", () => {
    expect(pickNearestLessonGroup(groups, at("2026-10-16T01:26:00"))?.name).toBe("8.2");
  });

  it("hozir dars ketayotgan guruh tanlanadi; tugagan dars hisobga olinmaydi", () => {
    expect(pickNearestLessonGroup(groups, at("2026-10-16T14:30:00"))?.name).toBe("8.2");
    expect(pickNearestLessonGroup(groups, at("2026-10-16T15:45:00"))?.name).toBe("9.2");
    // Juma kechqurun: keyingisi — shanba ertalab juft guruh
    expect(pickNearestLessonGroup(groups, at("2026-10-16T18:00:00"))?.name).toBe("8.10");
  });

  it("hech birida jadval bo'lmasa birinchi guruh", () => {
    expect(pickNearestLessonGroup([{ name: "A", schedule: null }, { name: "B" }])?.name).toBe("A");
  });
});
