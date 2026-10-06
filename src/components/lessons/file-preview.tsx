"use client";

import { useState } from "react";
import { FileText, FileArchive, FileImage, ExternalLink, Download, Loader2 } from "lucide-react";
import { IMaterial } from "@/lib/db/models/lesson.model";
import { getMaterialDownloadUrlAction } from "@/actions/lesson.actions";
import { cn } from "@/lib/utils";

interface FilePreviewProps {
  lessonId: string;
  materials: IMaterial[];
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(type: string, mimeType?: string) {
  if (type === "link") return ExternalLink;
  if (mimeType?.includes("image")) return FileImage;
  if (mimeType?.includes("zip") || mimeType?.includes("compressed")) return FileArchive;
  return FileText;
}

export function FilePreview({ lessonId, materials }: FilePreviewProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nonVideoMaterials = materials.filter((m) => m.type !== "youtube");

  if (nonVideoMaterials.length === 0) {
    return null;
  }

  const handleDownload = async (material: IMaterial) => {
    if (material.type === "link") {
      window.open(material.urlOrKey, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      setLoadingKey(material.urlOrKey);
      setErrorMsg(null);
      const res = await getMaterialDownloadUrlAction({
        lessonId,
        materialKey: material.urlOrKey,
      });

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
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
        Materiallar va fayllar ({nonVideoMaterials.length})
      </h3>

      {errorMsg && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {nonVideoMaterials.map((mat, idx) => {
          const Icon = getFileIcon(mat.type, mat.mimeType);
          const isLoading = loadingKey === mat.urlOrKey;

          return (
            <div
              key={mat._id?.toString() || idx}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800",
                "bg-slate-50/70 dark:bg-slate-900/50 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
              )}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {mat.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {mat.type === "link" ? "Tashqi havola" : formatBytes(mat.fileSize) || "Fayl"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDownload(mat)}
                disabled={isLoading}
                className={cn(
                  "p-2 min-h-[44px] min-w-[44px] rounded-lg text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400",
                  "hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                )}
                aria-label={`${mat.title} yuklab olish`}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                ) : mat.type === "link" ? (
                  <ExternalLink className="w-5 h-5" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
