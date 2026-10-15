"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Lock, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordExamViolationAction } from "@/actions/exam.actions";
import type { IExamAnswer } from "@/lib/db/models/exam-submission.model";
import { MAX_EXAM_VIOLATIONS } from "@/lib/exam-proctoring";

type ViolationKind = "fullscreen_exit" | "tab_hidden";

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

// Bitta harakat (masalan, boshqa tabga o'tish) ikkala hodisani ham chiqaradi — ular bitta ogohlantirish sanaladi
const SAME_ACTION_MS = 2000;

/**
 * Imtihon nazorati: to'liq ekrandan chiqish va boshqa oynaga o'tishni serverga yozadi.
 * Ogohlantirishlar sonini server sanaydi; chegaraga yetganda urinish serverda yopiladi.
 * iPhone kabi to'liq ekranni qo'llamaydigan qurilmalarda faqat boshqa ilova yoki tabga o'tish sanaladi.
 */
export function useExamProctoring({
  examId,
  initialViolations,
  getAnswers,
  isSubmittingRef,
  onLocked,
}: {
  examId: string;
  initialViolations: number;
  getAnswers: () => IExamAnswer[];
  isSubmittingRef: React.RefObject<boolean>;
  onLocked: () => void;
}) {
  const fullscreenSupported = useSyncExternalStore(
    () => () => {},
    () => document.fullscreenEnabled,
    () => false
  );
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => Boolean(document.fullscreenElement),
    () => true
  );
  const [violations, setViolations] = useState(initialViolations);
  const [warning, setWarning] = useState<ViolationKind | null>(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lastAt = useRef(0);

  const report = useCallback(
    async (kind: ViolationKind) => {
      if (isSubmittingRef.current || lockedRef.current) return;
      const now = Date.now();
      if (now - lastAt.current < SAME_ACTION_MS) return;
      lastAt.current = now;
      setWarning(kind);
      try {
        const res = await recordExamViolationAction({ examId, answers: getAnswers(), kind });
        if (!res.success || !res.data) return;
        setViolations(res.data.violations);
        if (res.data.locked) {
          lockedRef.current = true;
          setLocked(true);
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          onLocked();
        }
      } catch {
        // Tarmoq xatosi: ogohlantirish ko'rsatiladi, keyingi hodisada qayta yuboriladi
      }
    },
    [examId, getAnswers, isSubmittingRef, onLocked]
  );

  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement) void report("fullscreen_exit");
    };
    const onVisibility = () => {
      if (document.hidden) void report("tab_hidden");
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [report]);

  const resume = useCallback(() => {
    if (fullscreenSupported && !document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setWarning(null))
        .catch(() => {});
    } else {
      setWarning(null);
    }
  }, [fullscreenSupported]);

  /** Savollar yopiladi: to'liq ekranda emas yoki ogohlantirish ko'rsatilmoqda */
  const blocked = locked || Boolean(warning) || (fullscreenSupported && !isFullscreen);
  return { violations, warning, locked, blocked, fullscreenSupported, resume };
}

export function ProctorOverlay({
  violations,
  warning,
  locked,
  fullscreenSupported,
  onResume,
}: {
  violations: number;
  warning: ViolationKind | null;
  locked: boolean;
  fullscreenSupported: boolean;
  onResume: () => void;
}) {
  const left = Math.max(0, MAX_EXAM_VIOLATIONS - violations);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="proctor-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface p-6 text-center space-y-4 shadow-xl">
        {locked ? (
          <>
            <div className="inline-flex p-4 rounded-3xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Lock className="w-8 h-8" />
            </div>
            <h2 id="proctor-title" className="text-xl font-black text-slate-900 dark:text-slate-100">
              Imtihon yopildi
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Siz {MAX_EXAM_VIOLATIONS} marta imtihon oynasidan chiqdingiz. Imtihon yopildi va 0 ball qo&apos;yildi. Qayta
              topshirish uchun mentoringizga murojaat qiling.
            </p>
          </>
        ) : warning ? (
          <>
            <div className="inline-flex p-4 rounded-3xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 id="proctor-title" className="text-xl font-black text-rose-600 dark:text-rose-400">
              Ogohlantirish {Math.min(violations, MAX_EXAM_VIOLATIONS)}/{MAX_EXAM_VIOLATIONS}
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {warning === "fullscreen_exit"
                ? "Siz to'liq ekran rejimidan chiqdingiz."
                : "Siz imtihon oynasini tark etdingiz (boshqa tab, oyna yoki ilovaga o'tdingiz)."}
            </p>
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {left > 0
                ? `Yana ${left} marta chiqsangiz, imtihon avtomatik yopiladi va 0 ball qo'yiladi.`
                : "Imtihon yopilmoqda…"}
            </p>
          </>
        ) : (
          <>
            <div className="inline-flex p-4 rounded-3xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Maximize className="w-8 h-8" />
            </div>
            <h2 id="proctor-title" className="text-xl font-black text-slate-900 dark:text-slate-100">
              To&apos;liq ekran rejimi
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Imtihon faqat to&apos;liq ekranda davom etadi. Chiqib ketish ogohlantirish hisoblanadi:{" "}
              {MAX_EXAM_VIOLATIONS} ta ogohlantirishdan keyin imtihon yopiladi va 0 ball qo&apos;yiladi.
            </p>
          </>
        )}

        {!locked && (
          <Button type="button" variant="primary" size="lg" onClick={onResume} className="w-full gap-2 rounded-2xl">
            <Maximize className="w-5 h-5" />
            {fullscreenSupported ? "To'liq ekranga qaytish" : "Imtihonga qaytish"}
          </Button>
        )}
      </div>
    </div>
  );
}

