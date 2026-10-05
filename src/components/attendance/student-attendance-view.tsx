"use client";

import { useState } from "react";
import confetti from "canvas-confetti";
import {
  QrCode,
  CheckCircle2,
  Calendar,
  Sparkles,
  Camera,
  KeyRound,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CoinBadge } from "@/components/ui/coin-badge";
import { OTPInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { markAttendanceAction } from "@/actions/attendance.actions";
import { QRScannerModal } from "@/components/attendance/qr-scanner-modal";
import { formatDateUz } from "@/lib/utils";

interface AttendanceRecordItem {
  _id: string;
  sessionId?: {
    date: string;
    defaultCoinsReward: number;
  };
  groupId?: {
    name: string;
    grade: number;
  };
  status: "present" | "late" | "excused" | "absent";
  method: "qr" | "code" | "manual";
  markedAt: string;
  coinsAwarded: number;
  notes?: string;
}

interface StudentAttendanceViewProps {
  activeSession: {
    sessionId: string;
    groupName?: string;
    rotateIntervalSeconds: number;
    defaultCoinsReward: number;
    hasMarked: boolean;
  } | null;
  history: AttendanceRecordItem[];
}

export function StudentAttendanceView({
  activeSession,
  history,
}: StudentAttendanceViewProps) {
  const { toast } = useToast();

  const [code, setCode] = useState("");
  const [activeTab, setActiveTab] = useState<"code" | "qr">("code");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(activeSession?.hasMarked || false);
  const [successInfo, setSuccessInfo] = useState<{ coinsEarned: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Trigger celebration confetti
  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }
  };

  // Submit via 6-digit code
  const handleSubmitCode = async (submitCode?: string) => {
    const targetCode = (submitCode || code).trim();
    if (targetCode.length !== 6) {
      setErrorMsg("6 belgili kodni to'liq kiriting");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await markAttendanceAction({ code: targetCode });

      if (res.success) {
        setAlreadyMarked(true);
        const earned = res.data?.coinsEarned || activeSession?.defaultCoinsReward || 10;
        setSuccessInfo({ coinsEarned: earned });
        toast.success(res.message || "Davomat muvaffaqiyatli belgilandi!");
        triggerConfetti();
      } else {
        setErrorMsg(res.message || "Kodni tekshirib qaytadan kiriting");
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      setErrorMsg("Server bilan bog'lanishda xatolik yuz berdi");
      toast.error("Xatolik yuz berdi");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle scanned QR string (deep link /a/TOKEN, raw TOKEN, or 6-digit CODE)
  const handleScanSuccess = async (scannedText: string) => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      let token: string | undefined;
      let scannedCode: string | undefined;

      const trimmed = scannedText.trim();

      // If URL containing /a/[token]
      if (trimmed.includes("/a/")) {
        const parts = trimmed.split("/a/");
        token = parts[1].split("?")[0].split("/")[0].trim();
      } else if (trimmed.length === 6 && /^[a-zA-Z0-9]+$/.test(trimmed)) {
        scannedCode = trimmed.toUpperCase();
      } else {
        // Raw token
        token = trimmed;
      }

      const res = await markAttendanceAction({ token, code: scannedCode });

      if (res.success) {
        setAlreadyMarked(true);
        const earned = res.data?.coinsEarned || activeSession?.defaultCoinsReward || 10;
        setSuccessInfo({ coinsEarned: earned });
        toast.success(res.message || "QR Davomat muvaffaqiyatli belgilandi!");
        triggerConfetti();
      } else {
        setErrorMsg(res.message || "QR kod eskirgan yoki noto'g'ri");
        toast.error(res.message || "Davomatdan o'tib bo'lmadi");
      }
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
      toast.error("Xatolik yuz berdi");
    } finally {
      setIsSubmitting(false);
    }
  };

  const presentCount = history.filter((r) => r.status === "present").length;
  const totalCoinsEarned = history.reduce((acc, r) => acc + (r.coinsAwarded || 0), 0);
  const attendanceRate = history.length > 0 ? Math.round((presentCount / history.length) * 100) : 100;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in pb-12">
      {/* Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
          <QrCode className="w-7 h-7 text-teal-600 dark:text-teal-400" />
          Dars davomati
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Proyektorda ko&apos;rsatilgan kod yoki QR belgi orqali dars davomatidan o&apos;ting
        </p>
      </div>

      {/* Main Interactive Check-in Card (ALWAYS accessible) */}
      {!alreadyMarked && (
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-teal-500/10 via-white to-blue-500/10 dark:from-teal-950/40 dark:via-[#131E32] dark:to-blue-950/30 border-2 border-teal-500/40 shadow-lg space-y-6">
          {/* Top Session Status Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-teal-500/20">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500" />
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                {activeSession?.groupName
                  ? `${activeSession.groupName} darsi davomati ochilgan`
                  : "Dars davomatini belgilash"}
              </span>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge variant="teal" className="gap-1.5 py-1 px-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>+{activeSession?.defaultCoinsReward || 10} coin</span>
              </Badge>
            </div>
          </div>

          {/* Mode Selector Tabs (Code vs Camera) */}
          <div className="flex p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900/80 max-w-sm mx-auto border border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("code")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === "code"
                  ? "bg-white dark:bg-[#131E32] text-teal-700 dark:text-teal-300 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Kod kiritish</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("qr")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === "qr"
                  ? "bg-white dark:bg-[#131E32] text-teal-700 dark:text-teal-300 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>QR Skaner</span>
            </button>
          </div>

          {/* Error notice if any */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-xs sm:text-sm font-medium max-w-sm mx-auto text-center">
              {errorMsg}
            </div>
          )}

          {/* Tab 1: Enter 6-digit Code */}
          {activeTab === "code" && (
            <div className="space-y-5 text-center">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                  Proyektordagi 6 belgili kodni kiriting
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Kod proyektor ekranida har 3 daqiqada yangilanib turadi. Kodni kiritib tasdiqlang!
                </p>
              </div>

              {/* OTP Input for 6 characters */}
              <div className="flex justify-center py-2">
                <OTPInput
                  length={6}
                  value={code}
                  onChange={setCode}
                  onComplete={(val) => handleSubmitCode(val)}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              <div className="max-w-sm mx-auto pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => handleSubmitCode()}
                  disabled={code.length !== 6 || isSubmitting}
                  isLoading={isSubmitting}
                  className="w-full font-semibold shadow-md shadow-teal-500/20 min-h-[48px]"
                >
                  Davomatni tasdiqlash (+{activeSession?.defaultCoinsReward || 10} coin)
                </Button>
              </div>
            </div>
          )}

          {/* Tab 2: Camera QR Scanner */}
          {activeTab === "qr" && (
            <div className="space-y-5 text-center py-2">
              <div className="w-16 h-16 rounded-3xl bg-teal-500/20 text-teal-700 dark:text-teal-300 flex items-center justify-center mx-auto">
                <Camera className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                  Kamera orqali QR kodni skanerlash
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Telefon yoki noutbuk kamerangizni proyektor ekranidagi ulkan QR kodga qarating.
                </p>
              </div>

              <div className="max-w-sm mx-auto space-y-3 pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setIsScannerOpen(true)}
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                  className="w-full font-semibold shadow-md shadow-teal-500/20 min-h-[48px] gap-2"
                >
                  <Camera className="w-5 h-5" />
                  <span>Kamerani ochish va skanerlash</span>
                </Button>

                <p className="text-[11px] text-slate-400">
                  Kamera yoqilmagan taqdirda QR kod rasmini yuklab ham davomatdan o&apos;tish mumkin.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Already Checked In Celebration Card */}
      {alreadyMarked && (
        <div className="p-6 sm:p-8 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                Bugungi dars davomatidan o&apos;tgansiz!
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Siz darsda faol ishtirok etyapsiz. Tangalar hisobingizga muvaffaqiyatli qo&apos;shildi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
            {successInfo ? (
              <CoinBadge amount={successInfo.coinsEarned} size="md" animate={true} />
            ) : (
              <Badge variant="success" className="gap-1.5 py-1 px-3">
                <CheckCircle2 className="w-4 h-4" />
                <span>Davomat tasdiqlangan</span>
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlreadyMarked(false)}
              className="text-xs gap-1.5 text-slate-500 hover:text-slate-800"
              title="Qayta kod kiritish"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Qayta urinish</span>
            </Button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {attendanceRate}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Umumiy davomat darajasi
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {presentCount} ta
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Ishtirok etilgan darslar
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <div className="text-2xl font-black text-amber-500">
            +{totalCoinsEarned}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Davomatdan yig&apos;ilgan coinlar
          </div>
        </div>
      </div>

      {/* Attendance History Table */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <span>Mening davomat tarixim</span>
        </h2>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32]">
          {history.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <Clock className="w-8 h-8 text-slate-300 dark:text-slate-700" />
              <span>Hali davomat yozuvlari mavjud emas</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {history.map((record) => {
                const statusBadge = {
                  present: <Badge variant="success">Kelgan</Badge>,
                  late: <Badge variant="warning">Kechikkan</Badge>,
                  excused: <Badge variant="teal">Sababli</Badge>,
                  absent: <Badge variant="danger">Kelmagan</Badge>,
                }[record.status];

                return (
                  <div
                    key={record._id}
                    className="p-4 flex items-center justify-between gap-3 text-xs sm:text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {record.sessionId?.date ? formatDateUz(record.sessionId.date) : "Dars"}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {record.method === "qr"
                            ? "QR Kod orqali"
                            : record.method === "code"
                            ? "6 belgili kod orqali"
                            : "Mentor tomonidan"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {statusBadge}
                      {record.coinsAwarded > 0 && (
                        <CoinBadge amount={record.coinsAwarded} size="sm" animate={false} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Live QR Camera Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
