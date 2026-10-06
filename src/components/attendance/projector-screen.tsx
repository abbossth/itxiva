"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Maximize2,
  Minimize2,
  RefreshCw,
  CheckCircle2,
  Download,
  Copy,
  Check,
  ArrowLeft,
  Square,
  Sparkles,
  UserX,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { CountdownRing } from "@/components/ui/countdown-ring";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  rotateAttendanceSessionAction,
  closeAttendanceSessionAction,
  exportAttendanceCsvAction,
  getAttendanceSessionForProjector,
  ProjectorSessionData,
} from "@/actions/attendance.actions";
import { formatTimeUz } from "@/lib/utils";
import { playCheckInSound, unlockSound } from "@/lib/sound";

interface AttendeeRecord {
  _id: string;
  studentId: {
    _id: string;
    fullName: string;
    login: string;
  };
  status: "present" | "late" | "excused" | "absent";
  method: "qr" | "code" | "manual";
  markedAt: string;
  coinsAwarded: number;
}

interface ProjectorScreenProps {
  initialData: {
    session: ProjectorSessionData;
    group: {
      name: string;
      grade: number;
    } | null;
    totalStudents: number;
    absentStudents: { _id: string; fullName: string; login: string }[];
    records: AttendeeRecord[];
    qrDataUrl: string;
    deepLink: string;
    secondsRemaining: number;
  };
}

