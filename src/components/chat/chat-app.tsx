"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Globe, LogOut, MessageCirclePlus, MoreVertical, Send, Shield, Trash2, UserMinus, UserPlus, Users, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  addChatMembersAction,
  createChatGroupAction,
  deleteChatMessageAction,
  getChatMembersAction,
  leaveChatGroupAction,
  muteChatUserAction,
  openDirectChatAction,
  removeChatMemberAction,
  sendChatMessageAction,
  type ChatMember,
  type ChatPerson,
} from "@/actions/chat.actions";
import type { ChatMessageItem, ChatRoomItem } from "@/lib/chat/core";
import { Initials, PeoplePicker } from "./people-picker";

// Chat: chapda suhbatlar, o'ngda xabarlar (telefonda — navbat bilan). Yangi xabarlar ~2,5 s da, ro'yxat ~10 s da so'raladi.

const MSG_POLL_MS = 2500;
const ROOMS_POLL_MS = 10_000;

type RoomsRes = { rooms: ChatRoomItem[]; me: string; role: "mentor" | "student" };
type MsgRes = { messages: ChatMessageItem[]; canWrite: boolean; mutedUntil: string | null; kind: ChatRoomItem["kind"]; ownerId: string | null };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.status === 401) {
      window.location.reload();
      return null;
    }
    const j = (await r.json()) as { success: boolean; data?: T };
    return j.success ? (j.data as T) : null;
  } catch {
    return null;
  }
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", timeZone: "Asia/Tashkent" });

