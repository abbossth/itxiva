import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

class RedirectSignal extends Error {
  constructor(public to: string) {
    super(`REDIRECT:${to}`);
  }
}

const setSessionCookie = vi.fn();

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), setSessionCookie, clearSessionCookie: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { RateLimit } = await import("@/lib/db/models/rate-limit.model");
const { hashPassword, verifyPassword } = await import("@/lib/auth/password");
const { consumeRateLimit, clearRateLimit } = await import("@/lib/rate-limit-db");
const auth = await import("@/actions/auth.actions");
const { examSubmitSchema } = await import("@/lib/validations/exam.schema");
const { materialSchema } = await import("@/lib/validations/lesson.schema");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function makeUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    login: "ali",
    fullName: "Ali Valiyev",
    role: "student",
    passwordHash: await hashPassword("eski-parol"),
    mustChangePassword: false,
    ...overrides,
  });
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  setSessionCookie.mockClear();
});

describe("bazadagi urinishlar limiti", () => {
  it("limitgacha ruxsat beradi, undan keyin bloklaydi", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await consumeRateLimit("k", 3, 60_000)).allowed).toBe(true);
    }
    const blocked = await consumeRateLimit("k", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetInSeconds).toBeGreaterThan(0);
    // Boshqa kalitga ta'sir qilmaydi
    expect((await consumeRateLimit("boshqa", 3, 60_000)).allowed).toBe(true);
  });

  it("oyna tugagach yoki tozalangach qaytadan sanaydi", async () => {
    await consumeRateLimit("k", 1, 60_000);
    expect((await consumeRateLimit("k", 1, 60_000)).allowed).toBe(false);

    await RateLimit.updateOne({ key: "k" }, { $set: { resetAt: new Date(Date.now() - 1000) } });
    expect((await consumeRateLimit("k", 1, 60_000)).allowed).toBe(true);

    await consumeRateLimit("k", 1, 60_000);
    await clearRateLimit("k");
    expect((await consumeRateLimit("k", 1, 60_000)).allowed).toBe(true);
  });

  it("bir vaqtda kelgan so'rovlar ham to'g'ri sanaladi", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit("parallel", 5, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

describe("kirish", () => {
  it("noto'g'ri parol bilan 5 ta urinishdan keyin to'g'ri parol ham vaqtincha o'tmaydi", async () => {
    await makeUser();
    for (let i = 0; i < 5; i++) {
      const res = await auth.loginAction(null, form({ login: "ali", password: "xato-parol" }));
      expect(res.errors?.password).toBeTruthy();
    }
    const res = await auth.loginAction(null, form({ login: "ali", password: "eski-parol" }));
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Juda ko'p urinish/);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("to'g'ri parol sessiyani joriy versiya bilan ochadi; tashqi manzilga yo'naltirmaydi", async () => {
    await makeUser({ sessionVersion: 4 });
    await expect(
      auth.loginAction(null, form({ login: "ALI", password: "eski-parol", next: "//evil.example/x" }))
    ).rejects.toMatchObject({ to: "/" });
    expect(setSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ login: "ali", sessionVersion: 4 }));
  });

  it("ichki `next` manziliga qaytaradi", async () => {
    await makeUser();
    await expect(
      auth.loginAction(null, form({ login: "ali", password: "eski-parol", next: "/a/abc123" }))
    ).rejects.toMatchObject({ to: "/a/abc123" });
  });
});

