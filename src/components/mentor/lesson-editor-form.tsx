"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  Link as LinkIcon,
  Trash2,
  Loader2,
  AlertCircle,
  FileText,
  HelpCircle,
} from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { ILessonData, IMaterial } from "@/lib/db/models/lesson.model";
import { IQuizData } from "@/lib/db/models/quiz.model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { createLessonAction, updateLessonAction } from "@/actions/lesson.actions";
import { QuizEditorModal } from "@/components/mentor/quiz-editor-modal";

interface LessonEditorFormProps {
  groups: IGroupData[];
  initialLesson?: ILessonData | null;
  initialQuiz?: IQuizData | null;
  defaultGroupId?: string;
  defaultQuarter?: number;
}

/**
 * Extract YouTube ID from link
 */
function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

/**
 * Compress image to WebP with max 1600px dimension using Canvas (in-browser)
 */
async function compressImageToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;
      const maxDim = 1600;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        "image/webp",
        0.85
      );
    };

    reader.readAsDataURL(file);
  });
}

export function LessonEditorForm({
  groups,
  initialLesson,
  initialQuiz,
  defaultGroupId,
  defaultQuarter = 1,
}: LessonEditorFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [groupId, setGroupId] = useState(
    initialLesson?.groupId?.toString() || defaultGroupId || groups[0]?._id?.toString() || ""
  );
  const [quarter, setQuarter] = useState<number>(initialLesson?.quarter || defaultQuarter);
  const [order, setOrder] = useState<number>(initialLesson?.order || 1);
  const [title, setTitle] = useState(initialLesson?.title || "");
  const [topic, setTopic] = useState(initialLesson?.topic || "");
  const [description, setDescription] = useState(initialLesson?.description || "");
  const [date, setDate] = useState(
    initialLesson?.date ? new Date(initialLesson.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [isPublished, setIsPublished] = useState(initialLesson?.isPublished ?? false);
  const [materials, setMaterials] = useState<IMaterial[]>(initialLesson?.materials || []);
  const [showQuizModal, setShowQuizModal] = useState(false);

  // Material builder states
  const [materialType, setMaterialType] = useState<"file" | "youtube" | "link">("youtube");
  const [matTitle, setMatTitle] = useState("");
  const [matUrl, setMatUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Form submitting state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const youtubeId = materialType === "youtube" ? extractYouTubeId(matUrl) : null;

  // Handle R2 File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(true);
      setUploadProgress("Fayl tayyorlanmoqda...");
      setErrorMsg(null);

      let fileToUpload: Blob | File = file;
      let contentType = file.type || "application/octet-stream";

      // If image, compress to WebP
      if (file.type.startsWith("image/")) {
        setUploadProgress("Rasm siqilmoqda (WebP)...");
        fileToUpload = await compressImageToWebP(file);
        contentType = "image/webp";
      }

      setUploadProgress("Yuklash uchun serverdan ruxsat olinmoqda...");
      const presignedRes = await fetch("/api/upload/presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename:
            contentType === "image/webp" ? file.name.replace(/\.[^/.]+$/, "") + ".webp" : file.name,
          contentType,
          fileSize: fileToUpload.size,
        }),
      });

      if (!presignedRes.ok) {
        const data = await presignedRes.json();
        throw new Error(data.error || "Fayl yuklash uchun ruxsat olinmadi");
      }

      const { uploadUrl, key } = await presignedRes.json();

      setUploadProgress("Fayl omborga yuklanmoqda...");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: fileToUpload,
      });

      if (!uploadRes.ok) {
        throw new Error("Faylni saqlashda xatolik yuz berdi");
      }

      // Add to materials list
      const newMaterial: IMaterial = {
        type: "file",
        title: matTitle.trim() || file.name,
        urlOrKey: key,
        mimeType: contentType,
        fileSize: fileToUpload.size,
        createdAt: new Date(),
      };

      setMaterials([...materials, newMaterial]);
      setMatTitle("");
      setUploadProgress(null);
      toast.success("Fayl muvaffaqiyatli yuklandi");
      e.target.value = "";
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Fayl yuklashda xatolik yuz berdi";
      setErrorMsg(msg);
      toast.error(msg);
      setUploadProgress(null);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleAddLinkOrVideo = () => {
    if (!matUrl.trim()) return;
    const newMaterial: IMaterial = {
      type: materialType,
      title: matTitle.trim() || (materialType === "youtube" ? "Dars videosi" : "Material havolasi"),
      urlOrKey: matUrl.trim(),
      createdAt: new Date(),
    };
    setMaterials([...materials, newMaterial]);
    setMatTitle("");
    setMatUrl("");
    toast.success("Material qo'shildi");
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Dars sarlavhasini kiriting");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);

      const payload = {
        groupId,
        quarter,
        order,
        title,
        topic,
        description,
        date,
        isPublished,
        materials,
      };

      let res;
      if (initialLesson) {
        res = await updateLessonAction(initialLesson._id.toString(), payload);
      } else {
        res = await createLessonAction(payload);
      }

      if (res.success) {
        toast.success(initialLesson ? "Dars muvaffaqiyatli yangilandi" : "Yangi dars yaratildi");
        router.push("/mentor/lessons");
        router.refresh();
      } else {
        setErrorMsg(res.message || "Xatolik yuz berdi");
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      setErrorMsg("Kutilmagan xatolik yuz berdi");
      toast.error("Kutilmagan xatolik yuz berdi");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center gap-2.5 text-sm"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Lesson Info Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
          {initialLesson ? "Darsni tahrirlash" : "Yangi dars ma'lumotlari"}
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="lesson-group" label="O'quv guruhi" required>
            <select
              id="lesson-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm min-h-[44px] text-slate-900 dark:text-slate-100"
              required
            >
              {groups.map((g) => (
                <option key={g._id.toString()} value={g._id.toString()}>
                  {g.name} ({g.grade}-sinf)
                </option>
              ))}
            </select>
          </Field>

          <Field id="lesson-quarter" label="Chorak" required>
            <select
              id="lesson-quarter"
              value={quarter}
              onChange={(e) => setQuarter(parseInt(e.target.value, 10))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm min-h-[44px] text-slate-900 dark:text-slate-100"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  {q}-chorak
                </option>
              ))}
            </select>
          </Field>

          <Field id="lesson-order" label="Tartib raqami (dars #)" required>
            <Input
              id="lesson-order"
              type="number"
              min={1}
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value, 10))}
              required
            />
          </Field>
        </div>

        <Field id="lesson-title" label="Dars mavzusi / Sarlavhasi" required hint="Darsning to'liq rasmiy nomi">
          <Input
            id="lesson-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="masalan: 1-dars. Python asoslari va o'zgaruvchilar"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="lesson-topic" label="Mavzu qisqacha (podzagolovok)" hint="Asosiy teglari yoki kalit so'zlar">
            <Input
              id="lesson-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="masalan: Data types, variables, input/output"
            />
          </Field>

          <Field id="lesson-date" label="Dars o'tiladigan sana">
            <Input
              id="lesson-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <Field id="lesson-description" label="Dars konspekti / Tavsifi" hint="Dars mazmuni, uy vazifasi va ko'rsatmalar">
          <textarea
            id="lesson-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dars konspekti, asosiy mavzular va o'quvchiga yo'riqnoma..."
            rows={5}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
          />
        </Field>

        {/* Publish checkbox */}
        <div className="pt-2">
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              id="is-published"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-5 h-5 rounded-md accent-teal-600 cursor-pointer"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Darsni darhol o&apos;quvchilarga nashr etish (ko&apos;rsatish)
            </span>
          </label>
        </div>
      </div>

      {/* Materials Builder Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
          Dars materiallari ({materials.length})
        </h2>

        {/* List of currently added materials */}
        {materials.length > 0 && (
          <div className="space-y-2 mb-4">
            {materials.map((m, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50"
              >
                <div className="flex items-center gap-3 truncate pr-2">
                  {m.type === "youtube" ? (
                    <Video className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : m.type === "link" ? (
                    <LinkIcon className="w-4 h-4 text-blue-500 shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-teal-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {m.title}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">({m.type})</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveMaterial(idx)}
                  className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={`${m.title} materialini o'chirish`}
                  title="O'chirish"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add material interface */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["youtube", "file", "link"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMaterialType(type)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[40px] ${
                  materialType === type
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {type === "youtube" && "YouTube video"}
                {type === "file" && "Material faylini yuklash (PDF, ZIP, rasm — 20 MB gacha)"}
                {type === "link" && "Tashqi havola"}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="mat-title" label="Material sarlavhasi (ixtiyoriy)">
              <Input
                id="mat-title"
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="masalan: Dars taqdimoti (PDF)"
              />
            </Field>

            {materialType === "file" ? (
              <Field id="file-upload" label="Faylni tanlang">
                <input
                  id="file-upload"
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  accept=".pdf,.docx,.pptx,.xlsx,.zip,image/*"
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-950/40 dark:file:text-teal-300 hover:file:bg-teal-100 cursor-pointer min-h-[44px] flex items-center"
                />
              </Field>
            ) : (
              <Field
                id="mat-url"
                label={materialType === "youtube" ? "YouTube video havolasi" : "Tashqi veb havola"}
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="mat-url"
                    value={matUrl}
                    onChange={(e) => setMatUrl(e.target.value)}
                    placeholder={
                      materialType === "youtube"
                        ? "https://www.youtube.com/watch?v=..."
                        : "https://example.com/..."
                    }
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddLinkOrVideo}
                    disabled={!matUrl.trim()}
                    className="shrink-0 min-h-[44px]"
                  >
                    Qo&apos;shish
                  </Button>
                </div>
              </Field>
            )}
          </div>

          {/* YouTube Video Preview Facade */}
          {youtubeId && (
            <div className="p-3 rounded-2xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
              <div className="relative w-28 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                  alt="YouTube video preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  YouTube video aniqlandi
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  ID: {youtubeId}
                </div>
              </div>
            </div>
          )}

          {uploadProgress && (
            <div className="flex items-center gap-2 text-xs font-medium text-teal-600 dark:text-teal-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{uploadProgress}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-30 p-4 rounded-2xl bg-white/95 dark:bg-[#0B1220]/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-3">
        {initialLesson ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowQuizModal(true)}
            className="flex items-center gap-2 border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 min-h-[44px]"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Kichik testni sozlash (Quiz)</span>
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={isSaving}
            className="min-h-[44px]"
          >
            Bekor qilish
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSaving}
            className="min-h-[44px] font-semibold"
          >
            {initialLesson ? "O'zgarishlarni saqlash" : "Darsni yaratish"}
          </Button>
        </div>
      </div>

      {initialLesson && (
        <QuizEditorModal
          isOpen={showQuizModal}
          onClose={() => setShowQuizModal(false)}
          lessonId={initialLesson._id.toString()}
          initialQuiz={initialQuiz}
        />
      )}
    </form>
  );
}