export function ChatApp({ me, role, initialRoom }: { me: string; role: "mentor" | "student"; initialRoom: string | null }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"mine" | "watch">("mine");
  const [rooms, setRooms] = useState<ChatRoomItem[] | null>(null);
  const [active, setActive] = useState<string | null>(initialRoom);
  const [dialog, setDialog] = useState<null | "dm" | "group">(null);

  const loadRooms = useCallback(async () => {
    const d = await getJson<RoomsRes>(`/api/chat/rooms${tab === "watch" ? "?watch=1" : ""}`);
    if (d) setRooms(d.rooms);
  }, [tab]);

  useEffect(() => {
    const first = setTimeout(() => void loadRooms(), 0);
    const id = setInterval(() => document.visibilityState === "visible" && void loadRooms(), ROOMS_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [loadRooms]);

  // Manzil satrida tanlangan suhbat (orqaga tugmasi ishlashi uchun)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (active) url.searchParams.set("room", active);
    else url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, [active]);

  const room = rooms?.find((r) => r.id === active) ?? null;

  const openDm = async (p: ChatPerson) => {
    const r = await openDirectChatAction(p.id);
    if (!r.success) return toast.error(r.error);
    setDialog(null);
    setTab("mine");
    setActive(r.data.roomId);
    void loadRooms();
  };

  const sections: { title: string; icon: typeof Globe; items: ChatRoomItem[] }[] = rooms
    ? tab === "watch"
      ? [{ title: "Kuzatuv: o'quvchilar guruhlari va shaxsiy xabarlar", icon: Eye, items: rooms }]
      : [
          { title: "Umumiy", icon: Globe, items: rooms.filter((r) => r.kind === "general") },
          { title: role === "mentor" ? "O'quv guruhlari" : "Mening guruhim", icon: Users, items: rooms.filter((r) => r.kind === "group") },
          { title: "Guruhlar", icon: UsersRound, items: rooms.filter((r) => r.kind === "custom") },
          { title: "Shaxsiy xabarlar", icon: MessageCirclePlus, items: rooms.filter((r) => r.kind === "dm") },
        ]
    : [];

  return (
    <div className="flex h-[calc(100dvh-180px)] min-h-[480px] overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Suhbatlar ro'yxati */}
      <aside className={cn("flex w-full flex-col border-r border-slate-200 dark:border-slate-800 md:w-80 md:shrink-0", active && "hidden md:flex")}>
        <div className="flex gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setDialog("dm")}>
            <MessageCirclePlus className="h-4 w-4" /> Yangi xabar
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setDialog("group")}>
            <UsersRound className="h-4 w-4" /> Guruh yaratish
          </Button>
        </div>
        {role === "mentor" && (
          <div className="flex gap-1 border-b border-slate-200 p-2 text-xs font-semibold dark:border-slate-800" role="tablist">
            {(["mine", "watch"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setRooms(null);
                }}
                className={cn("flex-1 cursor-pointer rounded-lg px-2 py-2", tab === t ? "bg-teal-500/15 text-teal-800 dark:text-teal-200" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")}
              >
                {t === "mine" ? "Suhbatlarim" : "Kuzatuv"}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {rooms === null && <p className="p-4 text-sm text-slate-500">Yuklanmoqda…</p>}
          {sections.map((s) =>
            s.items.length === 0 ? null : (
              <div key={s.title}>
                <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <s.icon className="h-3.5 w-3.5" /> {s.title}
                </p>
                {s.items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActive(r.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60",
                      active === r.id && "bg-teal-50 dark:bg-teal-500/10"
                    )}
                  >
                    <Initials name={r.title} mentor={r.kind === "general"} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.title}</span>
                        {r.lastAt && <span className="shrink-0 text-[11px] text-slate-400">{timeOf(r.lastAt)}</span>}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-slate-500">{r.lastText ?? r.subtitle}</span>
                        {r.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-teal-600 px-1.5 text-[11px] font-bold text-white">{r.unread >= 99 ? "99+" : r.unread}</span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          )}
          {rooms && tab === "watch" && rooms.length === 0 && <p className="p-4 text-sm text-slate-500">Hozircha xabarlar yo&apos;q</p>}
        </div>
        <p className="border-t border-slate-200 p-3 text-[11px] leading-snug text-slate-400 dark:border-slate-800">
          <Shield className="mr-1 inline h-3 w-3" />
          Xabarlar 7 kundan keyin avtomatik o&apos;chadi. Xavfsizlik uchun ustozlar barcha suhbatlarni ko&apos;ra oladi — odobli bo&apos;ling.
        </p>
      </aside>

      {/* Suhbat */}
      <section className={cn("min-w-0 flex-1 flex-col", active ? "flex" : "hidden md:flex")}>
        {room ? (
          <RoomView key={room.id} room={room} me={me} role={role} onBack={() => setActive(null)} onChanged={() => void loadRooms()} onLeft={() => setActive(null)} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-slate-500">
            <MessageCirclePlus className="h-10 w-10 text-slate-300" />
            <p className="text-sm">Suhbatni tanlang yoki yangisini boshlang</p>
          </div>
        )}
      </section>

      <Modal isOpen={dialog === "dm"} onClose={() => setDialog(null)} title="Yangi xabar" maxWidth="md">
        <PeoplePicker onPick={(p) => void openDm(p)} />
      </Modal>
      <Modal isOpen={dialog === "group"} onClose={() => setDialog(null)} title="Guruh yaratish" maxWidth="md">
        <CreateGroup
          onDone={(id) => {
            setDialog(null);
            setTab("mine");
            setActive(id);
            void loadRooms();
          }}
        />
      </Modal>
    </div>
  );
}

function CreateGroup({ onDone }: { onDone: (roomId: string) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<ChatPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (p: ChatPerson) => setPicked((l) => (l.some((x) => x.id === p.id) ? l.filter((x) => x.id !== p.id) : [...l, p]));
  const submit = async () => {
    setBusy(true);
    const r = await createChatGroupAction(name, picked.map((p) => p.id));
    setBusy(false);
    if (!r.success) return toast.error(r.error);
    onDone(r.data.roomId);
  };
  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="Guruh nomi (masalan, Robototexnika jamoasi)"
        aria-label="Guruh nomi"
        className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <PeoplePicker selected={picked} onToggle={toggle} />
      <Button className="w-full" onClick={() => void submit()} isLoading={busy} disabled={name.trim().length < 3 || picked.length === 0}>
        Yaratish ({picked.length + 1} kishi)
      </Button>
    </div>
  );
}

function RoomView({
  room,
  me,
  role,
  onBack,
  onChanged,
  onLeft,
}: {
  room: ChatRoomItem;
  me: string;
  role: "mentor" | "student";
  onBack: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessageItem[] | null>(null);
  const [meta, setMeta] = useState<Omit<MsgRes, "messages"> | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<ChatMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);
  const stick = useRef(true);

  const scrollDown = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

  // Birinchi yuklash va yangi xabarlarni so'rash
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const url = `/api/chat/messages?room=${room.id}${lastId.current ? `&after=${lastId.current}` : ""}`;
      const d = await getJson<MsgRes>(url);
      if (!alive) return;
      if (d) {
        setMeta({ canWrite: d.canWrite, mutedUntil: d.mutedUntil, kind: d.kind, ownerId: d.ownerId });
        if (d.messages.length) {
          lastId.current = d.messages[d.messages.length - 1].id;
          setMessages((prev) => {
            const seen = new Set((prev ?? []).map((m) => m.id));
            return [...(prev ?? []), ...d.messages.filter((m) => !seen.has(m.id))];
          });
          if (stick.current) scrollDown();
        } else setMessages((prev) => prev ?? []);
      }
      timer = setTimeout(() => void tick(), document.visibilityState === "visible" ? MSG_POLL_MS : MSG_POLL_MS * 4);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [room.id]);

  const loadOlder = async () => {
    const first = messages?.[0]?.id;
    if (!first) return;
    const d = await getJson<MsgRes>(`/api/chat/messages?room=${room.id}&before=${first}`);
    if (!d) return;
    if (d.messages.length < 50) setMore(false);
    setMessages((prev) => [...d.messages, ...(prev ?? [])]);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await sendChatMessageAction(room.id, body);
    setSending(false);
    if (!r.success) return toast.error(r.error);
    setText("");
    stick.current = true;
    lastId.current = r.data.id;
    setMessages((prev) => [...(prev ?? []), r.data]);
    scrollDown();
    onChanged();
  };

  const remove = async (m: ChatMessageItem) => {
    const r = await deleteChatMessageAction(m.id);
    if (!r.success) return toast.error(r.error);
    setMessages((prev) => (prev ?? []).map((x) => (x.id === m.id ? { ...x, deleted: true, text: "" } : x)));
  };

  const mute = async (m: ChatMessageItem, hours: number) => {
    const r = await muteChatUserAction(m.senderId, hours);
    if (!r.success) return toast.error(r.error);
    toast.success(hours ? `${m.senderName} ${hours} soat yoza olmaydi` : `${m.senderName} uchun taqiq olib tashlandi`);
  };

  const openMembers = async () => {
    const r = await getChatMembersAction(room.id);
    if (!r.success) return toast.error(r.error);
    setMembers(r.data);
  };

  const isOwner = meta?.ownerId === me || (role === "mentor" && room.kind === "custom");

  return (
    <>
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <button onClick={onBack} aria-label="Orqaga" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Initials name={room.title} mentor={room.kind === "general"} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{room.title}</p>
          <p className="truncate text-xs text-slate-500">{room.watching ? "Kuzatuv rejimi — siz a'zo emassiz" : room.subtitle}</p>
        </div>
        {(room.kind === "custom" || (room.kind === "dm" && room.watching)) && (
          <button onClick={() => void openMembers()} aria-label="A'zolar" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
            <MoreVertical className="h-5 w-5" />
          </button>
        )}
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-1 overflow-y-auto bg-slate-50 px-3 py-3 dark:bg-slate-950/40"
        aria-live="polite"
      >
        {messages && messages.length >= 50 && more && (
          <button onClick={() => void loadOlder()} className="mx-auto mb-2 block cursor-pointer rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm dark:bg-slate-800">
            Oldingi xabarlar
          </button>
        )}
        {messages === null && <p className="text-center text-sm text-slate-500">Yuklanmoqda…</p>}
        {messages?.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">Hali xabar yo&apos;q — birinchi bo&apos;lib yozing 👋</p>}
        {messages?.map((m, i) => {
          const mine = m.senderId === me;
          const prev = messages[i - 1];
          const newDay = !prev || dayOf(prev.at) !== dayOf(m.at);
          const showName = !mine && (!prev || prev.senderId !== m.senderId || newDay) && room.kind !== "dm";
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-[11px] font-semibold text-slate-400">{dayOf(m.at)}</p>}
              <div className={cn("group flex items-end gap-1.5", mine ? "justify-end" : "justify-start")}>
                {!mine && role === "mentor" && !m.deleted && m.senderRole === "student" && (
                  <MessageMenu onDelete={() => void remove(m)} onMute={(h) => void mute(m, h)} />
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    mine ? "rounded-br-md bg-teal-600 text-white" : "rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  )}
                >
                  {showName && (
                    <p className={cn("mb-0.5 text-xs font-bold", m.senderRole === "mentor" ? "text-amber-600" : "text-teal-700 dark:text-teal-300")}>
                      {m.senderName}
                      {m.senderRole === "mentor" && " · Ustoz"}
                    </p>
                  )}
                  {m.deleted ? (
                    <p className="italic opacity-70">Xabar o&apos;chirildi</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  )}
                  <p className={cn("mt-0.5 text-right text-[10px]", mine ? "text-teal-100" : "text-slate-400")}>{timeOf(m.at)}</p>
                </div>
                {mine && !m.deleted && (
                  <button
                    onClick={() => void remove(m)}
                    aria-label="Xabarni o'chirish"
                    className="cursor-pointer rounded-lg p-1.5 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="border-t border-slate-200 p-2.5 dark:border-slate-800">
        {meta && !meta.canWrite ? (
          <p className="py-2 text-center text-xs text-slate-500">{room.watching ? "Kuzatuv rejimi: xabarlarni o'qish va o'chirish mumkin" : "Bu suhbatga yoza olmaysiz"}</p>
        ) : meta?.mutedUntil ? (
          <p className="py-2 text-center text-xs font-semibold text-rose-600">
            Ustoz {new Date(meta.mutedUntil).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })} gacha yozishni taqiqlagan
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Xabar yozing…"
              aria-label="Xabar"
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900"
            />
            <Button type="submit" size="icon" isLoading={sending} disabled={!text.trim()} aria-label="Yuborish">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </footer>

      <Modal isOpen={members !== null} onClose={() => setMembers(null)} title={adding ? "A'zo qo'shish" : "A'zolar"} maxWidth="md">
        {members && !adding && (
          <div className="space-y-3">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2">
                  <Initials name={u.name} mentor={u.role === "mentor"} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {u.name}
                    {u.owner && <span className="ml-1.5 text-xs font-semibold text-teal-600">egasi</span>}
                  </span>
                  {isOwner && !u.owner && room.kind === "custom" && (
                    <button
                      onClick={async () => {
                        const r = await removeChatMemberAction(room.id, u.id);
                        if (!r.success) return toast.error(r.error);
                        setMembers((l) => (l ?? []).filter((x) => x.id !== u.id));
                        onChanged();
                      }}
                      aria-label={`${u.name}ni chiqarish`}
                      className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              {isOwner && room.kind === "custom" && (
                <Button variant="secondary" className="flex-1" onClick={() => setAdding(true)}>
                  <UserPlus className="h-4 w-4" /> Qo&apos;shish
                </Button>
              )}
              {room.kind === "custom" && !room.watching && (
                <Button
                  variant="outline"
                  className="flex-1 text-rose-600"
                  onClick={async () => {
                    const r = await leaveChatGroupAction(room.id);
                    if (!r.success) return toast.error(r.error);
                    setMembers(null);
                    onChanged();
                    onLeft();
                  }}
                >
                  <LogOut className="h-4 w-4" /> Guruhdan chiqish
                </Button>
              )}
            </div>
          </div>
        )}
        {members && adding && (
          <AddMembers
            roomId={room.id}
            exclude={members.map((m) => m.id)}
            onDone={async () => {
              setAdding(false);
              await openMembers();
              onChanged();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function AddMembers({ roomId, exclude, onDone }: { roomId: string; exclude: string[]; onDone: () => void }) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<ChatPerson[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <PeoplePicker selected={picked} exclude={exclude} onToggle={(p) => setPicked((l) => (l.some((x) => x.id === p.id) ? l.filter((x) => x.id !== p.id) : [...l, p]))} />
      <Button
        className="w-full"
        isLoading={busy}
        disabled={picked.length === 0}
        onClick={async () => {
          setBusy(true);
          const r = await addChatMembersAction(roomId, picked.map((p) => p.id));
          setBusy(false);
          if (!r.success) return toast.error(r.error);
          onDone();
        }}
      >
        Qo&apos;shish ({picked.length})
      </Button>
    </div>
  );
}

/** Mentor: o'quvchi xabari uchun o'chirish va yozishni taqiqlash */
function MessageMenu({ onDelete, onMute }: { onDelete: () => void; onMute: (hours: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative order-last">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Moderatsiya"
        aria-expanded={open}
        className="cursor-pointer rounded-lg p-1.5 text-slate-400 opacity-0 hover:bg-slate-200 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800"
      >
        <Shield className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-44 rounded-xl bg-white p-1 text-sm shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700" onMouseLeave={() => setOpen(false)}>
          <button onClick={() => { onDelete(); setOpen(false); }} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
            <Trash2 className="h-3.5 w-3.5" /> O&apos;chirish
          </button>
          {[1, 24].map((h) => (
            <button key={h} onClick={() => { onMute(h); setOpen(false); }} className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700">
              {h === 1 ? "1 soat yozmasin" : "1 kun yozmasin"}
            </button>
          ))}
          <button onClick={() => { onMute(0); setOpen(false); }} className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            Taqiqni olib tashlash
          </button>
        </div>
      )}
    </div>
  );
}
