"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Headphones, HeadphoneOff, Lock, Mic, MicOff, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { getVoiceTicketAction, setVoiceMutedAction } from "@/actions/live-voice.actions";
import { VoiceEngine, type VoiceSnapshot } from "./voice-engine";

// Jonli o'yindagi ovozli suhbat paneli: yuqorida kim gapirayotgani (ovoz darajasi bilan), mikrofon, karnay va balandlik.
// Savol paytida javob bermaganlar qulfda (xona majburlaydi). Ustoz hammaning mikrofonini o'chira oladi.

const PREFS_KEY = "itx-voice-prefs";

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

export function VoiceChat({ gameId, host = false, className }: { gameId: string; host?: boolean; className?: string }) {
  const [panel, setPanel] = useState(false);
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
    engine.start();
    // Brauzer ovozni faqat bosishdan keyin yoqadi
    const unlock = () => engine.unlock();
    document.addEventListener("pointerdown", unlock, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      engine.stop();
    };
  }, [engine]);

  const s = useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => EMPTY);
  const saved = useRef("");
  useEffect(() => {
    const key = `${s.deaf}:${s.volume}:${s.micGain}`;
    if (key !== saved.current) {
      saved.current = key;
      savePrefs(host, s);
    }
  }, [engine, host, s]);

  // Faqat haqiqatda ulangach (yoki brauzer qo'llamasa — sababi bilan) ko'rinadi
  if (s.status === "off" || (!s.everLive && s.status !== "unsupported")) return null;

  const me = s.peers.find((p) => p.s === s.me);
  const locked = Boolean(me?.lock);
  const mutedForMe = s.muted && !host;
  const canMic = s.status === "live" && !locked && !mutedForMe;
  const nameOf = (slot: number) => (slot === s.me ? "Siz" : s.peers.find((p) => p.s === slot)?.n ?? "");
  const talkers = Object.entries(s.speaking)
    .map(([k, level]) => ({ slot: Number(k), level }))
    .filter((t) => nameOf(t.slot))
    .sort((a, b) => b.level - a.level)
    .slice(0, 4);
  const others = s.peers.filter((p) => p.s !== s.me).length;

  const toggleMuteAll = async () => {
    if (muting) return;
    setMuting(true);
    try {
      await setVoiceMutedAction(gameId, !s.muted);
    } finally {
      setMuting(false);
    }
  };

  return (
    <div className={cn("relative mb-3", className)}>
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.06] px-2.5 py-2 ring-1 ring-white/10">
        {/* Kim gapiryapti */}
        <div className="flex min-h-[36px] min-w-0 flex-1 items-center gap-1.5 overflow-hidden" aria-live="polite">
          {s.status === "unsupported" ? (
            <span className="truncate text-xs text-slate-400">{s.error}</span>
          ) : locked ? (
            <span className="inline-flex items-center gap-1.5 truncate text-xs font-semibold text-amber-200">
              <Lock className="h-3.5 w-3.5 shrink-0" /> Javob bering — keyin javob berganlar bilan gaplashasiz
            </span>
          ) : talkers.length > 0 ? (
            talkers.map((t) => <Talker key={t.slot} name={nameOf(t.slot)} level={t.level} self={t.slot === s.me} />)
          ) : (
            <span className="truncate text-xs text-slate-400">
              {s.status !== "live"
                ? "Ovozli suhbat qayta ulanmoqda…"
                : mutedForMe
                ? "🔇 Ustoz mikrofonlarni o'chirib qo'ygan — faqat eshitasiz"
                : s.question
                ? `🎧 Javob berganlar bilan suhbat · ${others} kishi`
                : `🎧 Ovozli suhbat · ${others} kishi`}
            </span>
          )}
        </div>

        {host && (
          <button
            type="button"
            onClick={() => void toggleMuteAll()}
            disabled={muting || s.status !== "live"}
            aria-pressed={s.muted}
            title="Dars paytida: o'quvchilarning hammasi gapira olmaydi"
            className={cn(
              "inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors disabled:opacity-50",
              s.muted ? "bg-rose-500 text-white hover:bg-rose-400" : "bg-white/10 text-slate-200 hover:bg-white/20"
            )}
          >
            <MicOff className="h-4 w-4" />
            <span className="hidden sm:inline">{s.muted ? "Mikrofonlar o'chiq" : "Hammani o'chirish"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => void engine.setMic(!s.mic)}
          disabled={!canMic && !s.mic}
          aria-pressed={s.mic}
          aria-label={s.mic ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
          title={locked ? "Avval javob bering" : mutedForMe ? "Ustoz mikrofonlarni o'chirgan" : s.mic ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
          className={cn(
            "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            s.mic && canMic ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-white/10 text-slate-200 hover:bg-white/20"
          )}
        >
          {s.mic && canMic ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => engine.setDeaf(!s.deaf)}
          aria-pressed={!s.deaf}
          aria-label={s.deaf ? "Karnayni yoqish" : "Karnayni o'chirish"}
          title={s.deaf ? "Karnayni yoqish" : "Karnayni o'chirish"}
          className={cn(
            "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors",
            s.deaf ? "bg-white/10 text-slate-400 hover:bg-white/20" : "bg-sky-500 text-white hover:bg-sky-400"
          )}
        >
          {s.deaf ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => setPanel((v) => !v)}
          aria-expanded={panel}
          aria-label="Ovoz balandligi"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-slate-200 hover:bg-white/20"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
        </button>
      </div>

      {s.error && s.status !== "unsupported" && <p className="mt-1.5 px-1 text-xs font-semibold text-rose-300">{s.error}</p>}

      {panel && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl bg-slate-900/95 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur">
          <Slider
            label="Karnay balandligi"
            icon={s.deaf || s.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            value={s.volume}
            onChange={(v) => {
              engine.setVolume(v);
              if (s.deaf && v > 0) engine.setDeaf(false);
            }}
          />
          <Slider label="Mikrofon kuchi" icon={<Mic className="h-4 w-4" />} value={s.micGain} onChange={(v) => engine.setMicGain(v)} />
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Ovoz yozib olinmaydi va saqlanmaydi — faqat o&apos;yindagilar eshitadi. Savol paytida javob berganlar bir-biri bilan gaplashadi.
          </p>
        </div>
      )}
    </div>
  );
}

function Slider({ label, icon, value, onChange }: { label: string; icon: React.ReactNode; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          {icon} {label}
        </span>
        <span className="tabular-nums text-slate-400">{Math.round(value * 100)}%</span>
      </span>
      <input type="range" min={0} max={2} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full cursor-pointer accent-violet-500" />
    </label>
  );
}

/** Gapirayotgan odam: ismi va ovoz balandligiga qarab "sakraydigan" ustunchalar */
function Talker({ name, level, self }: { name: string; level: number; self: boolean }) {
  const l = Math.max(0.15, Math.min(1, level * 1.6));
  return (
    <span className={cn("inline-flex min-w-0 shrink items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1", self ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/40" : "bg-violet-500/25 text-violet-50 ring-violet-400/40")}>
      <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
        {[0.55, 1, 0.75].map((k, i) => (
          <span key={i} className="w-[3px] rounded-full bg-current transition-[height] duration-100" style={{ height: `${Math.round(25 + 75 * l * k)}%` }} />
        ))}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
