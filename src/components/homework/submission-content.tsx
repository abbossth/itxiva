"use client";

import { useState } from "react";
import { Download, ExternalLink, FileArchive, FileImage, FileText, Loader2 } from "lucide-react";
import { getHomeworkFileUrlAction } from "@/actions/homework.actions";
import type { IHomeworkFile } from "@/lib/db/models/homework-submission.model";
import { formatFileSize } from "@/lib/homework-status";

interface SubmissionContentProps {
  submissionId: string;
  text: string;
  links: string[];
  files: IHomeworkFile[];
}

function fileIcon(file: IHomeworkFile) {
  if (file.mimeType?.startsWith("image/")) return FileImage;
  if (/zip|compressed|rar|7z/.test(file.mimeType ?? "") || /\.(zip|rar|7z)$/i.test(file.name)) return FileArchive;
  return FileText;
}

/** Yuborilgan javob: matn/kod, havolalar va fayllar (rasm — joyida ko'rinadi, qolgani yangi oynada ochiladi) */
export function SubmissionContent({ submissionId, text, links, files }: SubmissionContentProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openFile = async (file: IHomeworkFile) => {
    const isImage = Boolean(file.mimeType?.startsWith("image/"));
    if (isImage && previews[file.key]) {
      setPreviews((prev) => {
        const next = { ...prev };
        delete next[file.key];
        return next;
      });
      return;
    }
    try {
      setLoadingKey(file.key);
      setErrorMsg(null);
      const res = await getHomeworkFileUrlAction({ submissionId, key: file.key });
      if (!res.success || !res.downloadUrl) {
        setErrorMsg(res.message || "Faylni ochib bo'lmadi");
        return;
      }
      if (isImage) {
        setPreviews((prev) => ({ ...prev, [file.key]: res.downloadUrl! }));
      } else {
        window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setErrorMsg("Faylni ochib bo'lmadi");
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="space-y-3">
      {text.trim() && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4 text-xs sm:text-sm font-mono leading-relaxed text-slate-800 dark:text-slate-200">
          {text}
        </pre>
      )}

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((link) => (
            <li key={link}>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-2 max-w-full min-h-[36px] text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span className="truncate">{link}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {files.map((file) => {
            const Icon = fileIcon(file);
            const isLoading = loadingKey === file.key;
            return (
              <div key={file.key} className="space-y-2 min-w-0">
                <button
                  type="button"
                  onClick={() => openFile(file)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-teal-500/50 transition-colors text-left min-h-[52px] cursor-pointer disabled:opacity-60"
                >
                  <Icon className="w-5 h-5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {file.name}
                    </span>
                    <span className="block text-[11px] text-slate-400">{formatFileSize(file.size)}</span>
                  </span>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin text-teal-600" />
                  ) : (
                    <Download className="w-4 h-4 shrink-0 text-slate-400" />
                  )}
                </button>
                {previews[file.key] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[file.key]}
                    alt={file.name}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {errorMsg && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
