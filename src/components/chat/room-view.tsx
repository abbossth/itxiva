"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Copy,
  Crown,
  Eye,
  Flag,
  ImagePlus,
  LogOut,
  Megaphone,
  Mic,
  MoreVertical,
  Pause,
  Play,
  Reply,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smile,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  addChatMembersAction,
  deleteChatGroupAction,
  deleteChatMessageAction,
  getChatBlockedAction,
  getChatMembersAction,
  leaveChatGroupAction,
  muteChatUserAction,
  removeChatMemberAction,
  renameChatGroupAction,
  reportChatMessageAction,
  sendChatMessageAction,
  sendChatStickerAction,
  setChatAdminAction,
  setChatBlockAction,
  setChatOnlyAdminsAction,
  setChatRoomMuteAction,
  toggleChatReactionAction,
  type ChatGroupInfo,
  type ChatPerson,
} from "@/actions/chat.actions";
import type { ChatMessageItem, ChatReader, ChatRoomItem } from "@/lib/chat/core";
import { STICKER_PACKS } from "@/lib/chat/stickers";
import { Initials, PeoplePicker } from "./people-picker";

// Bitta suhbat. Tezlik uchun: birinchi ochilishda faqat oxirgi 30 ta xabar, yuqoriga aylantirganda yana 30 tadan;
// keyin har ~2 s da faqat YANGI va O'ZGARGAN (reaksiya/o'chirish) xabarlar so'raladi; oldingi so'rov tugamaguncha
// keyingisi yuborilmaydi; tab yashirin bo'lsa — 10 s da bir.

const POLL_MS = 2000;
const POLL_HIDDEN_MS = 10_000;
const TYPING_PING_MS = 3000;
const VOICE_MAX_S = 120;
const PAGE = 30;
const IMAGE_MAX_SIDE = 1600;
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

type MsgRes = {
  messages: ChatMessageItem[];
  changed: ChatMessageItem[];
  now: number;
  readers: ChatReader[];
  typing: string[];
  canWrite: boolean;
  mutedUntil: string | null;
  kind: ChatRoomItem["kind"];
  ownerId: string | null;
};

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal });
    if (r.status === 401) {
      window.location.reload();
      return null;
    }
    if (!r.ok) return null;
    const j = (await r.json()) as { success: boolean; data?: T };
    return j.success ? (j.data as T) : null;
  } catch {
    return null;
  }
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", timeZone: "Asia/Tashkent" });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Xabarni o'qiganlar: o'qilgan joyi shu xabardan keyin yoki teng (id'lar vaqt bo'yicha tartiblangan) */
const readersOf = (m: ChatMessageItem, readers: ChatReader[]) => readers.filter((r) => r.userId !== m.senderId && r.lastReadId >= m.id);

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

// ---- Havolalar: matndagi http(s) va www. manzillar bosiladigan bo'ladi (faqat http/https) ----
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const trail = part.match(/[.,!?;:)\]]+$/)?.[0] ?? "";
        const raw = trail ? part.slice(0, -trail.length) : part;
        const href = raw.startsWith("www.") ? `https://${raw}` : raw;
        let ok = false;
        try {
          ok = ["http:", "https:"].includes(new URL(href).protocol);
        } catch {}
        if (!ok) return part;
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all font-medium underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
              {raw}
            </a>
            {trail}
          </span>
        );
      })}
    </>
  );
}

// ---- Rasm: brauzerda kichraytiriladi (eng uzun tomoni 1600 px, WEBP/JPEG) — tez yuklanadi, trafik kam ----
type PendingImage = { blob: Blob; url: string; width: number; height: number };
async function prepareImage(file: File): Promise<PendingImage> {
  const bmp = await createImageBitmap(file);
  const { width: w0, height: h0 } = bmp;
  if (file.type === "image/gif" && file.size <= 4 * 1024 * 1024) {
    bmp.close();
    return { blob: file, url: URL.createObjectURL(file), width: w0, height: h0 };
  }
  const k = Math.min(1, IMAGE_MAX_SIDE / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * k));
  const height = Math.max(1, Math.round(h0 * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.82));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("Rasmni o'qib bo'lmadi");
  return { blob, url: URL.createObjectURL(blob), width, height };
}

type MenuState = { m: ChatMessageItem; x: number; y: number } | null;
type Action =
  | { t: "menu"; m: ChatMessageItem; x: number; y: number }
  | { t: "react"; m: ChatMessageItem; emoji: string }
  | { t: "jump"; id: string }
  | { t: "reply"; m: ChatMessageItem }
  | { t: "image"; id: string };

