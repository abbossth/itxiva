"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, RotateCcw, Send } from "lucide-react";
import { setAnnouncementStatusAction } from "@/actions/announcement.actions";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import type { AnnouncementPhase } from "@/lib/announcements";

const PHASE_BADGE: Record<AnnouncementPhase, { label: string; variant: "default" | "warning" | "teal" | "success" }> = {
  archived: { label: "Arxiv", variant: "default" },
  draft: { label: "Qoralama", variant: "warning" },
  scheduled: { label: "Rejalashtirilgan", variant: "teal" },
  ended: { label: "Muddati tugagan", variant: "default" },
  active: { label: "Faol", variant: "success" },
};

/** E'lon holati belgisi: qoralama, rejalashtirilgan, faol, muddati tugagan, arxiv */
export function AnnouncementStatusBadge({ phase }: { phase: AnnouncementPhase }) {
  const b = PHASE_BADGE[phase];
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

/** Nashr etish / arxivlash / qoralamaga qaytarish */
export function AnnouncementStatusButtons({ id, status }: { id: string; status: "draft" | "published" | "archived" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const set = async (next: "draft" | "published" | "archived") => {
    setBusy(next);
    try {
      const res = await setAnnouncementStatusAction(id, next);
      if (res.success) {
        toast.success(res.message || "Saqlandi");
        router.refresh();
      } else toast.error(res.message || "Xatolik yuz berdi");
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60";
  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== "published" && (
        <button type="button" disabled={busy !== null} onClick={() => void set("published")} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>
          {busy === "published" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Nashr etish
        </button>
      )}
      {status === "published" && (
        <button type="button" disabled={busy !== null} onClick={() => void set("archived")} className={`${btn} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`}>
          {busy === "archived" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          To&apos;xtatish
        </button>
      )}
      {status === "archived" && (
        <button type="button" disabled={busy !== null} onClick={() => void set("draft")} className={`${btn} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`}>
          {busy === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Qoralamaga
        </button>
      )}
    </div>
  );
}
