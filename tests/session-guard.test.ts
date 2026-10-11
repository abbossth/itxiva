import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";
import type { SessionPayload } from "@/lib/auth/session";

// Haqiqiy himoya funksiyalari tekshiriladi; faqat cookie o'rniga sessiya shu o'zgaruvchidan olinadi
let cookieSession: SessionPayload | null = null;

vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => cookieSession }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { User } = await import("@/lib/db/models/user.model");
const guards = await import("@/lib/auth/guards");

async function login(overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    login: "ali",
    fullName: "Ali Valiyev",
    role: "student",
    passwordHash: "x",
    mustChangePassword: false,
    ...overrides,
  });
  cookieSession = {
    userId: user._id.toString(),
    login: user.login,
    fullName: user.fullName,
    role: user.role,
    groupId: null,
    mustChangePassword: Boolean(user.mustChangePassword),
    sessionVersion: user.sessionVersion ?? 0,
  };
  return user;
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  cookieSession = null;
});

describe("sessiyani bazada tekshirish", () => {
  it("joriy versiyadagi sessiya o'tadi", async () => {
    await login();
    expect((await guards.getCurrentUser())?.login).toBe("ali");
  });

  it("parol tiklangach (versiya oshgach) eski cookie yaroqsiz", async () => {
    const user = await login();
    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    expect(await guards.getCurrentUser()).toBeNull();
    await expect(guards.requireAuth()).rejects.toThrow("REDIRECT:/login");
  });

  it("o'chirilgan foydalanuvchi yoki roli o'zgargan sessiya o'tmaydi", async () => {
    const user = await login();
    cookieSession = { ...cookieSession!, role: "mentor" };
    expect(await guards.getCurrentUser()).toBeNull();

    cookieSession = { ...cookieSession!, role: "student" };
    await User.deleteOne({ _id: user._id });
    expect(await guards.getCurrentUser()).toBeNull();
  });

  it("vaqtinchalik parol holati cookie'dan emas, bazadan olinadi", async () => {
    const user = await login();
    await User.updateOne({ _id: user._id }, { $set: { mustChangePassword: true } });
    expect((await guards.getCurrentUser())?.mustChangePassword).toBe(true);
    // Parolini almashtirmagan foydalanuvchi himoyalangan amallarga o'tolmaydi
    await expect(guards.requireAuth()).rejects.toThrow("REDIRECT:/change-password");
    await expect(guards.requireStudent()).rejects.toThrow("REDIRECT:/change-password");
  });
});
