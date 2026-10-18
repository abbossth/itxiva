import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";
import { announcementActive, audienceIncludes } from "@/lib/announcements";
import { holidayFor, levelGlowStrength, parseAmbience, resolveAmbience, seasonFor } from "@/lib/ambience";

// E'lonlar (auditoriya, muddat, ko'rish/yopish, statistika) va bezak qoidalari

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("@/lib/storage/r2", () => ({ getDownloadPresignedUrl: async ({ key }: { key: string }) => `https://files.test/${key}` }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { AnnouncementView } = await import("@/lib/db/models/announcement.model");
const {
  saveAnnouncementAction,
  setAnnouncementStatusAction,
  getPendingAnnouncement,
  markAnnouncementSeenAction,
  dismissAnnouncementAction,
  trackAnnouncementClickAction,
  getAnnouncementFileUrlAction,
  getAnnouncementStats,
  getAnnouncementsForMentor,
} = await import("@/actions/announcement.actions");

describe("bezak qoidalari", () => {
  it("fasl sanaga qarab, bayramlar o'z kunlarida", () => {
    expect(seasonFor("2026-01-15")).toBe("winter");
    expect(seasonFor("2026-04-01")).toBe("spring");
    expect(seasonFor("2026-07-20")).toBe("summer");
    expect(seasonFor("2026-10-19")).toBe("autumn");
    expect(holidayFor("2026-12-31")).toBe("newyear");
    expect(holidayFor("2027-01-05")).toBe("newyear");
    expect(holidayFor("2026-03-21")).toBe("navruz");
    expect(holidayFor("2026-10-19")).toBeNull();
  });

  it("sozlama: o'chiq, aniq fasl, noto'g'ri qiymat — standart", () => {
    expect(resolveAmbience(parseAmbience({ season: "off", holidays: true }), "2026-12-31")).toEqual({ season: null, holiday: "newyear" });
    expect(resolveAmbience(parseAmbience({ season: "summer", holidays: false }), "2026-12-31")).toEqual({ season: "summer", holiday: null });
    expect(parseAmbience({ season: "lava", levelEffects: "ha" })).toEqual({ season: "auto", levelEffects: true, holidays: true });
    expect(levelGlowStrength(1)).toBe(0);
    expect(levelGlowStrength(10)).toBe(1);
  });

  it("e'lon qoidalari: auditoriya va muddat", () => {
    const now = new Date("2026-10-19T10:00:00Z");
    expect(audienceIncludes({ audience: "grades", grades: [8] }, { groupId: "g", grade: 8 })).toBe(true);
    expect(audienceIncludes({ audience: "groups", groupIds: ["a"] }, { groupId: "b", grade: 8 })).toBe(false);
    expect(announcementActive({ status: "published", startsAt: "2026-10-18", endsAt: null }, now)).toBe(true);
    expect(announcementActive({ status: "published", startsAt: "2026-10-18", endsAt: "2026-10-19T09:00:00Z" }, now)).toBe(false);
    expect(announcementActive({ status: "draft", startsAt: "2026-10-18", endsAt: null }, now)).toBe(false);
  });
});

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function seed() {
  const g8 = await Group.create({ name: "8.2", grade: 8, academicYear: "2026-2027" });
  const g9 = await Group.create({ name: "9.1", grade: 9, academicYear: "2026-2027" });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const ali = await User.create({ login: "ali", fullName: "Ali Valiyev", role: "student", groupId: g8._id, passwordHash: "x" });
  const vali = await User.create({ login: "vali", fullName: "Vali Aliyev", role: "student", groupId: g9._id, passwordHash: "x" });
  return { g8, g9, mentor, ali, vali };
}

const base = {
  title: "Imtihon eslatmasi",
  body: "Ertaga imtihon",
  theme: "important",
  images: [{ key: "ann/rasm.webp", name: "rasm.webp", size: 1000, mimeType: "image/webp" }],
  files: [{ key: "ann/jadval.pdf", name: "jadval.pdf", size: 5000, mimeType: "application/pdf" }],
  links: [{ label: "Jadval", url: "itxiva.uz/exams" }],
};

describe("e'lonlar", () => {
  it("faqat auditoriyadagi o'quvchiga, yopguncha ko'rinadi; statistika yoziladi", async () => {
    const { g8, mentor, ali, vali } = await seed();
    actAs(sessionFor(mentor));
    const created = await saveAnnouncementAction({ ...base, audience: "grades", grades: [8], publish: true });
    expect(created.success).toBe(true);
    const id = created.data!.id;

    // 9-sinf o'quvchisi ko'rmaydi
    actAs(sessionFor(vali));
    expect(await getPendingAnnouncement()).toBeNull();
    expect((await getAnnouncementFileUrlAction(id, 0)).success).toBe(false);

    // 8-sinf o'quvchisi ko'radi: rasm vaqtinchalik havola bilan, fayl kaliti berilmaydi, havola https bilan
    actAs(sessionFor(ali));
    const pending = await getPendingAnnouncement();
    expect(pending).toMatchObject({ _id: id, title: "Imtihon eslatmasi", remaining: 0 });
    expect(pending!.images[0].url).toBe("https://files.test/ann/rasm.webp");
    expect(pending!.links[0].url).toBe("https://itxiva.uz/exams");
    expect(JSON.stringify(pending)).not.toContain("ann/jadval.pdf");

    await markAnnouncementSeenAction(id);
    await markAnnouncementSeenAction(id);
    await trackAnnouncementClickAction(id, "link:0");
    expect((await trackAnnouncementClickAction(id, "evil")).success).toBe(false);
    const file = await getAnnouncementFileUrlAction(id, 0);
    expect(file).toMatchObject({ success: true, url: "https://files.test/ann/jadval.pdf" });
    await dismissAnnouncementAction(id);
    expect(await getPendingAnnouncement()).toBeNull();

    const view = await AnnouncementView.findOne({ studentId: ali._id }).lean();
    expect(view).toMatchObject({ views: 2, clicks: 2 });
    expect(view!.clicked.sort()).toEqual(["file:0", "link:0"]);

    actAs(sessionFor(mentor));
    const stats = await getAnnouncementStats(id);
    expect(stats!.totals).toMatchObject({ audience: 1, seen: 1, dismissed: 1, clicked: 1, views: 2 });
    expect(stats!.targets.find((t) => t.id === "link:0")!.students).toBe(1);
    expect(stats!.students.map((s) => s.fullName)).toEqual(["Ali Valiyev"]);
    expect(stats!.announcement.audienceLabel).toBe("8-sinflar");
    expect(g8).toBeTruthy();

    const list = await getAnnouncementsForMentor();
    expect(list[0].stats).toMatchObject({ audience: 1, seen: 1, dismissed: 1, clicked: 1 });
  });

  it("qoralama, arxiv va muddati o'tgan e'lon ko'rinmaydi; bir nechtasi navbat bilan", async () => {
    const { g9, mentor, vali } = await seed();
    actAs(sessionFor(mentor));
    const draft = await saveAnnouncementAction({ ...base, title: "Qoralama", audience: "all" });
    await saveAnnouncementAction({ ...base, title: "O'tib ketgan", audience: "all", publish: true, startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-02T00:00:00Z" });
    const first = await saveAnnouncementAction({ ...base, title: "Birinchi", audience: "groups", groupIds: [String(g9._id)], publish: true });
    const second = await saveAnnouncementAction({ ...base, title: "Ikkinchi", audience: "all", publish: true });

    actAs(sessionFor(vali));
    let p = await getPendingAnnouncement();
    expect(p).toMatchObject({ title: "Birinchi", remaining: 1 });
    await dismissAnnouncementAction(first.data!.id);
    p = await getPendingAnnouncement();
    expect(p).toMatchObject({ title: "Ikkinchi", remaining: 0 });

    actAs(sessionFor(mentor));
    await setAnnouncementStatusAction(second.data!.id, "archived");
    actAs(sessionFor(vali));
    expect(await getPendingAnnouncement()).toBeNull();
    expect(draft.success).toBe(true);
  });

  it("faqat mentor yaratadi; noto'g'ri ma'lumot rad etiladi", async () => {
    const { mentor, ali } = await seed();
    actAs(sessionFor(ali));
    await expect(saveAnnouncementAction({ ...base, publish: true })).rejects.toThrow();
    actAs(sessionFor(mentor));
    expect((await saveAnnouncementAction({ ...base, title: "" })).success).toBe(false);
    expect((await saveAnnouncementAction({ ...base, audience: "groups", groupIds: [] })).success).toBe(false);
    expect((await saveAnnouncementAction({ ...base, links: [{ label: "x", url: "javascript:alert(1)" }] })).success).toBe(false);
  });
});
