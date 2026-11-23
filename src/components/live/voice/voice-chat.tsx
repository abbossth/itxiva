"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Headphones, HeadphoneOff, Lock, Mic, MicOff, SlidersHorizontal, Users, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { getVoiceTicketAction, setVoiceMutedAction } from "@/actions/live-voice.actions";
import { VoiceEngine, type VoiceSnapshot } from "./voice-engine";

// Jonli o'yindagi ovozli suhbat: kim gapirayotgani (ovoz darajasi bilan), mikrofon, karnay va balandlik.
// Savol paytida javob bermaganlar qulfda (xona majburlaydi). Ustoz hammaning mikrofonini o'chira oladi.
// Qismlar alohida: o'quvchi ekranida — bitta ixcham panel (VoiceChat), ustoz ekranida — tugmalar asboblar panelida,
// "kim gapiryapti" esa ekran tepasida suzib turadi va joy egallamaydi.

// v2: birinchi versiyada ustozda karnay sukutda o'chiq edi va shu saqlanib qolgan — eski qiymat hisobga olinmaydi
const PREFS_KEY = "itx-voice-prefs-v2";

// "Ovozli suhbat yo'q" javobi o'yin bo'yicha 2 daqiqa eslab qolinadi: panel qayta ochilganda miltillamaydi va server qayta-qayta so'ralmaydi
const OFF_TTL_MS = 120_000;
const offUntil = new Map<string, number>();

function readPrefs(host: boolean): { deaf: boolean; volume: number; micGain: number } {
  const def = { deaf: false, volume: 1, micGain: 1 };
  try {
    const raw = localStorage.getItem(`${PREFS_KEY}${host ? "-host" : ""}`);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<typeof def>;
    return {
      deaf: typeof p.deaf === "boolean" ? p.deaf : def.deaf,
      volume: typeof p.volume === "number" ? p.volume : 1,
      micGain: typeof p.micGain === "number" ? p.micGain : 1,
    };
  } catch {
    return def;
  }
}

function savePrefs(host: boolean, s: VoiceSnapshot) {
  try {
    localStorage.setItem(`${PREFS_KEY}${host ? "-host" : ""}`, JSON.stringify({ deaf: s.deaf, volume: s.volume, micGain: s.micGain }));
  } catch {
    // saqlanmasa ham ishlaydi
  }
}

const EMPTY: VoiceSnapshot = {
  status: "idle",
  everLive: false,
  error: null,
  me: null,
  peers: [],
  muted: false,
  question: false,
  mic: false,
  deaf: false,
  volume: 1,
  micGain: 1,
  speaking: {},
};

export interface Voice {
  engine: VoiceEngine;
  s: VoiceSnapshot;
  host: boolean;
  /** Ko'rsatish kerakmi: haqiqatda ulangan (yoki brauzer qo'llamaydi — sababi bilan) */
  visible: boolean;
  locked: boolean;
  mutedForMe: boolean;
  canMic: boolean;
  others: number;
  talkers: { slot: number; name: string; level: number; self: boolean }[];
  toggleMuteAll: () => Promise<void>;
  muting: boolean;
}

/** Ovozli suhbat holati; active=false bo'lsa ulanmaydi (masalan, o'yin tugagan) */
export function useVoice(gameId: string, host: boolean, active = true): Voice {
  const [muting, setMuting] = useState(false);
  // Dvigatel bir marta yaratiladi (yon ta'sirsiz); ulanish effektda boshlanadi
  const [engine] = useState(
    () =>
      new VoiceEngine(async () => {
        if ((offUntil.get(gameId) ?? 0) > Date.now()) return "off";
        const res = await getVoiceTicketAction(gameId);
        if (!res.success) return null;
        if (!res.data.url) {
          offUntil.set(gameId, Date.now() + OFF_TTL_MS);
          return "off";
        }
        return res.data.url;
      }, typeof window === "undefined" ? {} : readPrefs(host))
  );

  useEffect(() => {
    if (!active) return;
    engine.start();
    // Brauzer ovozni faqat bosishdan keyin yoqadi
    const unlock = () => engine.unlock();
    document.addEventListener("pointerdown", unlock, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      engine.stop();
    };
  }, [engine, active]);

  const s = useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => EMPTY);
  const saved = useRef("");
  useEffect(() => {
    const key = `${s.deaf}:${s.volume}:${s.micGain}`;
    if (key !== saved.current) {
      saved.current = key;
      savePrefs(host, s);
    }
  }, [host, s]);

  const me = s.peers.find((p) => p.s === s.me);
  const locked = Boolean(me?.lock);
  const mutedForMe = s.muted && !host;
  const nameOf = (slot: number) => (slot === s.me ? "Siz" : s.peers.find((p) => p.s === slot)?.n ?? "");
  const talkers = Object.entries(s.speaking)
    .map(([k, level]) => ({ slot: Number(k), name: nameOf(Number(k)), level, self: Number(k) === s.me }))
    .filter((t) => t.name)
    .sort((a, b) => b.level - a.level)
    .slice(0, 4);

  return {
    engine,
    s,
    host,
    visible: active && s.status !== "off" && (s.everLive || s.status === "unsupported"),
    locked,
    mutedForMe,
    canMic: s.status === "live" && !mutedForMe,
    others: s.peers.filter((p) => p.s !== s.me).length,
    talkers,
    muting,
    toggleMuteAll: async () => {
      if (muting) return;
      setMuting(true);
      try {
        await setVoiceMutedAction(gameId, !s.muted);
      } finally {
        setMuting(false);
      }
    },
  };
}

