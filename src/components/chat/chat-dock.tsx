"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Maximize2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { ChatRoomItem } from "@/lib/chat/core";
import { ChatApp } from "./chat-app";
import { Initials } from "./people-picker";
import { getJson } from "./room-view";
import { syncPush } from "@/lib/push-client";

// Instagram uslubidagi pastki "Xabarlar" paneli: o'ng pastda yig'ilgan tugma (o'qilmaganlar soni va so'nggi suhbatlar),
// bosilsa — kichik chat oynasi (telefonda butun ekran). Har ~20 s da o'qilmaganlar tekshiriladi:
// yangi xabar kelsa — sahifadagi xabarnoma, ruxsat berilgan bo'lsa brauzer bildirishnomasi, sarlavhada son.

const UNREAD_POLL_MS = 20_000;
const OPEN_KEY = "itxiva_chat_dock_open";

type UnreadRes = {
  total: number;
  recent: { id: string; title: string; kind: ChatRoomItem["kind"] }[];
  latest: { roomId: string; title: string; text: string; at: string | null } | null;
};

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
function saveOpen(v: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, v ? "1" : "0");
  } catch {}
}

export function ChatDock({ me, role }: { me: string; role: "mentor" | "student" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [data, setData] = useState<UnreadRes | null>(null);
  const lastSeenAt = useRef<string | null>(null);
  const openRoom = useRef<string | null>(null);
  const isOpen = useRef(false);

  const onChatPage = pathname?.startsWith("/chat") ?? false;
  // Jonli o'yin ekranida chalg'itmasin
  const hidden = onChatPage || /^\/live\/[^/]+/.test(pathname ?? "");

  useEffect(() => {
    isOpen.current = open;
  }, [open]);

  // Ruxsat oldin berilgan bo'lsa — push obunasi yangilanadi (sayt yopiq bo'lsa ham xabar keladi)
  useEffect(() => {
    const t = setTimeout(() => void syncPush(), 3000);
    return () => clearTimeout(t);
  }, []);

  // Panel oldin ochiq qoldirilgan bo'lsa — kompyuterda ochiq holda tiklanadi
  useEffect(() => {
    const t = setTimeout(() => {
      if (readOpen() && window.matchMedia("(min-width: 768px)").matches) setOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = (v: boolean) => {
    setOpen(v);
    saveOpen(v);
  };

  const show = useCallback(
    (roomId: string) => {
      if (onChatPage) return router.push(`/chat?room=${roomId}`);
      setRoom(roomId);
      toggle(true);
    },
    [onChatPage, router]
  );

  // O'qilmaganlar: yangi xabar kelganda xabar beradi
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const d = await getJson<UnreadRes>("/api/chat/unread");
      if (!alive) return;
      if (d) {
        setData(d);
        const l = d.latest;
        const fresh = l?.at && lastSeenAt.current !== null && l.at > lastSeenAt.current;
        // Birinchi so'rovda (sahifa ochilganda) eski xabarlar uchun bildirishnoma chiqmaydi
        if (lastSeenAt.current === null) lastSeenAt.current = l?.at ?? "";
        else if (l?.at && l.at > lastSeenAt.current) lastSeenAt.current = l.at;
        const watching = (isOpen.current || window.location.pathname.startsWith("/chat")) && openRoom.current === l?.roomId;
        if (fresh && l && !watching) {
          if (document.visibilityState === "visible") {
            addToast({
              type: "info",
              duration: 6000,
              message: (
                <button type="button" onClick={() => show(l.roomId)} className="block w-full cursor-pointer text-left">
                  <span className="block font-bold">💬 {l.title}</span>
                  <span className="line-clamp-2 block text-sm opacity-90">{l.text}</span>
                  <span className="mt-1 block text-xs font-semibold underline">Ochish</span>
                </button>
              ),
            });
          } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              const n = new Notification(`💬 ${l.title}`, { body: l.text, tag: `chat-${l.roomId}`, icon: "/icon.svg" });
              n.onclick = () => {
                window.focus();
                show(l.roomId);
                n.close();
              };
            } catch {}
          }
        }
        // Sarlavhada o'qilmaganlar soni
        const base = document.title.replace(/^\(\d+\+?\)\s/, "");
        document.title = d.total > 0 ? `(${d.total > 99 ? "99+" : d.total}) ${base}` : base;
      }
      timer = setTimeout(() => void tick(), isOpen.current ? UNREAD_POLL_MS / 2 : UNREAD_POLL_MS);
    };
    const first = setTimeout(() => void tick(), 1500);
    return () => {
      alive = false;
      clearTimeout(first);
      clearTimeout(timer);
    };
  }, [addToast, show]);

  if (hidden) return null;

  const total = data?.total ?? 0;

  return (
    <>
      {open ? (
        <div
          className={cn(
            "chat-dock-in fixed z-[45] flex flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900",
            "inset-0 md:inset-auto md:bottom-6 md:right-6 md:h-[min(640px,calc(100dvh-96px))] md:w-[400px] md:rounded-3xl md:border md:border-slate-200 md:dark:border-slate-800"
          )}
          role="dialog"
          aria-label="Xabarlar"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <Send className="h-5 w-5 -rotate-12 text-teal-600" />
            <p className="flex-1 text-base font-extrabold">Xabarlar</p>
            <button
              onClick={() => router.push(room ? `/chat?room=${room}` : "/chat")}
              aria-label="To'liq ekranda ochish"
              title="To'liq ekranda ochish"
              className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 md:flex"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => toggle(false)}
              aria-label="Yig'ish"
              title="Yig'ish"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
            <ChatApp
              me={me}
              role={role}
              initialRoom={room}
              compact
              onRoomChange={(id) => {
                openRoom.current = id;
              }}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={() => toggle(true)}
          aria-label={total ? `Xabarlar, ${total} ta o'qilmagan` : "Xabarlar"}
          className="chat-dock-in fixed bottom-[84px] right-4 z-[45] flex cursor-pointer items-center gap-3 rounded-full border border-slate-200 bg-white py-2 pl-4 pr-2 shadow-xl transition-transform hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-900 md:bottom-6 md:right-6"
        >
          <span className="relative">
            <Send className="h-6 w-6 -rotate-12 text-slate-800 dark:text-slate-100" />
            {total > 0 && (
              <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                {total > 99 ? "99+" : total}
              </span>
            )}
          </span>
          <span className="hidden text-base font-extrabold sm:inline">Xabarlar</span>
          {data && data.recent.length > 0 ? (
            <span className="flex -space-x-2.5">
              {data.recent.map((r) => (
                <Initials key={r.id} name={r.title} mentor={r.kind === "general"} size="sm" className="ring-2 ring-white dark:ring-slate-900" />
              ))}
            </span>
          ) : (
            <span className="w-1" />
          )}
        </button>
      )}
    </>
  );
}
