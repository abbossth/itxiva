"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Eye, Globe, MessageCirclePlus, MessagesSquare, Search, Shield, Users, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createChatGroupAction, openDirectChatAction, type ChatPerson } from "@/actions/chat.actions";
import type { ChatRoomItem } from "@/lib/chat/core";
import { Initials, PeoplePicker } from "./people-picker";
import { RoomView, getJson } from "./room-view";
import { enablePush } from "@/lib/push-client";

// Chat: suhbatlar ro'yxati va tanlangan suhbat. To'liq sahifada — yonma-yon (telefonda navbat bilan),
// pastki "Xabarlar" panelida (compact) — doim navbat bilan. Ro'yxat ~10 s da yangilanadi.

const ROOMS_POLL_MS = 10_000;

type RoomsRes = { rooms: ChatRoomItem[]; me: string; role: "mentor" | "student" };

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })
    : d.toLocaleDateString("uz-UZ", { day: "numeric", month: "short", timeZone: "Asia/Tashkent" });
};

const ROOM_ICON = { general: Globe, group: Users, custom: UsersRound, dm: undefined } as const;

/** Brauzer bildirishnomasi ruxsati: "default" bo'lsa — yoqish tugmasi ko'rinadi */
export function useNotifyPermission(): [NotificationPermission | "unsupported", () => void] {
  const [, bump] = useState(0);
  const value = useSyncExternalStore(
    () => () => {},
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported" as const
  );
  return [value, () => void enablePush().then(() => bump((n) => n + 1))];
}

