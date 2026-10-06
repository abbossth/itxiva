import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

// Server action'lar sessiyani cookie'dan oladi; testlarda "kim kirgani" shu o'zgaruvchi orqali beriladi.
let currentSession: SessionPayload | null = null;

export function actAs(session: SessionPayload | null) {
  currentSession = session;
}

export function sessionFor(user: {
  _id: { toString(): string };
  login: string;
  fullName: string;
  role: "mentor" | "student";
  groupId?: { toString(): string } | null;
}): SessionPayload {
  return {
    userId: user._id.toString(),
    login: user.login,
    fullName: user.fullName,
    role: user.role,
    groupId: user.groupId ? user.groupId.toString() : null,
    mustChangePassword: false,
  };
}

/** Haqiqiy himoya funksiyalari bilan bir xil qoidalar, faqat sessiya manbai boshqa */
export const guardsMock = {
  getCurrentUser: async () => currentSession,
  requireAuth: async () => {
    if (!currentSession) throw new Error("Tizimga kirilmagan");
    return currentSession;
  },
  requireMentor: async () => {
    if (currentSession?.role !== "mentor") throw new Error("Ruxsat berilmagan: Faqat mentor kirishi mumkin");
    return currentSession;
  },
  requireMentorPage: async () => {
    if (currentSession?.role !== "mentor") throw new Error("Ruxsat berilmagan");
    return currentSession;
  },
  requireStudent: async () => {
    if (currentSession?.role !== "student") throw new Error("Ruxsat berilmagan: Faqat o'quvchi kirishi mumkin");
    return currentSession;
  },
  requireGroupAccess: async (groupId: string | { toString(): string }) => {
    if (!currentSession) throw new Error("Tizimga kirilmagan");
    if (currentSession.role === "mentor") return currentSession;
    if (currentSession.groupId !== groupId.toString()) throw new Error("Ruxsat berilmagan");
    return currentSession;
  },
};

let mongod: MongoMemoryServer | null = null;

export async function startDb() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("itxiva_test");
  vi.stubEnv("MONGODB_URI", process.env.MONGODB_URI);
}

export async function stopDb() {
  await mongoose.disconnect();
  global.mongooseCache = { conn: null, promise: null };
  await mongod?.stop();
  mongod = null;
}

export async function clearDb() {
  const { connectToDatabase } = await import("@/lib/db/connect");
  const conn = await connectToDatabase();
  await Promise.all(Object.values(conn.connection.collections).map((c) => c.deleteMany({})));
}
