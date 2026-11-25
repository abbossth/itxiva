import { MessagesSquare } from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui/page-header";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata = { title: "Chat — ITXiva" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const session = await requireAuth();
  const { room } = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader icon={MessagesSquare} title="Chat" subtitle="Umumiy chat, guruh chati, o'z guruhlaringiz va shaxsiy xabarlar" />
      <ChatApp me={session.userId} role={session.role} initialRoom={typeof room === "string" && /^[a-f0-9]{24}$/.test(room) ? room : null} />
    </div>
  );
}