describe("parolni almashtirish", () => {
  it("profildan: joriy parolsiz yoki xato joriy parol bilan almashtirib bo'lmaydi", async () => {
    const user = await makeUser();
    actAs(sessionFor(user));

    const missing = await auth.changePasswordAction(null, form({ newPassword: "yangi-parol", confirmPassword: "yangi-parol" }));
    expect(missing.success).toBe(false);
    const wrong = await auth.changePasswordAction(
      null,
      form({ currentPassword: "taxmin", newPassword: "yangi-parol", confirmPassword: "yangi-parol" })
    );
    expect(wrong.errors?.currentPassword).toBeTruthy();

    const after = await User.findById(user._id);
    expect(await verifyPassword("eski-parol", after!.passwordHash)).toBe(true);
    expect(after!.sessionVersion ?? 0).toBe(0);
  });

  it("profildan: to'g'ri joriy parol bilan almashadi va boshqa sessiyalar bekor bo'ladi", async () => {
    const user = await makeUser();
    actAs(sessionFor(user));

    const res = await auth.changePasswordAction(
      null,
      form({ currentPassword: "eski-parol", newPassword: "yangi-parol", confirmPassword: "yangi-parol" })
    );
    expect(res.success).toBe(true);

    const after = await User.findById(user._id);
    expect(await verifyPassword("yangi-parol", after!.passwordHash)).toBe(true);
    expect(after!.sessionVersion).toBe(1);
    expect(setSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ sessionVersion: 1, mustChangePassword: false }));
  });

  it("yangi parol eskisi bilan bir xil bo'lsa rad etiladi", async () => {
    const user = await makeUser({ mustChangePassword: true });
    actAs({ ...sessionFor(user), mustChangePassword: true });
    const res = await auth.changePasswordAction(null, form({ newPassword: "eski-parol", confirmPassword: "eski-parol" }));
    expect(res.errors?.newPassword).toBeTruthy();
    expect((await User.findById(user._id))!.mustChangePassword).toBe(true);
  });

  it("majburiy almashtirish: joriy parol so'ralmaydi, vaqtinchalik parol o'chiriladi", async () => {
    const user = await makeUser({ mustChangePassword: true, tempPasswordEnc: "shifr" });
    actAs({ ...sessionFor(user), mustChangePassword: true });

    await expect(
      auth.changePasswordAction(null, form({ newPassword: "yangi-parol", confirmPassword: "yangi-parol" }))
    ).rejects.toMatchObject({ to: "/" });

    const after = await User.findById(user._id).select("+tempPasswordEnc");
    expect(after!.mustChangePassword).toBe(false);
    expect(after!.tempPasswordEnc).toBeNull();
    expect(after!.sessionVersion).toBe(1);
  });

  it("tizimga kirmagan foydalanuvchi login sahifasiga yuboriladi", async () => {
    actAs(null);
    await expect(
      auth.changePasswordAction(null, form({ newPassword: "yangi-parol", confirmPassword: "yangi-parol" }))
    ).rejects.toMatchObject({ to: "/login" });
  });
});

describe("havolalar va javob hajmi", () => {
  const examId = "6ac000000000000000000001";
  const answer = (extra: Record<string, unknown>) => ({
    examId,
    answers: [{ questionId: "q1", type: "github_repo", ...extra }],
  });

  it("imtihon javobidagi havola faqat http(s) bo'lishi mumkin", () => {
    expect(examSubmitSchema.safeParse(answer({ repoUrl: "https://github.com/ali/loyiha" })).success).toBe(true);
    expect(examSubmitSchema.safeParse(answer({ repoUrl: "" })).success).toBe(true);
    expect(examSubmitSchema.safeParse(answer({ repoUrl: "javascript:alert(1)" })).success).toBe(false);
    expect(examSubmitSchema.safeParse(answer({ repoUrl: "data:text/html,<script>1</script>" })).success).toBe(false);
  });

  it("juda katta javob yoki noto'g'ri imtihon identifikatori rad etiladi", () => {
    expect(examSubmitSchema.safeParse(answer({ value: "a".repeat(20001) })).success).toBe(false);
    expect(examSubmitSchema.safeParse({ examId: { $ne: null }, answers: [] }).success).toBe(false);
    expect(examSubmitSchema.safeParse({ examId: "abc", answers: [] }).success).toBe(false);
  });

  it("dars materialidagi havola xavfli sxemani qabul qilmaydi", () => {
    const link = (urlOrKey: string) => materialSchema.safeParse({ type: "link", title: "Havola", urlOrKey }).success;
    expect(link("https://developer.mozilla.org")).toBe(true);
    expect(link("youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(link("javascript:alert(1)")).toBe(false);
    // Fayl kalitiga bu qoida qo'llanmaydi
    expect(materialSchema.safeParse({ type: "file", title: "Fayl", urlOrKey: "materials/1-a-b.pdf" }).success).toBe(true);
  });
});
