"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, ExternalLink, Loader2, Send, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  createTelegramLinkAction,
  getTelegramStatus,
  setNotificationPrefAction,
  unlinkTelegramAction,
  type TelegramStatus,
} from "@/actions/telegram.actions";
import { notificationsForRole } from "@/lib/notifications/types";
import { formatDateUz } from "@/lib/utils";

const POLL_INTERVAL_MS = 3000;

export function TelegramSection({ initial, role }: { initial: TelegramStatus; role: "mentor" | "student" }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(initial);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"link" | "unlink" | null>(null);
  const deadlineRef = useRef(0);

  // Havola ochilgandan keyin bot ulanishini kutamiz: holat har 3 soniyada so'raladi (token muddati tugaguncha)
  useEffect(() => {
    if (!linkUrl || status.linked) return;
    const timer = setInterval(async () => {
      if (Date.now() > deadlineRef.current) {
        setLinkUrl(null);
        return;
      }
      try {
        const fresh = await getTelegramStatus();
        if (fresh.linked) {
          setStatus(fresh);
          setLinkUrl(null);
          toast.success("Telegram ulandi!");
        }
      } catch {
        // tarmoq uzilsa keyingi urinishda qayta so'raladi
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [linkUrl, status.linked, toast]);

  const handleLink = async () => {
    try {
      setBusy("link");
      const res = await createTelegramLinkAction();
      if (res.success && res.data) {
        deadlineRef.current = Date.now() + res.data.expiresInSeconds * 1000;
        setLinkUrl(res.data.url);
        window.open(res.data.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(res.message || "Havola yaratib bo'lmadi");
      }
    } catch {
      toast.error("Havola yaratib bo'lmadi");
    } finally {
      setBusy(null);
    }
  };

  const handleUnlink = async () => {
    try {
      setBusy("unlink");
      const res = await unlinkTelegramAction();
      if (res.success) {
        setStatus((prev) => ({ ...prev, linked: false, username: null, linkedAt: null }));
        toast.success(res.message || "Telegram uzildi");
      } else {
        toast.error(res.message || "Uzib bo'lmadi");
      }
    } catch {
      toast.error("Uzib bo'lmadi");
    } finally {
      setBusy(null);
    }
  };

  const togglePref = async (type: string, enabled: boolean) => {
    // Optimistik: tugma darhol o'zgaradi, xato bo'lsa qaytariladi
    setStatus((prev) => ({ ...prev, prefs: { ...prev.prefs, [type]: enabled } }));
    try {
      const res = await setNotificationPrefAction({ type, enabled });
      if (!res.success) throw new Error(res.message);
    } catch {
      setStatus((prev) => ({ ...prev, prefs: { ...prev.prefs, [type]: !enabled } }));
      toast.error("Sozlamani saqlab bo'lmadi");
    }
  };

  return (
    <section
      aria-labelledby="telegram-heading"
      className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <h2 id="telegram-heading" className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Send className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Telegram bildirishnomalari
        </h2>
        <Badge variant={status.linked ? "success" : "secondary"}>{status.linked ? "Ulangan" : "Ulanmagan"}</Badge>
      </div>

      {!status.available ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Telegram bot hali sozlanmagan. Mentorga murojaat qiling.</p>
      ) : status.linked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {status.username ? <span className="font-mono font-semibold">@{status.username}</span> : "Telegram hisobingiz"} ulangan
              {status.linkedAt ? ` · ${formatDateUz(status.linkedAt)}` : ""}
            </span>
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={handleUnlink} isLoading={busy === "unlink"} className="gap-2 min-h-[44px]">
            <Unplug className="w-4 h-4" />
            Uzish
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Vazifa tekshirilganda, yangi dars chiqqanda yoki buyurtma holati o&apos;zgarganda xabar Telegram&apos;ga keladi.
          </p>
          {linkUrl ? (
            <div role="status" className="rounded-2xl border border-teal-500/40 bg-teal-50 dark:bg-teal-500/10 p-4 space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                Botda <span className="font-mono">START</span> tugmasini bosing — ulanishni kutyapmiz...
              </p>
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-400 hover:underline min-h-[36px]"
              >
                Bot ochilmadimi? Shu yerni bosing
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <p className="text-xs text-slate-600 dark:text-slate-400">Havola 10 daqiqa amal qiladi.</p>
            </div>
          ) : (
            <Button type="button" variant="primary" onClick={handleLink} isLoading={busy === "link"} className="gap-2 min-h-[44px] font-semibold">
              <Send className="w-4 h-4" />
              Telegram&apos;ni ulash
            </Button>
          )}
        </div>
      )}

      {status.available && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <BellRing className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Qaysi xabarlar kelsin
          </h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {notificationsForRole(role).map((option) => {
              const enabled = status.prefs[option.type] !== false;
              return (
                <li key={option.type} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span id={`pref-${option.type}`} className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {option.label}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{option.description}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-labelledby={`pref-${option.type}`}
                    onClick={() => togglePref(option.type, !enabled)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface ${
                      enabled ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${enabled ? "translate-x-5" : ""}`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {!status.linked && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Sozlamalar Telegram ulangandan keyin kuchga kiradi.</p>
          )}
        </div>
      )}
    </section>
  );
}