// Ctrl/Cmd bilan bosiladigan, imtihonda yopilgan tugmalar: nusxa, qo'yish, kesish, hammasini belgilash, chop etish, saqlash, manba
const BLOCKED_SHORTCUT_KEYS = new Set(["c", "x", "v", "a", "p", "s", "u"]);
// Dasturchi vositalari: F12, Ctrl+Shift+I/J/C, Cmd+Alt+I/J/C
const DEVTOOLS_KEYS = new Set(["i", "j", "c"]);

/**
 * Imtihon matnini himoyalash. Brauzer tizim skrinshotini va kengaytmalarni to'liq taqiqlay olmaydi, shuning uchun:
 * - nusxa olish, qo'yish, belgilash, sudrash, kontekst menyu, chop etish yopiladi;
 * - skrinshot tugmalari (Cmd+Shift, Win+Shift, PrintScreen) bosilganda savollar darhol yashiriladi;
 * - oyna fokusni yo'qotsa (skrinshot dasturi, AI yon paneli, boshqa oyna), savollar sahifadan olib tashlanadi —
 *   kengaytma yoki AI sahifani o'qisa, savollarni topa olmaydi.
 */
export function useExamShield({ onBlocked }: { onBlocked: (message: string) => void }) {
  const [unfocused, setUnfocused] = useState(false);
  const [screenshotKeys, setScreenshotKeys] = useState(false);
  // Fayl tanlash oynasi ochilganda ham fokus yo'qoladi — bu holda savollar yashirilmaydi
  const pickingFile = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const block = (message: string) => (e: Event) => {
      e.preventDefault();
      onBlocked(message);
    };
    const onCopy = block("Imtihonda nusxa olish o'chirilgan");
    const onPaste = block("Imtihonda matn qo'yish o'chirilgan — javobni o'zingiz yozing");
    const onContext = (e: Event) => e.preventDefault();
    const onDrag = (e: Event) => e.preventDefault();

    const shieldFor = (ms: number) => {
      setScreenshotKeys(true);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = setTimeout(() => setScreenshotKeys(false), ms);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // macOS: Cmd+Shift+3/4/5; Windows: Win+Shift+S — tizim ushlashidan oldin Cmd/Win+Shift bosilgani ko'rinadi
      if (e.metaKey && e.shiftKey) shieldFor(3000);
      if (key === "printscreen") {
        shieldFor(3000);
        e.preventDefault();
      }
      const mod = e.ctrlKey || e.metaKey;
      if (key === "f12" || (mod && (e.shiftKey || e.altKey) && DEVTOOLS_KEYS.has(key))) {
        e.preventDefault();
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && BLOCKED_SHORTCUT_KEYS.has(key)) {
        e.preventDefault();
        onBlocked(key === "v" ? "Imtihonda matn qo'yish o'chirilgan — javobni o'zingiz yozing" : "Bu amal imtihon vaqtida o'chirilgan");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "printscreen") {
        shieldFor(3000);
        // Windows'da PrintScreen rasmni buferga yozadi — uni bo'sh matn bilan almashtiramiz
        navigator.clipboard?.writeText("").catch(() => {});
      }
    };

    const onBlur = () => {
      if (!pickingFile.current) setUnfocused(true);
    };
    const onFocus = () => {
      pickingFile.current = false;
      setUnfocused(false);
    };

    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("dragstart", onDrag);
    document.addEventListener("drop", onDrag);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("dragstart", onDrag);
      document.removeEventListener("drop", onDrag);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    };
  }, [onBlocked]);

  /** Fayl tanlash oynasi ochilishidan oldin chaqiriladi */
  const allowFilePicker = useCallback(() => {
    pickingFile.current = true;
  }, []);

  return { hidden: unfocused || screenshotKeys, allowFilePicker };
}

/** Savollar ustidagi xira yozuv: rasmga olingan savol kimniki ekani ko'rinib turadi */
export function ExamWatermark({ text }: { text: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none">
      <div className="absolute -inset-1/2 flex flex-wrap content-start gap-x-24 gap-y-20 -rotate-[24deg] opacity-[0.05] dark:opacity-[0.035]">
        {Array.from({ length: 120 }, (_, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-bold text-slate-900 dark:text-white">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Oyna faol bo'lmaganda savollar o'rnida ko'rinadi */
export function ExamShieldNotice() {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-10 text-center space-y-2">
      <div className="inline-flex p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        <Lock className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Savollar yashirildi</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Imtihon oynasi faol emas. Davom etish uchun sahifaga bosing.
      </p>
    </div>
  );
}
