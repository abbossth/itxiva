"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { reportCheatAction } from "@/actions/anti-cheat.actions";
import type { CheatContext, CheatCounts, CheatKind } from "@/lib/anti-cheat/kinds";
import { cn } from "@/lib/utils";

// Anti-cheat qobig'i: test, imtihon va jonli o'yin paytida
// - matnni belgilash, nusxalash, qo'yish, o'ng tugma va sudrab olish yopiq;
// - Ctrl/Cmd+C/A/P/S/U, F12 va DevTools tugmalari ishlamaydi;
// - boshqa oyna/ilovaga o'tilsa, AI kengaytmasi oynasi ochilsa yoki screenshot tugmalari bosilsa — kontent darhol xiralashadi;
// - ekranda o'quvchi ismi bilan suv belgisi (screenshot tarqatilsa kimniki ekani ko'rinadi);
// - har bir urinish serverga yoziladi — mentor natijalarda ko'radi.
// Eslatma: brauzer telefon screenshotini yoki boshqa qurilmadan suratga olishni to'liq taqiqlay olmaydi — bular qiyinlashtiriladi va qayd etiladi.

type Props = {
  context: CheatContext;
  refId: string;
  /** Suv belgisi matni (o'quvchi ismi) */
  watermark?: string;
  enabled?: boolean;
  className?: string;
  children: ReactNode;
};

const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

const LEAVE_TEXT = "Sahifadan chiqildi — bu qayd etildi";

export function AntiCheatGuard({ context, refId, watermark, enabled = true, className, children }: Props) {
  const [hidden, setHidden] = useState<string | null>(null);
  const [warned, setWarned] = useState(0);
  const pending = useRef<CheatCounts>({});
  const lastLeave = useRef(0);
  // Fayl tanlash oynasi ochilganda (imtihondagi fayl yuklash) sahifa fokusni yo'qotadi — bu chiqish emas
  const fileDialog = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      const counts = pending.current;
      if (!Object.keys(counts).length) return;
      pending.current = {};
      void reportCheatAction({ context, refId, counts }).catch(() => {});
    };
    const note = (kind: CheatKind) => {
      pending.current[kind] = (pending.current[kind] ?? 0) + 1;
      setWarned((n) => n + 1);
    };
    const hideFor = (reason: string, ms?: number) => {
      setHidden(reason);
      clearTimeout(hideTimer);
      if (ms) hideTimer = setTimeout(() => setHidden(null), ms);
    };
    const leave = () => {
      if (fileDialog.current) return;
      // blur va visibilitychange ketma-ket keladi — bitta chiqish bir marta sanaladi
      const now = performance.now();
      if (now - lastLeave.current > 1500) note("leave");
      lastLeave.current = now;
      hideFor(LEAVE_TEXT);
      flush();
    };
    const back = () => {
      fileDialog.current = false;
      if (document.visibilityState === "visible" && document.hasFocus()) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setHidden(null), 250);
      }
    };
    // Screenshot: oldin clipboard'ni tozalaymiz, kontentni yashiramiz
    const screenshot = () => {
      note("screenshot");
      hideFor("Screenshot olish taqiqlangan", 2500);
      void navigator.clipboard?.writeText("ITXiva: screenshot taqiqlangan").catch(() => {});
      flush();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (k === "printscreen") {
        e.preventDefault();
        screenshot();
        return;
      }
      // macOS: Cmd+Shift (3/4/5/6) — tugmalar bosilishi bilan yashiramiz, rasmga xira holat tushadi
      if (e.metaKey && e.shiftKey) {
        if (["3", "4", "5", "6", "s"].includes(k)) screenshot();
        else hideFor("Screenshot olish taqiqlangan", 1500);
        return;
      }
      if (k === "f12" || (mod && e.shiftKey && ["i", "j", "c", "k"].includes(k)) || (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k))) {
        e.preventDefault();
        note("devtools");
        return;
      }
      if (!mod) return;
      if (k === "p") {
        e.preventDefault();
        note("print");
        return;
      }
      if (k === "v" && !e.shiftKey) return; // paste hodisasida ushlanadi
      if (editable(e.target) && ["a", "c", "x", "z", "y"].includes(k)) return; // o'z javobini tahrirlash
      if (["c", "x"].includes(k)) {
        e.preventDefault();
        note("copy");
      } else if (["a", "s", "u"].includes(k)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Windows'da PrintScreen faqat keyup beradi
      if (e.key.toLowerCase() === "printscreen") screenshot();
    };
    const onCopy = (e: ClipboardEvent) => {
      if (editable(e.target)) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", "");
      note("copy");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      note("paste");
    };
    const block = (e: Event) => {
      if (!editable(e.target)) e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("input[type=file]") || el?.closest("label")?.querySelector("input[type=file]")) fileDialog.current = true;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? leave() : back());
    const onBeforePrint = () => {
      note("print");
      hideFor("Chop etish taqiqlangan", 3000);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCopy, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("contextmenu", block, true);
    document.addEventListener("selectstart", block, true);
    document.addEventListener("dragstart", block, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("pagehide", flush);
    const timer = setInterval(flush, 5000);
    return () => {
      flush();
      clearInterval(timer);
      clearTimeout(hideTimer);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("contextmenu", block, true);
      document.removeEventListener("selectstart", block, true);
      document.removeEventListener("dragstart", block, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("pagehide", flush);
    };
  }, [enabled, context, refId]);

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <div className={cn("anti-cheat relative", className)}>
      {children}
      {watermark && <Watermark text={watermark} />}
      {hidden && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-6 text-center backdrop-blur-xl">
          <div className="max-w-sm rounded-3xl bg-slate-900 p-6 text-white shadow-2xl ring-1 ring-rose-400/40">
            <p className="text-4xl">🛡️</p>
            <p className="mt-2 text-lg font-black">{hidden}</p>
            <p className="mt-1 text-sm text-white/70">Test paytida boshqa oyna, AI yoki screenshot ishlatish mumkin emas. Har bir urinish mentorga ko&apos;rinadi.</p>
            {warned > 0 && <p className="mt-2 text-xs font-bold text-rose-300">Qayd etilgan urinishlar: {warned}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Suv belgisi: o'quvchi ismi va vaqt — butun ekran bo'ylab xira, qiya yozuv */
function Watermark({ text }: { text: string }) {
  const [stamp, setStamp] = useState("");
  useEffect(() => {
    const tick = () => setStamp(new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  const label = `${text} · ${stamp}`.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='140'><text x='10' y='80' transform='rotate(-22 130 70)' font-family='sans-serif' font-size='14' font-weight='700' fill='rgba(127,127,127,0.16)'>${label}</text></svg>`;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80]"
      style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundRepeat: "repeat" }}
    />
  );
}
