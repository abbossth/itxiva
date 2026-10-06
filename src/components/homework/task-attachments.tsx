"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { getMaterialDownloadUrlAction } from "@/actions/lesson.actions";
import type { IMaterial } from "@/lib/db/models/lesson.model";
import { formatFileSize } from "@/lib/homework-status";

/** Mentor vazifaga biriktirgan fayllar */
export function TaskAttachments({ lessonId, attachments }: { lessonId: string; attachments: IMaterial[] }) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const open = async (material: IMaterial) => {
    try {
      setLoadingKey(material.urlOrKey);
      setErrorMsg(null);
      const res = await getMaterialDownloadUrlAction({ lessonId, materialKey: material.urlOrKey });
      if (res.success && res.downloadUrl) {
        window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        setErrorMsg(res.message || "Faylni yuklab olishda xatolik yuz berdi");
      }
    } catch {
      setErrorMsg("Faylni yuklab olishda xatolik yuz berdi");
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {attachments.map((m) => (
          <button
            key={m.urlOrKey}
            type="button"
            onClick={() => open(m)}
            disabled={loadingKey === m.urlOrKey}
            className="inline-flex items-center gap-2 max-w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-teal-500/50 text-xs font-semibold text-slate-700 dark:text-slate-200 min-h-[40px] cursor-pointer transition-colors disabled:opacity-60"
          >
            <FileText className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <span className="truncate">{m.title}</span>
            {m.fileSize ? <span className="text-slate-500 dark:text-slate-400 font-normal shrink-0">{formatFileSize(m.fileSize)}</span> : null}
            {loadingKey === m.urlOrKey ? (
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            )}
          </button>
        ))}
      </div>
      {errorMsg && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