export function RoomView({
  room,
  me,
  role,
  compact = false,
  onBack,
  onChanged,
  onLeft,
}: {
  room: ChatRoomItem;
  me: string;
  role: "mentor" | "student";
  compact?: boolean;
  onBack: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessageItem[] | null>(null);
  const [meta, setMeta] = useState<Pick<MsgRes, "canWrite" | "mutedUntil" | "kind" | "ownerId"> | null>(null);
  const [readers, setReaders] = useState<ChatReader[]>([]);
  const [typing, setTypingList] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<ChatMessageItem | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [menu, setMenu] = useState<MenuState>(null);
  const [whoRead, setWhoRead] = useState<ChatMessageItem | null>(null);
  const [report, setReport] = useState<ChatMessageItem | null>(null);
  const [info, setInfo] = useState(false);
  const [stickers, setStickers] = useState(false);
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [rec, setRec] = useState<{ seconds: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [muted, setMuted] = useState(room.muted);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastId = useRef<string | null>(null);
  const since = useRef<number>(0);
  const stick = useRef(true);
  const olderBusy = useRef(false);
  const lastPing = useRef(0);
  const kick = useRef<() => void>(() => {});
  const recorder = useRef<{ mr: MediaRecorder; chunks: Blob[]; start: number; timer: ReturnType<typeof setInterval> | undefined; cancel: boolean } | null>(null);

  const scrollDown = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

  // ---- So'rov sikli: bitta so'rov tugagach keyingisi rejalashtiriladi (bir-birining ustiga chiqmaydi) ----
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | null = null;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      clearTimeout(timer);
      ctrl = new AbortController();
      const q = new URLSearchParams({ room: room.id });
      if (lastId.current) q.set("after", lastId.current);
      if (since.current) q.set("since", String(since.current));
      const d = await getJson<MsgRes>(`/api/chat/messages?${q}`, ctrl.signal);
      busy = false;
      if (!alive) return;
      if (d) {
        since.current = d.now;
        setMeta({ canWrite: d.canWrite, mutedUntil: d.mutedUntil, kind: d.kind, ownerId: d.ownerId });
        setReaders(d.readers);
        setTypingList(d.typing);
        const first = lastId.current === null;
        if (first && d.messages.length < PAGE) setHasMore(false);
        if (d.messages.length || d.changed.length) {
          if (d.messages.length) lastId.current = d.messages[d.messages.length - 1].id;
          const changed = new Map(d.changed.map((m) => [m.id, m]));
          setMessages((prev) => {
            const base = (prev ?? []).map((m) => changed.get(m.id) ?? m);
            const seen = new Set(base.map((m) => m.id));
            return [...base, ...d.messages.filter((m) => !seen.has(m.id))];
          });
          if (d.messages.length && (stick.current || first)) scrollDown();
        } else setMessages((prev) => prev ?? []);
      }
      timer = setTimeout(() => void tick(), document.visibilityState === "visible" ? POLL_MS : POLL_HIDDEN_MS);
    };
    kick.current = () => void tick();
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [room.id]);

  // Chiqib ketganda: "yozmoqda" o'chadi, yozilayotgan ovoz bekor qilinadi
  useEffect(
    () => () => {
      const r = recorder.current;
      if (r && r.mr.state === "recording") {
        r.cancel = true;
        r.mr.stop();
      }
      void fetch("/api/chat/typing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: room.id, on: false }), keepalive: true }).catch(() => {});
    },
    [room.id]
  );

  // Javob tanlanganda yozish maydoniga o'tiladi
  useEffect(() => {
    if (reply) inputRef.current?.focus();
  }, [reply]);

  // Tanlangan rasm ko'rinishining xotirasi bo'shatiladi
  useEffect(() => () => void (pending && URL.revokeObjectURL(pending.url)), [pending]);

  const ping = (on: boolean) => {
    const now = Date.now();
    if (on && now - lastPing.current < TYPING_PING_MS) return;
    if (!on && lastPing.current === 0) return;
    lastPing.current = on ? now : 0;
    void fetch("/api/chat/typing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: room.id, on }) }).catch(() => {});
  };

  const append = (m: ChatMessageItem) => {
    stick.current = true;
    if (!lastId.current || m.id > lastId.current) lastId.current = m.id;
    setMessages((prev) => ((prev ?? []).some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
    setReply(null);
    scrollDown();
    onChanged();
  };

  const loadOlder = async () => {
    const first = messages?.[0]?.id;
    if (!first || olderBusy.current || !hasMore) return;
    olderBusy.current = true;
    const el = listRef.current;
    const prevH = el?.scrollHeight ?? 0;
    const d = await getJson<MsgRes>(`/api/chat/messages?room=${room.id}&before=${first}`);
    olderBusy.current = false;
    if (!d) return;
    if (d.messages.length < PAGE) setHasMore(false);
    setMessages((prev) => [...d.messages, ...(prev ?? [])]);
    // Ko'rib turgan joy siljimasin
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prevH;
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await sendChatMessageAction(room.id, body, reply?.id ?? null);
    setSending(false);
    if (!r.success) return toast.error(r.error);
    setText("");
    if (inputRef.current) inputRef.current.style.height = "";
    lastPing.current = 0;
    append(r.data);
    inputRef.current?.focus();
  };

  const sendSticker = async (s: string) => {
    setStickers(false);
    const r = await sendChatStickerAction(room.id, s, reply?.id ?? null);
    if (!r.success) return toast.error(r.error);
    append(r.data);
  };

  const upload = async (fd: FormData) => {
    setSending(true);
    try {
      fd.set("room", room.id);
      if (reply) fd.set("replyTo", reply.id);
      const r = await fetch("/api/chat/media", { method: "POST", body: fd });
      const j = (await r.json()) as { success: boolean; data?: ChatMessageItem; error?: string };
      if (!j.success || !j.data) {
        toast.error(j.error ?? "Yuborib bo'lmadi");
        return false;
      }
      append(j.data);
      return true;
    } catch {
      toast.error("Internet aloqasi uzildi — qayta urinib ko'ring");
      return false;
    } finally {
      setSending(false);
    }
  };

  // ---- Rasm ----
  const pickImage = async (file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return toast.error("Faqat JPG, PNG, WEBP yoki GIF rasm");
    if (file.size > 20 * 1024 * 1024) return toast.error("Rasm juda katta");
    try {
      setPending(await prepareImage(file));
    } catch {
      toast.error("Rasmni o'qib bo'lmadi");
    }
  };

  const sendImage = async () => {
    if (!pending || sending) return;
    if (pending.blob.size > 4 * 1024 * 1024) return toast.error("Rasm juda katta (4 MB gacha)");
    const fd = new FormData();
    fd.set("kind", "image");
    fd.set("file", pending.blob, "image");
    fd.set("width", String(pending.width));
    fd.set("height", String(pending.height));
    fd.set("caption", text.trim());
    if (await upload(fd)) {
      setPending(null);
      setText("");
    }
  };

  // ---- Ovozli xabar ----
  const startRec = async () => {
    const mime = pickMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) return toast.error("Brauzeringiz ovoz yozishni qo'llamaydi");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return toast.error("Mikrofonga ruxsat berilmadi — brauzer sozlamalarida ruxsat bering");
    }
    const mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
    const state: { mr: MediaRecorder; chunks: Blob[]; start: number; cancel: boolean; timer: ReturnType<typeof setInterval> | undefined } = {
      mr,
      chunks: [],
      start: 0,
      cancel: false,
      timer: undefined,
    };
    mr.onstart = () => {
      state.start = Date.now();
      state.timer = setInterval(() => {
        const s = (Date.now() - state.start) / 1000;
        setRec({ seconds: s });
        if (s >= VOICE_MAX_S && mr.state === "recording") mr.stop();
      }, 250);
    };
    mr.ondataavailable = (e) => {
      if (e.data.size) state.chunks.push(e.data);
    };
    mr.onstop = () => {
      clearInterval(state.timer);
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRec(null);
      const duration = Math.round((Date.now() - state.start) / 1000);
      if (state.cancel) return;
      if (duration < 1) return toast.info("Juda qisqa — tugmani bosib, gapirib, keyin yuboring");
      const fd = new FormData();
      fd.set("kind", "voice");
      fd.set("duration", String(Math.min(duration, VOICE_MAX_S)));
      fd.set("file", new Blob(state.chunks, { type: mime.split(";")[0] }), "voice");
      void upload(fd);
    };
    recorder.current = state;
    mr.start(250);
    setRec({ seconds: 0 });
  };

  const stopRec = (cancel: boolean) => {
    const r = recorder.current;
    if (!r || r.mr.state !== "recording") return;
    r.cancel = cancel;
    r.mr.stop();
  };

  // ---- Xabar amallari ----
  const remove = async (m: ChatMessageItem) => {
    const r = await deleteChatMessageAction(m.id);
    if (!r.success) return toast.error(r.error);
    setMessages((prev) => (prev ?? []).map((x) => (x.id === m.id ? { ...x, deleted: true, text: "", voice: null, image: null, sticker: null, replyTo: null, reactions: [] } : x)));
  };

  const mute = async (m: ChatMessageItem, hours: number) => {
    const r = await muteChatUserAction(m.senderId, hours);
    if (!r.success) return toast.error(r.error);
    toast.success(hours ? `${m.senderName} ${hours === 1 ? "1 soat" : "1 kun"} yoza olmaydi` : `${m.senderName} uchun taqiq olib tashlandi`);
  };

  const react = async (m: ChatMessageItem, emoji: string) => {
    // Darhol ko'rsatiladi, server javobini kutmaydi
    const apply = (list: ChatMessageItem["reactions"], next: string | null) => {
      const without = list.map((r) => ({ ...r, users: r.users.filter((u) => u !== me) })).filter((r) => r.users.length);
      if (!next) return without;
      const hit = without.find((r) => r.emoji === next);
      return hit ? without.map((r) => (r.emoji === next ? { ...r, users: [...r.users, me] } : r)) : [...without, { emoji: next, users: [me] }];
    };
    const mineNow = m.reactions.find((r) => r.users.includes(me))?.emoji;
    const next = mineNow === emoji ? null : emoji;
    setMessages((prev) => (prev ?? []).map((x) => (x.id === m.id ? { ...x, reactions: apply(x.reactions, next) } : x)));
    const r = await toggleChatReactionAction(m.id, emoji);
    if (!r.success) toast.error(r.error);
  };

  const jump = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return toast.info("Bu xabar yuqoriroqda — tepaga aylantiring");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-teal-400");
    setTimeout(() => el.classList.remove("ring-2", "ring-teal-400"), 1200);
  };

  const canEdit = Boolean(meta?.canWrite && !meta.mutedUntil);

  // Bubble'lar memo: "yozmoqda" yoki matn kiritish ularni qayta chizmaydi
  const actRef = useRef<(a: Action) => void>(() => {});
  useEffect(() => {
    actRef.current = (a) => {
      if (a.t === "menu") {
        if (a.m.deleted) return;
        setMenu({ m: a.m, x: Math.min(a.x, window.innerWidth - 232), y: Math.min(a.y, window.innerHeight - 380) });
      } else if (a.t === "react") void react(a.m, a.emoji);
      else if (a.t === "jump") jump(a.id);
      else if (a.t === "reply") {
        if (canEdit) setReply(a.m);
      }
      else setLightbox(a.id);
    };
  });
  const onAction = useCallback((a: Action) => actRef.current(a), []);

  const menuItems = (m: ChatMessageItem) => {
    const mine = m.senderId === me;
    const items: { label: string; icon: typeof Copy; danger?: boolean; run: () => void }[] = [];
    if (meta?.canWrite && !meta.mutedUntil)
      items.push({
        label: "Javob berish",
        icon: Reply,
        run: () => setReply(m),
      });
    if (m.text) items.push({ label: "Nusxa olish", icon: Copy, run: () => void navigator.clipboard?.writeText(m.text).then(() => toast.success("Nusxa olindi")) });
    items.push({ label: `Kim o'qidi (${readersOf(m, readers).length})`, icon: Eye, run: () => setWhoRead(m) });
    if (mine || role === "mentor") items.push({ label: "O'chirish", icon: Trash2, danger: true, run: () => void remove(m) });
    if (!mine && role === "student") items.push({ label: "Ustozga shikoyat", icon: Flag, danger: true, run: () => setReport(m) });
    if (role === "mentor" && !mine && m.senderRole === "student") {
      items.push({ label: "1 soat yozmasin", icon: Shield, run: () => void mute(m, 1) });
      items.push({ label: "1 kun yozmasin", icon: Shield, run: () => void mute(m, 24) });
      items.push({ label: "Taqiqni olib tashlash", icon: Shield, run: () => void mute(m, 0) });
    }
    return items;
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(false);
        void pickImage(e.dataTransfer.files?.[0]);
      }}
    >
      <header className="flex items-center gap-2 border-b border-slate-200 px-2.5 py-2 dark:border-slate-800">
        <button
          onClick={onBack}
          aria-label="Orqaga"
          className={cn("flex h-9 w-9 cursor-pointer items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800", !compact && "md:hidden")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Initials name={room.title} mentor={room.kind === "general"} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{room.title}</p>
          <p className={cn("truncate text-xs", typing.length ? "font-semibold text-teal-600" : "text-slate-500")}>
            {typing.length ? `${typing.join(", ")} yozmoqda…` : room.watching ? "Kuzatuv rejimi — siz a'zo emassiz" : room.subtitle}
          </p>
        </div>
        {!room.watching && (
          <button
            onClick={async () => {
              const next = !muted;
              setMuted(next);
              const r = await setChatRoomMuteAction(room.id, next);
              if (!r.success) {
                setMuted(!next);
                return toast.error(r.error);
              }
              toast.success(next ? "Ovozsiz: bu suhbatdan bildirishnoma kelmaydi" : "Bildirishnomalar yoqildi");
              onChanged();
            }}
            aria-label={muted ? "Bildirishnomalarni yoqish" : "Ovozsiz qilish"}
            aria-pressed={muted}
            title={muted ? "Bildirishnomalarni yoqish" : "Ovozsiz qilish"}
            className={cn("flex h-9 w-9 cursor-pointer items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800", muted && "text-slate-400")}
          >
            {muted ? <BellOff className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />}
          </button>
        )}
        {(room.kind === "custom" || room.kind === "dm") && (
          <button
            onClick={() => setInfo(true)}
            aria-label={room.kind === "dm" ? "Suhbat sozlamalari" : "Guruh sozlamalari"}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        )}
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (el.scrollTop < 80) void loadOlder();
          if (menu) setMenu(null);
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-3 py-3 dark:bg-slate-950/40"
      >
        {messages && hasMore && messages.length >= PAGE && <p className="mb-2 text-center text-[11px] text-slate-400">Oldingi xabarlar uchun tepaga aylantiring</p>}
        {messages === null && (
          <div className="space-y-3 py-2">
            {[40, 64, 52, 30].map((w, i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                <span className="h-9 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        )}
        {messages?.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-2 text-center">
            <span className="text-5xl">👋</span>
            <p className="text-sm text-slate-500">Hali xabar yo&apos;q — birinchi bo&apos;lib yozing</p>
          </div>
        )}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayOf(prev.at) !== dayOf(m.at);
          const mine = m.senderId === me;
          const firstOfRun = newDay || !prev || prev.senderId !== m.senderId;
          const lastOfRun = !next || next.senderId !== m.senderId || dayOf(next.at) !== dayOf(m.at);
          return (
            <div key={m.id}>
              {newDay && (
                <p className="my-3 text-center">
                  <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 shadow-sm dark:bg-slate-800/80">{dayOf(m.at)}</span>
                </p>
              )}
              <Bubble
                m={m}
                mine={mine}
                me={me}
                showName={!mine && firstOfRun && room.kind !== "dm"}
                tail={lastOfRun}
                gapTop={firstOfRun && !newDay}
                read={mine && readersOf(m, readers).length > 0}
                onAction={onAction}
              />
            </div>
          );
        })}
        {typing.length > 0 && (
          <div className="flex items-center gap-2 pl-1 pt-2 text-xs text-slate-500">
            <span className="flex gap-0.5 rounded-2xl bg-white px-3 py-2 shadow-sm dark:bg-slate-800">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </span>
            {typing.join(", ")} yozmoqda
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        {meta && !meta.canWrite ? (
          <p className="py-2 text-center text-xs text-slate-500">
            {room.watching ? "Kuzatuv rejimi: xabarlarni o'qish va o'chirish mumkin" : room.kind === "custom" ? "Bu guruhda faqat adminlar yozadi" : "Bu suhbatga yoza olmaysiz"}
          </p>
        ) : meta?.mutedUntil ? (
          <p className="py-2 text-center text-xs font-semibold text-rose-600">
            Ustoz {new Date(meta.mutedUntil).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })} gacha yozishni taqiqlagan
          </p>
        ) : (
          <>
            {reply && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-teal-500 bg-slate-50 px-3 py-1.5 dark:bg-slate-800">
                <Reply className="h-4 w-4 shrink-0 text-teal-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-teal-700 dark:text-teal-300">{reply.senderName}</p>
                  <p className="truncate text-xs text-slate-500">{preview(reply)}</p>
                </div>
                <button onClick={() => setReply(null)} aria-label="Javobni bekor qilish" className="cursor-pointer rounded-full p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {stickers && <StickerPanel onPick={(s) => void sendSticker(s)} onClose={() => setStickers(false)} />}
            {rec ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" onClick={() => stopRec(true)} aria-label="Bekor qilish">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                </Button>
                <div className="flex flex-1 items-center gap-2 rounded-full bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
                  <span className="tabular-nums">{mmss(rec.seconds)}</span>
                  <span className="truncate text-xs font-normal opacity-70">/ {mmss(VOICE_MAX_S)} · yozilmoqda</span>
                </div>
                <Button type="button" size="icon" onClick={() => stopRec(false)} aria-label="Ovozli xabarni yuborish" className="rounded-full">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className="flex items-end gap-1"
              >
                <ComposerIcon label="Stiker" active={stickers} onClick={() => setStickers((s) => !s)}>
                  <Smile className="h-5 w-5" />
                </ComposerIcon>
                <ComposerIcon label="Rasm yuborish" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-5 w-5" />
                </ComposerIcon>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    void pickImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    ping(e.target.value.trim().length > 0);
                    const el = e.target;
                    el.style.height = "";
                    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                  }}
                  onPaste={(e) => {
                    const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
                    if (f) {
                      e.preventDefault();
                      void pickImage(f);
                    }
                  }}
                  onBlur={() => ping(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                    if (e.key === "Escape" && reply) setReply(null);
                  }}
                  rows={1}
                  maxLength={2000}
                  placeholder="Xabar…"
                  aria-label="Xabar"
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-2 text-sm leading-6 outline-none transition-colors focus:border-teal-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900"
                />
                {text.trim() ? (
                  <Button type="submit" size="icon" isLoading={sending} aria-label="Yuborish" className="rounded-full">
                    <Send className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" size="icon" isLoading={sending} onClick={() => void startRec()} aria-label="Ovozli xabar yozish" title="Ovozli xabar (2 daqiqagacha)" className="rounded-full">
                    <Mic className="h-4 w-4" />
                  </Button>
                )}
              </form>
            )}
          </>
        )}
      </footer>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-teal-500/10 backdrop-blur-[1px]">
          <p className="rounded-2xl border-2 border-dashed border-teal-500 bg-white px-6 py-4 text-sm font-semibold text-teal-700 dark:bg-slate-900">Rasmni shu yerga tashlang</p>
        </div>
      )}

      {/* O'ng tugma / uzoq bosish menyusi */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            role="menu"
            className="fixed z-[61] w-56 overflow-hidden rounded-2xl bg-white text-sm shadow-2xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
            style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
          >
            <div className="flex justify-between border-b border-slate-100 px-2 py-1.5 dark:border-slate-700">
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setMenu(null);
                    void react(menu.m, e);
                  }}
                  aria-label={`Reaksiya ${e}`}
                  className={cn(
                    "cursor-pointer rounded-full p-1 text-xl transition-transform hover:scale-125",
                    menu.m.reactions.some((r) => r.emoji === e && r.users.includes(me)) && "bg-teal-100 dark:bg-teal-500/20"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="p-1">
              {menuItems(menu.m).map((it) => (
                <button
                  key={it.label}
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    it.run();
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700",
                    it.danger && "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  )}
                >
                  <it.icon className="h-4 w-4 shrink-0" /> {it.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Rasm yuborishdan oldin ko'rish */}
      <Modal isOpen={pending !== null} onClose={() => setPending(null)} title="Rasm yuborish" maxWidth="md">
        {pending && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.url} alt="Tanlangan rasm" className="max-h-[50vh] w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendImage()}
              maxLength={1000}
              placeholder="Izoh (ixtiyoriy)"
              aria-label="Rasm izohi"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <Button className="w-full" isLoading={sending} onClick={() => void sendImage()}>
              <Send className="h-4 w-4" /> Yuborish
            </Button>
          </div>
        )}
      </Modal>

      {/* Rasmni katta ko'rish */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)} role="dialog" aria-label="Rasm">
          <button onClick={() => setLightbox(null)} aria-label="Yopish" className="absolute right-4 top-4 cursor-pointer rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/chat/media?m=${lightbox}`} alt="Rasm" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <Modal isOpen={whoRead !== null} onClose={() => setWhoRead(null)} title="Kim o'qidi" maxWidth="sm">
        {whoRead && (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {readersOf(whoRead, readers).length === 0 && <li className="py-3 text-sm text-slate-500">Hali hech kim o&apos;qimagan</li>}
            {readersOf(whoRead, readers).map((r) => (
              <li key={r.userId} className="flex items-center gap-3 py-2">
                <Initials name={r.name} size="sm" />
                <span className="flex-1 truncate text-sm">{r.name}</span>
                <CheckCheck className="h-4 w-4 text-sky-500" />
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ReportModal m={report} onClose={() => setReport(null)} />

      {info && (
        <RoomInfo
          room={room}
          me={me}
          role={role}
          onClose={() => setInfo(false)}
          onChanged={() => {
            onChanged();
            kick.current();
          }}
          onLeft={() => {
            setInfo(false);
            onChanged();
            onLeft();
          }}
        />
      )}
    </div>
  );
}

function preview(m: ChatMessageItem): string {
  if (m.sticker) return `${m.sticker} Stiker`;
  if (m.voice) return "🎤 Ovozli xabar";
  if (m.image) return m.text ? `🖼 ${m.text}` : "🖼 Rasm";
  return m.text;
}

function ComposerIcon({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-600 dark:hover:bg-slate-800",
        active && "bg-teal-50 text-teal-600 dark:bg-teal-500/10"
      )}
    >
      {children}
    </button>
  );
}

// ---- Bitta xabar ----
const Bubble = memo(function Bubble({
  m,
  mine,
  me,
  showName,
  tail,
  gapTop,
  read,
  onAction,
}: {
  m: ChatMessageItem;
  mine: boolean;
  me: string;
  showName: boolean;
  tail: boolean;
  gapTop: boolean;
  read: boolean;
  onAction: (a: Action) => void;
}) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
  };
  const bare = Boolean(m.sticker) && !m.deleted;
  const handlers = {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onAction({ t: "menu", m, x: e.clientX, y: e.clientY });
    },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      press.current = setTimeout(() => onAction({ t: "menu", m, x: t.clientX, y: t.clientY }), 450);
    },
    onTouchEnd: cancelPress,
    onTouchMove: cancelPress,
    // Ikki marta bosish — ❤️ (Instagram kabi)
    onDoubleClick: (e: React.MouseEvent) => {
      if (m.deleted) return;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      onAction({ t: "react", m, emoji: "❤️" });
    },
  };
  const stamp = (
    <span className={cn("ml-2 inline-flex translate-y-0.5 items-center gap-0.5 whitespace-nowrap text-[10px]", bare ? "text-slate-400" : mine ? "text-teal-100" : "text-slate-400")}>
      {timeOf(m.at)}
      {mine &&
        !m.deleted &&
        (read ? <CheckCheck className={cn("h-3.5 w-3.5", bare ? "text-sky-500" : "text-sky-200")} aria-label="O'qildi" /> : <Check className="h-3.5 w-3.5" aria-label="Yuborildi" />)}
    </span>
  );

  return (
    <div id={`msg-${m.id}`} className={cn("group flex items-end gap-1 rounded-2xl transition-shadow", mine ? "justify-end" : "justify-start", gapTop ? "mt-2.5" : "mt-0.5")}>
      {mine && !m.deleted && (
        <>
          <MenuButton onOpen={(x, y) => onAction({ t: "menu", m, x, y })} />
          <ReplyButton onReply={() => onAction({ t: "reply", m })} />
        </>
      )}
      <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
        <div
          {...handlers}
          className={cn(
            "relative select-text text-sm",
            bare
              ? "px-1"
              : cn(
                  "rounded-[20px] shadow-sm",
                  m.image ? "overflow-hidden p-1" : "px-3 py-1.5",
                  mine ? "bg-teal-600 text-white" : "bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100",
                  tail && (mine ? "rounded-br-md" : "rounded-bl-md")
                )
          )}
        >
          {showName && (
            <p className={cn("mb-0.5 text-xs font-bold", m.image && "px-2 pt-1", m.senderRole === "mentor" ? "text-amber-600" : "text-teal-700 dark:text-teal-300")}>
              {m.senderName}
              {m.senderRole === "mentor" && " · Ustoz"}
            </p>
          )}
          {m.replyTo && !m.deleted && (
            <button
              type="button"
              onClick={() => onAction({ t: "jump", id: m.replyTo!.id })}
              className={cn(
                "mb-1 block w-full cursor-pointer rounded-lg border-l-[3px] px-2 py-1 text-left text-xs",
                mine && !bare ? "border-white/70 bg-white/15" : "border-teal-500 bg-slate-100 dark:bg-slate-700/60"
              )}
            >
              <span className="block font-bold">{m.replyTo.senderName}</span>
              <span className="line-clamp-1 opacity-80">{m.replyTo.text}</span>
            </button>
          )}
          {m.deleted ? (
            <p className="italic opacity-70">
              Xabar o&apos;chirildi {stamp}
            </p>
          ) : m.sticker ? (
            <div className="flex flex-col items-end">
              <span className="chat-sticker block select-none text-[72px] leading-none" role="img" aria-label="Stiker">
                {m.sticker}
              </span>
              {stamp}
            </div>
          ) : m.image ? (
            <div>
              <button type="button" onClick={() => onAction({ t: "image", id: m.id })} className="block cursor-zoom-in" aria-label="Rasmni kattalashtirish">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/chat/media?m=${m.id}`}
                  alt={m.text || "Rasm"}
                  loading="lazy"
                  decoding="async"
                  width={m.image.width}
                  height={m.image.height}
                  className="max-h-80 max-w-full rounded-2xl bg-slate-200 object-cover dark:bg-slate-700"
                  style={{ aspectRatio: `${m.image.width} / ${m.image.height}`, width: Math.min(280, m.image.width), height: "auto" }}
                />
              </button>
              <p className="whitespace-pre-wrap break-words px-2 pb-1 pt-1 text-right">
                {m.text && (
                  <span className="block text-left">
                    <Linkified text={m.text} />
                  </span>
                )}
                {stamp}
              </p>
            </div>
          ) : m.voice ? (
            <div className="flex items-center gap-2">
              <VoicePlayer id={m.id} duration={m.voice.duration} mine={mine} />
              {stamp}
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">
              <Linkified text={m.text} />
              {stamp}
            </p>
          )}
        </div>
        {m.reactions.length > 0 && (
          <div className={cn("-mt-1.5 flex flex-wrap gap-1 px-1", mine ? "justify-end" : "justify-start")}>
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onAction({ t: "react", m, emoji: r.emoji })}
                className={cn(
                  "relative z-[1] flex cursor-pointer items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm",
                  r.users.includes(me) ? "border-teal-300 bg-teal-50 dark:border-teal-600 dark:bg-teal-500/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                )}
              >
                {r.emoji}
                {r.users.length > 1 && <span className="font-semibold text-slate-600 dark:text-slate-300">{r.users.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {!mine && !m.deleted && (
        <>
          <ReplyButton onReply={() => onAction({ t: "reply", m })} />
          <MenuButton onOpen={(x, y) => onAction({ t: "menu", m, x, y })} />
        </>
      )}
    </div>
  );
});

/** Ovozli xabar: ijro/pauza, o'tish chizig'i; fayl faqat bosilganda yuklanadi */
function VoicePlayer({ id, duration, mine }: { id: string; duration: number; mine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      // Bir vaqtda faqat bitta ovozli xabar
      document.querySelectorAll<HTMLAudioElement>("audio[data-chat-voice]").forEach((x) => x !== a && x.pause());
      void a.play().catch(() => {});
    } else a.pause();
  };
  const total = Math.max(1, duration);
  return (
    <div className="flex min-w-[190px] items-center gap-2 py-0.5">
      <audio
        ref={ref}
        data-chat-voice
        preload="none"
        src={`/api/chat/media?m=${id}`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "To'xtatish" : "Eshitish"}
        className={cn("flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full", mine ? "bg-white text-teal-700" : "bg-teal-600 text-white")}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div
          className={cn("relative h-1.5 cursor-pointer rounded-full", mine ? "bg-white/30" : "bg-slate-200 dark:bg-slate-700")}
          onClick={(e) => {
            const a = ref.current;
            if (!a) return;
            const r = e.currentTarget.getBoundingClientRect();
            const t = ((e.clientX - r.left) / r.width) * total;
            a.currentTime = t;
            setPos(t);
            if (a.paused) void a.play().catch(() => {});
          }}
        >
          <span className={cn("absolute inset-y-0 left-0 rounded-full", mine ? "bg-white" : "bg-teal-600")} style={{ width: `${Math.min(100, (pos / total) * 100)}%` }} />
        </div>
        <span className="text-[11px] tabular-nums opacity-80">{mmss(playing || pos ? pos : duration)}</span>
      </div>
    </div>
  );
}

function ReplyButton({ onReply }: { onReply: () => void }) {
  return (
    <button
      onClick={onReply}
      aria-label="Javob berish"
      title="Javob berish"
      className="mb-1 hidden cursor-pointer rounded-full p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800 md:block"
    >
      <Reply className="h-4 w-4" />
    </button>
  );
}

/** Sichqonchasiz/klaviaturadan ham menyu: xabar yonidagi "⋮" (hover/fokusda ko'rinadi) */
function MenuButton({ onOpen }: { onOpen: (x: number, y: number) => void }) {
  return (
    <button
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onOpen(r.left, r.bottom);
      }}
      aria-label="Xabar amallari"
      className="mb-1 cursor-pointer rounded-full p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800"
    >
      <MoreVertical className="h-4 w-4" />
    </button>
  );
}

function StickerPanel({ onPick, onClose }: { onPick: (s: string) => void; onClose: () => void }) {
  const [pack, setPack] = useState(STICKER_PACKS[0].id);
  const items = STICKER_PACKS.find((p) => p.id === pack)?.items ?? [];
  return (
    <div className="mb-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1.5 flex items-center gap-1 overflow-x-auto">
        {STICKER_PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPack(p.id)}
            className={cn(
              "shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-semibold",
              pack === p.id ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            )}
          >
            {p.items[0]} {p.title}
          </button>
        ))}
        <button type="button" onClick={onClose} aria-label="Yopish" className="ml-auto shrink-0 cursor-pointer rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8">
        {items.map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)} aria-label={`Stiker ${s}`} className="cursor-pointer rounded-xl p-1 text-4xl transition-transform hover:scale-110 hover:bg-slate-100 dark:hover:bg-slate-800">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportModal({ m, onClose }: { m: ChatMessageItem | null; onClose: () => void }) {
  const { toast } = useToast();
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal isOpen={m !== null} onClose={onClose} title="Ustozga shikoyat" maxWidth="sm">
      {m && (
        <div className="space-y-3">
          <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
            <span className="font-bold">{m.senderName}:</span> {preview(m) || "—"}
          </p>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Nima bo'ldi? (ixtiyoriy)"
            aria-label="Sabab"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            variant="danger"
            className="w-full"
            isLoading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await reportChatMessageAction(m.id, why);
              setBusy(false);
              if (!r.success) return toast.error(r.error);
              toast.success("Shikoyat ustozga yuborildi");
              setWhy("");
              onClose();
            }}
          >
            <Flag className="h-4 w-4" /> Yuborish
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ---- Guruh / shaxsiy suhbat sozlamalari ----
function RoomInfo({
  room,
  me,
  role,
  onClose,
  onChanged,
  onLeft,
}: {
  room: ChatRoomItem;
  me: string;
  role: "mentor" | "student";
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<ChatGroupInfo | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const [r, b] = await Promise.all([getChatMembersAction(room.id), room.kind === "dm" ? getChatBlockedAction() : Promise.resolve(null)]);
    if (!r.success) return toast.error(r.error);
    setData(r.data);
    setName(r.data.name);
    if (b?.success) setBlocked(b.data);
  }, [room.id, room.kind, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const run = async (p: Promise<{ success: boolean; error?: string }>, ok?: string) => {
    const r = await p;
    if (!r.success) return toast.error(r.error ?? "Xato");
    if (ok) toast.success(ok);
    await load();
    onChanged();
  };

  const other = data?.members.find((u) => u.id !== me);
  const isBlocked = other ? blocked.includes(other.id) : false;

  return (
    <Modal isOpen onClose={onClose} title={adding ? "A'zo qo'shish" : room.kind === "dm" ? "Suhbat" : "Guruh sozlamalari"} maxWidth="md">
      {!data && <p className="py-6 text-center text-sm text-slate-500">Yuklanmoqda…</p>}
      {data && adding && (
        <AddMembers
          roomId={room.id}
          exclude={data.members.map((m) => m.id)}
          onDone={async () => {
            setAdding(false);
            await load();
            onChanged();
          }}
        />
      )}
      {data && !adding && room.kind === "dm" && (
        <div className="space-y-3">
          {data.members.map((u) => (
            <div key={u.id} className="flex items-center gap-3">
              <Initials name={u.name} mentor={u.role === "mentor"} size="sm" />
              <span className="flex-1 truncate text-sm font-semibold">{u.name}</span>
              {u.role === "mentor" && <span className="text-xs font-semibold text-amber-600">Ustoz</span>}
            </div>
          ))}
          {other && other.role !== "mentor" && !room.watching && (
            <>
              <Button
                variant={isBlocked ? "secondary" : "outline"}
                className={cn("w-full", !isBlocked && "text-rose-600")}
                onClick={() => void run(setChatBlockAction(other.id, !isBlocked), isBlocked ? "Blokdan chiqarildi" : `${other.name} bloklandi — u sizga yoza olmaydi`)}
              >
                <Ban className="h-4 w-4" /> {isBlocked ? "Blokdan chiqarish" : "Bloklash"}
              </Button>
              <p className="text-xs text-slate-500">Bloklangan odam sizga shaxsiy xabar yoza olmaydi va sizni guruhlarga qo&apos;sha olmaydi.</p>
            </>
          )}
        </div>
      )}
      {data && !adding && room.kind === "custom" && (
        <div className="space-y-4">
          {data.canManage ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() !== data.name) void run(renameChatGroupAction(room.id, name), "Nom o'zgartirildi");
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                aria-label="Guruh nomi"
                className="min-h-[40px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={name.trim().length < 3 || name.trim() === data.name}>
                Saqlash
              </Button>
            </form>
          ) : (
            <p className="text-base font-bold">{data.name}</p>
          )}

          {data.canManage && (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <Megaphone className="h-5 w-5 shrink-0 text-teal-600" />
              <span className="flex-1">
                <span className="block text-sm font-semibold">Faqat adminlar yozadi</span>
                <span className="block text-xs text-slate-500">E&apos;lonlar uchun: boshqalar faqat o&apos;qiydi va reaksiya qo&apos;yadi</span>
              </span>
              <input type="checkbox" className="h-5 w-5 accent-teal-600" checked={data.onlyAdmins} onChange={(e) => void run(setChatOnlyAdminsAction(room.id, e.target.checked))} />
            </label>
          )}

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">{data.members.length} a&apos;zo</p>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {data.members.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2">
                  <Initials name={u.name} mentor={u.role === "mentor"} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {u.name}
                      {u.id === me && " (siz)"}
                    </span>
                    {(u.owner || u.admin) && (
                      <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", u.owner ? "text-amber-600" : "text-teal-600")}>
                        {u.owner ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {u.owner ? "Egasi" : "Admin"}
                      </span>
                    )}
                  </span>
                  {data.isOwner && !u.owner && u.id !== me && (
                    <button
                      onClick={() => void run(setChatAdminAction(room.id, u.id, !u.admin))}
                      title={u.admin ? "Adminlikdan olish" : "Admin qilish"}
                      aria-label={u.admin ? `${u.name}ni adminlikdan olish` : `${u.name}ni admin qilish`}
                      className={cn("cursor-pointer rounded-lg p-2 hover:bg-teal-50 dark:hover:bg-teal-500/10", u.admin ? "text-teal-600" : "text-slate-400")}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                  )}
                  {data.canManage && !u.owner && u.id !== me && (!u.admin || data.isOwner) && (
                    <button
                      onClick={() => void run(removeChatMemberAction(room.id, u.id), `${u.name} guruhdan chiqarildi`)}
                      aria-label={`${u.name}ni chiqarish`}
                      title="Guruhdan chiqarish"
                      className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {data.canManage && (
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <UserPlus className="h-4 w-4" /> A&apos;zo qo&apos;shish
              </Button>
            )}
            {!room.watching && (
              <Button
                variant="outline"
                className="text-rose-600"
                onClick={async () => {
                  const r = await leaveChatGroupAction(room.id);
                  if (!r.success) return toast.error(r.error);
                  onLeft();
                }}
              >
                <LogOut className="h-4 w-4" /> Guruhdan chiqish
              </Button>
            )}
            {(data.isOwner || role === "mentor") && (
              <Button
                variant={confirmDelete ? "danger" : "ghost"}
                className={cn("sm:col-span-2", !confirmDelete && "text-rose-600")}
                onClick={async () => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  const r = await deleteChatGroupAction(room.id);
                  if (!r.success) return toast.error(r.error);
                  toast.success("Guruh o'chirildi");
                  onLeft();
                }}
              >
                <Trash2 className="h-4 w-4" /> {confirmDelete ? "Tasdiqlang: guruh va xabarlar butunlay o'chadi" : "Guruhni o'chirish"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
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
