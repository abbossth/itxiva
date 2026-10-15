import { describe, expect, it } from "vitest";
import { shiftedStartForUnlock } from "@/lib/exam-proctoring";

describe("blokdan ochilganda vaqt", () => {
  it("blokda o'tgan vaqt urinish vaqtidan olinmaydi", () => {
    const started = new Date("2026-10-16T10:00:00Z");
    const lockedAt = new Date("2026-10-16T10:10:00Z");
    const now = new Date("2026-10-16T10:40:00Z");
    expect(shiftedStartForUnlock(started, lockedAt, now).toISOString()).toBe("2026-10-16T10:30:00.000Z");
    expect(shiftedStartForUnlock(started, null, now).toISOString()).toBe(started.toISOString());
  });
});
