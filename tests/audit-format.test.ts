import { describe, expect, it } from "vitest";
import { formatAuditRow, type AuditRefs } from "@/lib/audit-format";

const refs: AuditRefs = {
  lessons: new Map([["l1", { title: "HTML asoslari", groupId: "g1", quarter: 1 }]]),
  sessions: new Map([["s1", { groupId: "g1", dateLabel: "7-okt, 2026" }]]),
  groups: new Map([["g1", "8.2"], ["g2", "9.3"]]),
};
const base = { _id: "a1", actor: { fullName: "Ustoz" }, createdAt: "2026-10-07T10:00:00.000Z" };

describe("amallar tarixi: yozuvni o'qiladigan ko'rinishga keltirish", () => {
  it("vazifa bahosi: dars nomi, guruh, ball va javoblar sahifasiga havola", () => {
    const row = formatAuditRow(
      { ...base, action: "GRADE_HOMEWORK", target: { _id: "u1", fullName: "Ali", role: "student" }, details: { submissionId: "x", lessonId: "l1", score: 90, coins: 18 } },
      refs
    );
    expect(row.label).toBe("Vazifa baholandi");
    expect(row.category).toBe("homework");
    expect(row.facts).toEqual(["HTML asoslari", "Guruh: 8.2", "Ball: 90", "Coin: 18"]);
    expect(row.link).toEqual({ href: "/mentor/homework/l1", label: "Javoblarni ochish" });
    // Texnik identifikatorlar ko'rsatilmaydi
    expect(row.facts.join(" ")).not.toContain("submissionId");
  });

  it("o'chirilgan obyektga havola berilmaydi", () => {
    const deleted = formatAuditRow({ ...base, action: "DELETE_LESSON", details: { lessonId: "yo'q", title: "Eski dars" } }, refs);
    expect(deleted.tone).toBe("danger");
    expect(deleted.facts).toEqual(["Eski dars"]);
    expect(deleted.link).toBeNull();

    const gone = formatAuditRow({ ...base, action: "CLOSE_ATTENDANCE", details: { sessionId: "o'chirilgan", summary: { totalPresent: 10, totalLate: 2, totalAbsent: 3 }, auto: true } }, refs);
    expect(gone.facts).toEqual(["avtomatik yopildi", "12 keldi, 3 kelmadi"]);
    expect(gone.link).toBeNull();
  });

  it("davomat holati va o'quvchini ko'chirish tushunarli yoziladi", () => {
    const att = formatAuditRow(
      { ...base, action: "MANUAL_ATTENDANCE", target: { _id: "u1", fullName: "Ali", role: "student" }, details: { sessionId: "s1", oldStatus: "absent", newStatus: "excused" } },
      refs
    );
    expect(att.facts).toEqual(["Guruh: 8.2", "Sana: 7-okt, 2026", "Kelmagan → Sababli"]);
    expect(att.link?.href).toBe("/mentor/attendance/s1");

    const move = formatAuditRow(
      { ...base, action: "MOVE_STUDENT", target: { _id: "u1", fullName: "Ali", role: "student" }, details: { oldGroupId: "g1", newGroupId: "g2" } },
      refs
    );
    expect(move.facts).toEqual(["8.2 → 9.3"]);
    expect(move.link?.href).toBe("/mentor/reports/students/u1");
  });

  it("noma'lum amal ham xatosiz ko'rsatiladi", () => {
    const row = formatAuditRow({ ...base, actor: null, action: "SOME_NEW_ACTION", details: null }, refs);
    expect(row).toMatchObject({ label: "some new action", category: "other", actor: "Tizim", facts: [], link: null });
  });
});
