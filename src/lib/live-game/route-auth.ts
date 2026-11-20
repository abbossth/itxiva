import { getSession } from "@/lib/auth/session";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { isFresh } from "@/lib/utils";

// Jonli o'yinning tezkor API'lari (arena, 3D poyga) uchun foydalanuvchi tekshiruvi: o'quvchi soniyasiga bir necha marta
// murojaat qiladi, shuning uchun natija qisqa muddat (10 s) saqlanadi. Bu fayl "use server" emas.

export type LiveWho = { userId: string; role: string; groupId: string | null };
const whoCache = new Map<string, { at: number; v: LiveWho | null }>();
const WHO_TTL = 10_000;

export async function liveWho(): Promise<LiveWho | null> {
  const s = await getSession();
  if (!s) return null;
  const key = `${s.userId}:${s.sessionVersion ?? 0}:${s.role}`;
  const c = whoCache.get(key);
  if (c && isFresh(c.at, WHO_TTL, Date.now())) return c.v;
  await connectToDatabase();
  const u = await User.findById(s.userId).select("groupId role mustChangePassword sessionVersion").lean();
  const ok = u && u.role === s.role && (u.sessionVersion ?? 0) === (s.sessionVersion ?? 0) && !u.mustChangePassword;
  const v: LiveWho | null = ok ? { userId: s.userId, role: s.role, groupId: u.groupId ? u.groupId.toString() : null } : null;
  if (whoCache.size > 2000) whoCache.clear();
  whoCache.set(key, { at: Date.now(), v });
  return v;
}