export function ChatApp({
  me,
  role,
  initialRoom,
  compact = false,
  onRoomChange,
}: {
  me: string;
  role: "mentor" | "student";
  initialRoom: string | null;
  /** Pastki panel: bitta ustun, balandligi konteynerga teng */
  compact?: boolean;
  onRoomChange?: (roomId: string | null) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"mine" | "watch">("mine");
  const [rooms, setRooms] = useState<ChatRoomItem[] | null>(null);
  const [active, setActive] = useState<string | null>(initialRoom);
  const [dialog, setDialog] = useState<null | "dm" | "group">(null);
  const [query, setQuery] = useState("");
  const [perm, askPerm] = useNotifyPermission();

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

  // Tashqaridan (bildirishnoma bosilganda) suhbat tanlanishi mumkin
  useEffect(() => {
    if (!initialRoom) return;
    const t = setTimeout(() => setActive(initialRoom), 0);
    return () => clearTimeout(t);
  }, [initialRoom]);

  // To'liq sahifada — manzil satrida (havola ulashish uchun); panelda — ota komponentga
  useEffect(() => {
    onRoomChange?.(active);
    if (compact) return;
    const url = new URL(window.location.href);
    if (active) url.searchParams.set("room", active);
    else url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, [active, compact, onRoomChange]);

  const room = rooms?.find((r) => r.id === active) ?? null;
  const q = query.trim().toLowerCase();
  const visible = (rooms ?? []).filter((r) => !q || r.title.toLowerCase().includes(q) || (r.lastText ?? "").toLowerCase().includes(q));

  const openDm = async (p: ChatPerson) => {
    const r = await openDirectChatAction(p.id);
    if (!r.success) return toast.error(r.error);
    setDialog(null);
    setTab("mine");
    setActive(r.data.roomId);
    void loadRooms();
  };

  const sections: { title: string; icon: typeof Globe; items: ChatRoomItem[] }[] =
    tab === "watch"
      ? [{ title: "O'quvchilar guruhlari va shaxsiy xabarlar", icon: Eye, items: visible }]
      : [
          { title: "Umumiy", icon: Globe, items: visible.filter((r) => r.kind === "general") },
          { title: role === "mentor" ? "O'quv guruhlari" : "Mening guruhim", icon: Users, items: visible.filter((r) => r.kind === "group") },
          { title: "Guruhlar", icon: UsersRound, items: visible.filter((r) => r.kind === "custom") },
          { title: "Shaxsiy xabarlar", icon: MessageCirclePlus, items: visible.filter((r) => r.kind === "dm") },
        ];

  const showList = compact ? !active : true;
  const showRoom = compact ? Boolean(active) : true;

  return (
    <div
      className={cn(
        "flex overflow-hidden bg-white dark:bg-slate-900",
        compact
          ? "h-full"
          : "h-[calc(100dvh-12.25rem)] min-h-[420px] rounded-3xl border border-slate-200 shadow-sm dark:border-slate-800 md:h-[calc(100dvh-7.375rem)]"
      )}
    >
      {/* Suhbatlar ro'yxati */}
      <aside
        className={cn(
          "w-full flex-col",
          showList ? "flex" : "hidden",
          !compact && "border-r border-slate-200 dark:border-slate-800 md:flex md:w-[340px] md:shrink-0",
          !compact && active && "hidden"
        )}
      >
        <div className="space-y-2 p-3">
          <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 dark:bg-slate-800">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suhbatlarni qidirish"
              aria-label="Suhbatlarni qidirish"
              className="min-h-[40px] w-full bg-transparent text-sm outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDialog("dm")}>
              <MessageCirclePlus className="h-4 w-4" /> Yangi xabar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("group")}>
              <UsersRound className="h-4 w-4" /> Guruh yaratish
            </Button>
          </div>
        </div>
        {perm === "default" && (
          <button
            onClick={askPerm}
            className="mx-3 mb-2 flex cursor-pointer items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-left text-xs font-semibold text-teal-800 hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-200"
          >
            <Bell className="h-4 w-4 shrink-0" /> Sayt yopiq bo&apos;lsa ham yangi xabarlar telefoningizga kelsin — yoqish
          </button>
        )}
        {role === "mentor" && (
          <div className="mx-3 mb-1 flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold dark:bg-slate-800" role="tablist">
            {(["mine", "watch"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setRooms(null);
                }}
                className={cn(
                  "flex-1 cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                  tab === t ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {t === "mine" ? "Suhbatlarim" : "Kuzatuv"}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {rooms === null &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-11 w-11 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  <span className="block h-3 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
                </span>
              </div>
            ))}
          {rooms !== null && visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{q ? "Hech narsa topilmadi" : tab === "watch" ? "Hozircha xabarlar yo'q" : "Suhbatlar yo'q"}</p>
          )}
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
                      "mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/70",
                      active === r.id && "bg-teal-50 hover:bg-teal-50 dark:bg-teal-500/10"
                    )}
                  >
                    <Initials name={r.title} mentor={r.kind === "general"} icon={ROOM_ICON[r.kind]} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("flex min-w-0 items-center gap-1 truncate text-sm text-slate-800 dark:text-slate-100", r.unread ? "font-bold" : "font-semibold")}>
                          <span className="truncate">{r.title}</span>
                          {r.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Ovozsiz" />}
                        </span>
                        {r.lastAt && <span className={cn("shrink-0 text-[11px]", r.unread ? "font-semibold text-teal-600" : "text-slate-400")}>{timeOf(r.lastAt)}</span>}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-xs", r.unread ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-500")}>{r.lastText ?? r.subtitle}</span>
                        {r.unread > 0 && (
                          <span className={cn("flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white", r.muted ? "bg-slate-400" : "bg-teal-600")}>
                            {r.unread >= 99 ? "99+" : r.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
        <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-snug text-slate-400 dark:border-slate-800">
          <Shield className="mr-1 inline h-3 w-3" />
          Xabarlar 7 kundan keyin o&apos;chadi. Xavfsizlik uchun ustozlar barcha suhbatlarni ko&apos;ra oladi.
        </p>
      </aside>

      {/* Suhbat */}
      <section className={cn("min-w-0 flex-1 flex-col", showRoom ? "flex" : "hidden", !compact && "md:flex")}>
        {room ? (
          <RoomView
            key={room.id}
            room={room}
            me={me}
            role={role}
            compact={compact}
            onBack={() => setActive(null)}
            onChanged={() => void loadRooms()}
            onLeft={() => setActive(null)}
          />
        ) : active && rooms === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Yuklanmoqda…</div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center dark:bg-slate-950/40">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-indigo-500 text-white shadow-lg">
              <MessagesSquare className="h-8 w-8" />
            </span>
            <p className="text-base font-bold text-slate-800 dark:text-slate-100">Sizning xabarlaringiz</p>
            <p className="max-w-xs text-sm text-slate-500">Sinfdoshingizga shaxsiy xabar yozing yoki loyiha jamoangiz uchun guruh yarating.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setDialog("dm")}>
                <MessageCirclePlus className="h-4 w-4" /> Yangi xabar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("group")}>
                <UsersRound className="h-4 w-4" /> Guruh yaratish
              </Button>
            </div>
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