/** Mikrofon · karnay (· ustozda: hammani o'chirish) — bitta guruh */
export function VoiceButtons({ v, size = "md" }: { v: Voice; size?: "sm" | "md" }) {
  const { s, engine } = v;
  const micOn = s.mic && v.canMic;
  const btn = cn("flex cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40", size === "sm" ? "h-9 w-9" : "h-10 w-10");
  return (
    <div className="inline-flex shrink-0 items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10" role="group" aria-label="Ovozli suhbat">
      <button
        type="button"
        onClick={() => void engine.setMic(!s.mic)}
        disabled={!v.canMic && !s.mic}
        aria-pressed={micOn}
        aria-label={s.mic ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
        title={v.locked ? "Hozir sizni faqat ustoz eshitadi" : v.mutedForMe ? "Ustoz mikrofonlarni o'chirgan" : s.mic ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
        className={cn(btn, micOn ? "bg-emerald-500 text-white hover:bg-emerald-400" : "text-slate-200 hover:bg-white/15")}
      >
        {micOn ? <Mic className="h-[18px] w-[18px]" /> : <MicOff className="h-[18px] w-[18px]" />}
      </button>
      <span className="h-5 w-px bg-white/15" aria-hidden />
      <button
        type="button"
        onClick={() => engine.setDeaf(!s.deaf)}
        aria-pressed={!s.deaf}
        aria-label={s.deaf ? "Suhbatni eshitish" : "Suhbatni o'chirish"}
        title={`${s.deaf ? "Suhbatni eshitish" : "Suhbatni o'chirish"} · ${v.others} kishi suhbatda`}
        className={cn(btn, s.deaf ? "text-slate-400 hover:bg-white/15" : "text-sky-300 hover:bg-white/15")}
      >
        {s.deaf ? <HeadphoneOff className="h-[18px] w-[18px]" /> : <Headphones className="h-[18px] w-[18px]" />}
      </button>
      {v.host && (
        <>
          <span className="h-5 w-px bg-white/15" aria-hidden />
          <button
            type="button"
            onClick={() => void v.toggleMuteAll()}
            disabled={v.muting || s.status !== "live"}
            aria-pressed={s.muted}
            aria-label={s.muted ? "O'quvchilar mikrofonini qaytarish" : "Hammaning mikrofonini o'chirish"}
            title={s.muted ? "O'quvchilar mikrofoni o'chiq — qaytarish" : "Hammaning mikrofonini o'chirish (dars paytida)"}
            className={cn(btn, "w-auto gap-1.5 px-3 text-xs font-bold", s.muted ? "bg-rose-500 text-white hover:bg-rose-400" : "text-slate-200 hover:bg-white/15")}
          >
            <Users className="h-4 w-4" />
            <span className="hidden lg:inline">{s.muted ? "O'chirilgan" : "Hammani o'chirish"}</span>
          </button>
        </>
      )}
    </div>
  );
}

/** Kim gapiryapti; hech kim gapirmasa — holat matni (yoki hech narsa) */
export function VoiceTalkers({ v, idle = true }: { v: Voice; idle?: boolean }) {
  const { s } = v;
  if (s.status === "unsupported") return <span className="truncate text-xs text-slate-400">{s.error}</span>;
  if (v.locked)
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-amber-200">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Javob bering — hozir sizni faqat ustoz eshitadi</span>
      </span>
    );
  if (v.talkers.length > 0) return <>{v.talkers.map((t) => <Talker key={t.slot} name={t.name} level={t.level} self={t.self} />)}</>;
  if (!idle) return null;
  return (
    <span className="truncate text-xs text-slate-400">
      {s.status !== "live"
        ? "Qayta ulanmoqda…"
        : v.mutedForMe
        ? "🔇 Ustoz mikrofonlarni o'chirgan — faqat eshitasiz"
        : s.question
        ? `Javob berganlar bilan suhbat · ${v.others} kishi`
        : `Ovozli suhbat · ${v.others} kishi`}
    </span>
  );
}

/** Ustoz ekrani: tepada suzib turadigan "kim gapiryapti" (joy egallamaydi, faqat kimdir gapirsa ko'rinadi) */
export function VoiceFloatingTalkers({ v }: { v: Voice }) {
  if (!v.visible || v.talkers.length === 0) return null;
  return (
    <div className="pointer-events-none sticky top-0 z-30 flex h-0 justify-center" aria-live="polite">
      <div className="quiz-pop mt-1 flex max-w-[92vw] items-center gap-1.5 rounded-full bg-slate-950/80 px-2 py-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur">
        <VoiceTalkers v={v} idle={false} />
      </div>
    </div>
  );
}

/** Karnay balandligi va mikrofon kuchi */
export function VoiceSliders({ v }: { v: Voice }) {
  const { s, engine } = v;
  return (
    <>
      <RangeRow
        label="Suhbat balandligi"
        icon={s.deaf || s.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        value={s.volume}
        max={2}
        onChange={(x) => {
          engine.setVolume(x);
          if (s.deaf && x > 0) engine.setDeaf(false);
        }}
      />
      <RangeRow label="Mikrofon kuchi" icon={<Mic className="h-4 w-4" />} value={s.micGain} max={2} onChange={(x) => engine.setMicGain(x)} />
    </>
  );
}

export function RangeRow({ label, icon, value, max = 1, onChange }: { label: string; icon: React.ReactNode; value: number; max?: number; onChange: (v: number) => void }) {
  return (
    <label className="block py-1.5">
      <span className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-200">
        <span className="inline-flex items-center gap-2 text-slate-300">
          {icon} {label}
        </span>
        <span className="tabular-nums text-slate-400">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-violet-400"
      />
    </label>
  );
}

/** O'quvchi ekrani: bitta ixcham qator — chapda kim gapiryapti, o'ngda tugmalar */
export function VoiceChat({ gameId, className }: { gameId: string; className?: string }) {
  const v = useVoice(gameId, false);
  const [panel, setPanel] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, panel, () => setPanel(false));
  if (!v.visible) return null;
  return (
    <div ref={ref} className={cn("relative mb-3", className)}>
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.06] py-1.5 pl-3 pr-1.5 ring-1 ring-white/10">
        <div className="flex min-h-[36px] min-w-0 flex-1 items-center gap-1.5 overflow-hidden" aria-live="polite">
          <VoiceTalkers v={v} />
        </div>
        <VoiceButtons v={v} size="sm" />
        <button
          type="button"
          onClick={() => setPanel((x) => !x)}
          aria-expanded={panel}
          aria-label="Ovoz sozlamalari"
          className={cn("flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-200 transition-colors", panel ? "bg-white/20" : "bg-white/10 hover:bg-white/20")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>
      {v.s.error && v.s.status !== "unsupported" && <p className="mt-1.5 px-1 text-xs font-semibold text-rose-300">{v.s.error}</p>}
      {panel && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(88vw,280px)] rounded-2xl bg-slate-900/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
          <VoiceSliders v={v} />
          <p className="mt-1 border-t border-white/10 pt-2 text-[11px] leading-snug text-slate-400">Ovoz yozib olinmaydi va saqlanmaydi — faqat o&apos;yindagilar eshitadi.</p>
        </div>
      )}
    </div>
  );
}

/** Tashqariga bosilganda yopish */
export function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

/** Gapirayotgan odam: ismi va ovoz balandligiga qarab "sakraydigan" ustunchalar */
function Talker({ name, level, self }: { name: string; level: number; self: boolean }) {
  const l = Math.max(0.15, Math.min(1, level * 1.6));
  return (
    <span
      className={cn(
        "inline-flex min-w-0 shrink items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1",
        self ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/40" : "bg-violet-500/25 text-violet-50 ring-violet-400/40"
      )}
    >
      <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
        {[0.55, 1, 0.75].map((k, i) => (
          <span key={i} className="w-[3px] rounded-full bg-current transition-[height] duration-100" style={{ height: `${Math.round(25 + 75 * l * k)}%` }} />
        ))}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
