import { requireAuth } from "@/lib/auth/guards";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata = { title: "Chat — ITXiva" };

// Chat butun ekranni egallaydi (sarlavhasiz) — xabarlar uchun maksimal joy
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const session = await requireAuth();
  const { room } = await searchParams;
  return <ChatApp me={session.userId} role={session.role} initialRoom={typeof room === "string" && /^[a-f0-9]{24}$/.test(room) ? room : null} />;
}