export function ProjectorScreen({ initialData }: ProjectorScreenProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [data, setData] = useState(initialData);
  const [secondsLeft, setSecondsLeft] = useState(initialData.secondsRemaining);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [soundOn, setSoundOn] = useState(true);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const isRotatingRef = useRef(false);
  // Sahifa ochilganda ro'yxatda bor yozuvlar uchun ovoz chiqmaydi — faqat keyin qo'shilganlar uchun
  const knownIdsRef = useRef(new Set(initialData.records.map((r) => r._id)));

  const sessionId = data.session._id;
  const isClosed = data.session.status === "closed";

  // Polling data every 3 seconds to keep attendee list fresh
  const refreshData = useCallback(async () => {
    if (isClosed || isRotatingRef.current) return;
    try {
      const fresh = await getAttendanceSessionForProjector(sessionId);
      if (fresh) {
        setData(fresh);
        // Synchronize secondsLeft only if local drift is significant (> 5s)
        setSecondsLeft((prev) => {
          if (Math.abs(prev - fresh.secondsRemaining) > 5) {
            return fresh.secondsRemaining;
          }
          return prev;
        });
      }
    } catch (err) {
      console.error("Attendance polling error:", err);
    }
  }, [sessionId, isClosed]);

  const rotateCode = useCallback(async () => {
    if (isRotatingRef.current || isClosed) return;
    try {
      isRotatingRef.current = true;
      setIsRotating(true);
      const res = await rotateAttendanceSessionAction(sessionId);
      if (res.success && res.data) {
        setData((prev) => ({
          ...prev,
          session: {
            ...prev.session,
            currentCode: res.data!.currentCode,
            currentToken: res.data!.currentToken,
            codeRotatedAt: new Date(res.data!.codeRotatedAt).toISOString(),
          },
        }));
        setSecondsLeft(data.session.rotateIntervalSeconds || 180);
        // Refresh QR image and attendees
        const fresh = await getAttendanceSessionForProjector(sessionId);
        if (fresh) {
          setData(fresh);
        }
      }
    } catch {
      toast.error("Kodni yangilab bo'lmadi");
    } finally {
      isRotatingRef.current = false;
      setIsRotating(false);
    }
  }, [sessionId, isClosed, data.session.rotateIntervalSeconds, toast]);

  // Brauzer ovozni faqat foydalanuvchi harakatidan keyin chiqaradi — birinchi bosishda ochib qo'yamiz
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Kelganlar ro'yxatiga yangi o'quvchi qo'shilganda ovoz va qisqa ajratib ko'rsatish
  useEffect(() => {
    const added = data.records.filter((r) => !knownIdsRef.current.has(r._id)).map((r) => r._id);
    if (added.length === 0) return;
    added.forEach((id) => knownIdsRef.current.add(id));
    if (soundOn) playCheckInSound(added.length);
    setFreshIds((prev) => new Set([...prev, ...added]));
    const timer = setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        added.forEach((id) => next.delete(id));
        return next;
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [data.records, soundOn]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    if (next) {
      unlockSound();
      playCheckInSound(1);
    }
  };

  useEffect(() => {
    if (isClosed) return;
    const pollTimer = setInterval(refreshData, 3000);
    return () => clearInterval(pollTimer);
  }, [isClosed, refreshData]);

  // Local 1-second countdown tick (pure state update, zero side-effects inside updater)
  useEffect(() => {
    if (isClosed) return;

    const tick = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(tick);
  }, [isClosed]);

  // When timer hits 0, trigger rotation safely inside effect (after render is committed)
  useEffect(() => {
    if (isClosed) return;
    if (secondsLeft === 0 && !isRotatingRef.current) {
      rotateCode();
    }
  }, [secondsLeft, isClosed, rotateCode]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(data.session.currentCode);
    setCopiedCode(true);
    toast.success("Kod nusxalandi");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCloseSession = async () => {
    try {
      setIsClosing(true);
      const res = await closeAttendanceSessionAction(sessionId);
      if (res.success) {
        toast.success("Davomat sessiyasi yakunlandi");
        setShowCloseDialog(false);
        // Sahifa yakunlangan dars ko'rinishiga (to'liq ro'yxat) almashadi
        router.refresh();
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Sessiyani yakunlab bo'lmadi");
    } finally {
      setIsClosing(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const csv = await exportAttendanceCsvAction(sessionId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `davomat_${data.group?.name || "guruh"}_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV fayl yuklab olindi");
    } catch {
      toast.error("CSV eksportda xatolik yuz berdi");
    }
  };

  const presentCount = data.records.filter((r) => r.status === "present").length;
  const progressPercent = data.totalStudents > 0 ? Math.round((presentCount / data.totalStudents) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/mentor/attendance"
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            title="Orqaga"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                {data.group?.name} guruhi davomati
              </h1>
              <Badge variant={isClosed ? "default" : "teal"}>
                {isClosed ? "Yakunlangan" : "Jonli sessiya"}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {data.group?.grade}-sinf • Har bir kelgan o&apos;quvchiga +{data.session.defaultCoinsReward} coin
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="gap-2 min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>CSV Eksport</span>
          </Button>

          {!isClosed && (
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleSound}
              aria-pressed={soundOn}
              title={soundOn ? "Ovozni o'chirish" : "Ovozni yoqish"}
              className="gap-2 min-h-[44px]"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">{soundOn ? "Ovoz yoniq" : "Ovoz o'chiq"}</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={toggleFullscreen}
            className="gap-2 min-h-[44px]"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {isFullscreen ? "Kichraytirish" : "To'liq ekran"}
            </span>
          </Button>

          {!isClosed && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowCloseDialog(true)}
              className="gap-2 min-h-[44px]"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Sessiyani yakunlash</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Projector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Giant QR and Huge Code Display (8 columns) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          <div className="p-6 sm:p-10 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-md text-center flex flex-col items-center justify-center space-y-6">
            {isClosed ? (
              <div className="py-16 space-y-4 text-center">
                <CheckCircle2 className="w-16 h-16 text-teal-500 mx-auto" />
                <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  Ushbu davomat sessiyasi yakunlandi
                </h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Jami {presentCount} nafar o&apos;quvchi keldi. Natijalarni CSV formatida yuklab olishingiz mumkin.
                </p>
              </div>
            ) : (
              <>
                {/* Timer and instructions */}
                <div className="flex items-center justify-between w-full max-w-md px-2">
                  <div className="flex items-center gap-2">
                    <CountdownRing
                      progressPercent={Math.max(
                        0,
                        Math.min(
                          100,
                          (secondsLeft / (data.session.rotateIntervalSeconds || 180)) * 100
                        )
                      )}
                      size={54}
                    />
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {secondsLeft} soniya
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">avtomatik yangilanish</div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={rotateCode}
                    disabled={isRotating}
                    className="gap-1.5 text-xs text-slate-600 dark:text-slate-400 min-h-[44px]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? "animate-spin" : ""}`} />
                    <span>Kodni yangilash</span>
                  </Button>
                </div>

                {/* Giant QR Code */}
                {data.qrDataUrl && (
                  <div className="p-4 sm:p-6 rounded-3xl bg-white border-4 border-teal-500/30 shadow-xl max-w-sm w-full aspect-square flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={data.qrDataUrl}
                      alt="Davomat QR Kodi"
                      className="w-full h-full object-contain select-none"
                    />
                  </div>
                )}

                {/* 6-digit Huge Alphanumeric Code */}
                <div className="w-full max-w-md space-y-2">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Yoki 6 belgili kodni kiriting
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <div
                      onClick={handleCopyCode}
                      className="px-6 py-4 rounded-2xl bg-slate-100 dark:bg-bg border-2 border-teal-500/40 text-4xl sm:text-5xl font-black font-mono tracking-[0.25em] text-teal-700 dark:text-teal-300 select-all cursor-pointer shadow-inner hover:scale-[1.02] transition-transform"
                      title="Nusxalash uchun bosing"
                    >
                      {data.session.currentCode}
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyCode}
                      aria-label="Kodni nusxalash"
                      className="p-3 text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 bg-slate-100 dark:bg-slate-800 rounded-2xl min-h-[52px] min-w-[52px] flex items-center justify-center cursor-pointer transition-colors"
                    >
                      {copiedCode ? (
                        <Check className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>
                    O&apos;quvchilar telefonidan <strong>itxiva.uz/attendance</strong> sahifasida kodni kiritishlari mumkin
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Live Attendee Feed (4 columns) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
            {/* Header with stats */}
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <span>Kelganlar ro&apos;yxati</span>
                </h2>
                <span className="text-xs font-bold font-mono text-teal-600 dark:text-teal-400">
                  {presentCount} / {data.totalStudents} ({progressPercent}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-teal-500 to-blue-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                />
              </div>
            </div>

            {/* List of attendees */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[340px] overflow-y-auto pr-1 space-y-1">
              {data.records.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  Hali hech kim davomatdan o&apos;tmadi...
                </div>
              ) : (
                data.records.map((r) => (
                  <div
                    key={r._id}
                    className={`flex items-center justify-between py-2.5 px-2 rounded-xl transition-colors duration-700 animate-in fade-in ${
                      freshIds.has(r._id)
                        ? "bg-teal-50 dark:bg-teal-950/40"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <Avatar name={r.studentId.fullName} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {r.studentId.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          @{r.studentId.login}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <Badge variant={r.method === "qr" ? "teal" : "gold"}>
                        {r.method === "qr" ? "QR" : "Kod"}
                      </Badge>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {formatTimeUz(r.markedAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Kelmaganlar: hali davomatdan o'tmagan o'quvchilar */}
          <div className="p-5 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserX className="w-5 h-5 text-rose-500" />
                <span>Kelmaganlar ro&apos;yxati</span>
              </h2>
              <span className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
                {data.absentStudents.length}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[340px] overflow-y-auto pr-1">
              {data.absentStudents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  {data.totalStudents === 0
                    ? "Guruhda o'quvchi yo'q"
                    : "Hamma davomatdan o'tdi"}
                </div>
              ) : (
                data.absentStudents.map((st) => (
                  <div key={st._id} className="flex items-center gap-2.5 py-2.5 px-2 min-w-0">
                    <Avatar name={st.fullName} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                        {st.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">@{st.login}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Close Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        onConfirm={handleCloseSession}
        title="Davomat sessiyasini yakunlash"
        danger
        confirmText="Ha, yakunlash"
        isLoading={isClosing}
        description={
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p>
              Sessiyani yakunlamoqchimisiz? Kelmagan barcha o&apos;quvchilar avtomatik tarzda <strong>&quot;Kelmagan&quot; (0 coin)</strong> deb belgilanadi.
            </p>
          </div>
        }
      />
    </div>
  );
}
