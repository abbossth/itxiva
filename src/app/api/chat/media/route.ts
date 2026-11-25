import crypto from "node:crypto";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { ChatMessage, ChatRoom } from "@/lib/db/models/chat.model";
import { canRead, canWrite, postChatMessage } from "@/lib/chat/core";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDownloadPresignedUrl, uploadBuffer } from "@/lib/storage/r2";

// Chat media: ovozli xabar va rasm.
// POST (multipart): room, kind = "voice" | "image", file, voice uchun duration, rasm uchun width/height/caption/replyTo.
// GET ?m=<xabar id> — ruxsat tekshirilib, vaqtinchalik (10 daqiqalik) havolaga yo'naltiriladi.
// Fayllar chat/voice/ va chat/img/ ostida; 7 kundan keyin kunlik cron o'chiradi (xabarlar ham 7 kunda o'chadi).
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const VOICE_MAX_BYTES = 3 * 1024 * 1024;
const VOICE_MAX_SECONDS = 120;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const VOICE_TYPES: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/x-m4a": "m4a" };
const IMAGE_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };

const err = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

/** Fayl haqiqatan rasmmi — birinchi baytlar bo'yicha (brauzer yuborgan turga ishonilmaydi) */
function sniffImage(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (b.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return err("Qayta kiring", 401);
  const rate = checkRateLimit(`chat_media_${user.userId}`, 12, 60_000);
  if (!rate.allowed) return err(`Juda tez. ${rate.resetInSeconds} soniyadan keyin`, 429);
  try {
    const form = await req.formData();
    const roomId = String(form.get("room") ?? "");
    const kind = String(form.get("kind") ?? "voice");
    const file = form.get("file");
    if (!mongoose.isValidObjectId(roomId)) return err("Suhbat topilmadi", 404);
    if (!(file instanceof Blob) || file.size === 0) return err("Fayl bo'sh");
    const v = { userId: user.userId, role: user.role, groupId: user.groupId ?? null, fullName: user.fullName };
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).select("kind groupId members onlyAdmins ownerId admins").lean();
    if (!room || !canRead(room, v)) return err("Suhbat topilmadi", 404);
    // Yozish huquqi yuklashdan OLDIN tekshiriladi (omborga keraksiz fayl tushmasin)
    if (!canWrite(room, v)) return err("Bu suhbatga yoza olmaysiz", 403);
    const body = Buffer.from(await file.arrayBuffer());
    const replyToId = String(form.get("replyTo") ?? "") || null;

    if (kind === "image") {
      if (file.size > IMAGE_MAX_BYTES) return err("Rasm juda katta (4 MB gacha)");
      const mime = sniffImage(body);
      if (!mime) return err("Faqat JPG, PNG, WEBP yoki GIF rasm yuborish mumkin");
      const width = Math.min(10_000, Math.max(1, Math.round(Number(form.get("width")) || 1)));
      const height = Math.min(10_000, Math.max(1, Math.round(Number(form.get("height")) || 1)));
      const caption = String(form.get("caption") ?? "").trim().slice(0, 1000);
      const key = `chat/img/${roomId}/${Date.now()}-${crypto.randomBytes(9).toString("base64url")}.${IMAGE_TYPES[mime]}`;
      await uploadBuffer({ key, body, contentType: mime });
      const r = await postChatMessage(roomId, v, { text: caption, image: { key, mime, width, height, size: file.size }, replyToId });
      if (!r.ok) return err(r.error, 403);
      return NextResponse.json({ success: true, data: r.item }, { headers: NO_STORE });
    }

    const duration = Math.round(Number(form.get("duration")) || 0);
    if (file.size > VOICE_MAX_BYTES) return err("Ovozli xabar juda katta (3 MB gacha)");
    if (duration < 1 || duration > VOICE_MAX_SECONDS) return err("Ovozli xabar 1 soniyadan 2 daqiqagacha bo'lsin");
    const mime = (file.type || "").split(";")[0].trim().toLowerCase();
    const ext = VOICE_TYPES[mime];
    if (!ext) return err("Bu audio turi qo'llanmaydi");
    const key = `chat/voice/${roomId}/${Date.now()}-${crypto.randomBytes(9).toString("base64url")}.${ext}`;
    await uploadBuffer({ key, body, contentType: mime });
    const r = await postChatMessage(roomId, v, { voice: { key, mime, duration, size: file.size }, replyToId });
    if (!r.ok) return err(r.error, 403);
    return NextResponse.json({ success: true, data: r.item }, { headers: NO_STORE });
  } catch (e) {
    console.error("Chat media upload error:", e);
    return err("Faylni yuborib bo'lmadi", 500);
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return err("Qayta kiring", 401);
  const id = req.nextUrl.searchParams.get("m") ?? "";
  if (!mongoose.isValidObjectId(id)) return err("Topilmadi", 404);
  await connectToDatabase();
  const msg = await ChatMessage.findById(id).select("roomId voice image deletedAt").lean();
  const key = msg?.image?.key ?? msg?.voice?.key;
  if (!msg || !key || msg.deletedAt) return err("Topilmadi", 404);
  const room = await ChatRoom.findById(msg.roomId).select("kind groupId members").lean();
  const v = { userId: user.userId, role: user.role, groupId: user.groupId ?? null, fullName: user.fullName };
  if (!room || !canRead(room, v)) return err("Topilmadi", 404);
  const url = await getDownloadPresignedUrl({ key, expiresInSeconds: 600 });
  // Brauzer bir xil xabarni 5 daqiqa qayta so'ramasin (havola 10 daqiqa amal qiladi)
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
}
