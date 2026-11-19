import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");
const hw = await import("@/actions/homework.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("Uyga vazifalar qutisi", () => {
  it("matn, havola va fayl yuklanmasdan — bor-yo'qligi va soni to'g'ri; navbat va baholanganlar ajratiladi", async () => {
    const mentor = await User.create({ login: "u", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const group = await Group.create({ name: "8-A", grade: 8 });
    const [ali, vali] = await User.create([
      { login: "ali", fullName: "Ali", role: "student", passwordHash: "x", groupId: group._id },
      { login: "vali", fullName: "Vali", role: "student", passwordHash: "x", groupId: group._id },
    ]);
    const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "Dars", isPublished: true, date: new Date() });
    await HomeworkSubmission.create([
      { lessonId: lesson._id, groupId: group._id, studentId: ali._id, text: "  javob ", links: ["https://a.uz", "https://b.uz"], files: [{ key: "k", name: "f.pdf" }], status: "submitted" },
      { lessonId: lesson._id, groupId: group._id, studentId: vali._id, text: "   ", status: "graded", score: 80 },
    ]);
    actAs(sessionFor(mentor));
    const inbox = await hw.getHomeworkInbox();
    expect(inbox.pending).toHaveLength(1);
    expect(inbox.pending[0]).toMatchObject({ studentName: "Ali", lessonTitle: "Dars", groupName: "8-A", hasText: true, links: 2, files: 1, status: "submitted" });
    expect(inbox.recent[0]).toMatchObject({ studentName: "Vali", hasText: false, links: 0, files: 0, score: 80 });
  });
});
