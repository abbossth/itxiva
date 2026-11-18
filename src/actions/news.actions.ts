"use server";

import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { getCurrentUser } from "@/lib/auth/guards";
import { NEWS, pendingNews, type NewsItem } from "@/lib/whats-new";
import { cleanLook, gameLook, type GameLook } from "@/lib/character/catalog";

// "Yangilik" modali: o'quvchiga hali ko'rsatilmagan yangilik va uning personaji (slaydlarda o'zi ko'rinsin).

export async function getPendingNewsAction(): Promise<{ item: NewsItem; look: GameLook } | null> {
  const me = await getCurrentUser();
  if (!me || me.role !== "student") return null;
  await connectToDatabase();
  const u = await User.findById(me.userId).select("seenNews character level").lean();
  if (!u) return null;
  const item = pendingNews(u.seenNews ?? []);
  if (!item) return null;
  const lvl = Math.max(1, u.level ?? 1);
  const raw = (u.character?.look ?? null) as Record<string, unknown> | null;
  return { item, look: gameLook(cleanLook(raw, u.character?.owned ?? [], lvl, u.character?.power ?? 0, raw?.color), lvl) };
}

export async function markNewsSeenAction(id: string): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "student" || !NEWS.some((n) => n.id === id)) return;
  await connectToDatabase();
  await User.updateOne({ _id: me.userId }, { $addToSet: { seenNews: id } });
}
