"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tarmoq xatosida (so'rov umuman yetib bormasa) amalni qayta yuborish. Server javob bergan bo'lsa
 * ({ success: false } ham) — qayta urinilmaydi. Faqat takrorlanganda zarar qilmaydigan amallar uchun.
 */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

// Jonli o'yin holatini so'rab turish (sekin internetga chidamli):
// - keyingi so'rov oldingisi tugagandan keyingina ketadi (navbat to'planmaydi);
// - har so'rov tartib raqamiga ega: kechikib kelgan eski javob yangisini bosib ketmaydi;
// - 6 soniyada javob kelmasa — bekor qilinadi, xatolarda oraliq asta uzayadi (server/tarmoqni bo'g'maydi);
// - tab yashirin bo'lsa so'ramaydi, qaytib ochilganda darhol yangilaydi.

type Res<T> = { success: true; data: T } | { success: false; error: string };

const TIMEOUT_MS = 6000;

export function useLivePoll<T>(url: string, intervalMs: number, active: boolean, onData: (data: T) => void) {
  const seq = useRef(0);
  const applied = useRef(0);
  // Ketma-ket 2+ so'rov o'tmasa — "internet sust" belgisi
  const [weak, setWeak] = useState(false);
  const onDataRef = useRef(onData);
  useEffect(() => {
    onDataRef.current = onData;
  });

  /** Bir marta so'rash (amaldan keyin darhol yangilash uchun ham) */
  const fetchOnce = useCallback(async (): Promise<boolean> => {
    const my = ++seq.current;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: { accept: "application/json" } });
      // Sessiya tugagan — sahifa yangilanadi (server login sahifasiga yo'naltiradi)
      if (r.status === 401) {
        window.location.reload();
        return false;
      }
      if (!r.ok) return false;
      const j = (await r.json()) as Res<T>;
      if (!j.success) return false;
      if (my > applied.current) {
        applied.current = my;
        onDataRef.current(j.data);
      }
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }, [url]);

  /** Hozir yo'lda bo'lgan so'rovlarning javobini e'tiborsiz qoldirish (masalan, javob yuborilganda) */
  const discardPending = useCallback(() => {
    applied.current = seq.current;
  }, []);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let inFlight = false;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(loop, ms);
    };
    async function loop() {
      if (stopped || inFlight) return;
      if (document.visibilityState !== "visible") return schedule(intervalMs);
      inFlight = true;
      const ok = await fetchOnce();
      inFlight = false;
      fails = ok ? 0 : Math.min(fails + 1, 4);
      if (!stopped) setWeak(fails >= 2);
      schedule(intervalMs * (1 + fails));
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && !inFlight) schedule(0);
    };
    schedule(intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [active, intervalMs, fetchOnce]);

  return { refresh: fetchOnce, discardPending, weak };
}
