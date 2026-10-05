"use client";

import { useState } from "react";
import confetti from "canvas-confetti";
import {
  QrCode,
  CheckCircle2,
  Calendar,
  Sparkles,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CoinBadge } from "@/components/ui/coin-badge";
import { OTPInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { markAttendanceAction } from "@/actions/attendance.actions";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(activeSession?.hasMarked || false);
  const [successInfo, setSuccessInfo] = useState<{ coinsEarned: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        setSuccessInfo({ coinsEarned: res.data?.coinsEarned || 10 });
        toast.success("Davomat muvaffaqiyatli belgilandi!");

        try {
          confetti({
            particleCount: 90,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch {
          // ignore
        }
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

      {/* Active Session Checkin Card */}
      {activeSession && !alreadyMarked && (
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-teal-500/10 via-white to-blue-500/10 dark:from-teal-950/40 dark:via-[#131E32] dark:to-blue-950/30 border-2 border-teal-500/40 shadow-lg text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/20 text-teal-700 dark:text-teal-300 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7 animate-pulse" />
          </div>

          <div className="space-y-1">
            <Badge variant="teal">Dars davomati ochildi</Badge>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
              Proyektordagi 6 belgili kodni kiriting
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Kod har 3 daqiqada yangilanadi. Davomatni tasdiqlab, +{activeSession.defaultCoinsReward} coin yutib oling!
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-xs sm:text-sm font-medium max-w-sm mx-auto">
              {errorMsg}
            </div>
          )}

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

          <Button
            variant="primary"
            size="lg"
            onClick={() => handleSubmitCode()}
            disabled={code.length !== 6 || isSubmitting}
            isLoading={isSubmitting}
            className="w-full max-w-sm mx-auto font-semibold shadow-md shadow-teal-500/20 min-h-[48px]"
          >
            Davomatni tasdiqlash (+{activeSession.defaultCoinsReward} coin)
          </Button>
        </div>
      )}

      {/* Already Checked In State */}
      {alreadyMarked && (
        <div className="p-6 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Bugungi dars davomatidan o&apos;tgansiz!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Siz darsda faol ishtirok etyapsiz. Tangalar hisobingizga qo&apos;shildi.
              </p>
            </div>
          </div>

          {successInfo && (
            <div className="shrink-0">
              <CoinBadge amount={successInfo.coinsEarned} size="md" animate={true} />
            </div>
          )}
        </div>
      )}

      {/* No active session notice */}
      {!activeSession && !alreadyMarked && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs text-center space-y-2">
          <Clock className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
            Ayni damda faol davomat yo&apos;q
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Dars boshlanganda mentor davomat ochadi va proyektorda kod paydo bo&apos;ladi.
          </p>
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
            <div className="p-8 text-center text-xs text-slate-400">
              Hali davomat yozuvlari mavjud emas
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
                          {record.method === "qr" ? "QR Kod orqali" : record.method === "code" ? "6 belgili kod orqali" : "Mentor tomonidan"}
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
    </div>
  );
}
