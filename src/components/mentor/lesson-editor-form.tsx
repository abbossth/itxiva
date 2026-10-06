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
  ClipboardCheck,
  Sparkles,
  CalendarClock,
  Link2,
  Unlink,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateUz } from "@/lib/utils";
import { IGroupData } from "@/lib/db/models/group.model";
import { ILessonData, IMaterial } from "@/lib/db/models/lesson.model";
import { DEFAULT_HOMEWORK_COINS } from "@/lib/homework-status";
import { IQuizData } from "@/lib/db/models/quiz.model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  createLessonAction,
  updateLessonAction,
  copyLessonToGroupsAction,
  unlinkLessonAction,
  type LinkedLessonInfo,
} from "@/actions/lesson.actions";
import { QuizEditorModal } from "@/components/mentor/quiz-editor-modal";
import { compressImageToWebP, uploadFileToStorage } from "@/lib/upload-client";
import { generateHomeworkAction } from "@/actions/ai.actions";
import { fromTashkentInputValue, getNextLessonAfter, toDateKey, toTashkentInputValue } from "@/lib/schedule";
import { AiAssistantPanel } from "@/components/mentor/ai-assistant-panel";

interface LessonEditorFormProps {
  groups: IGroupData[];
  initialLesson?: ILessonData | null;
  initialQuiz?: IQuizData | null;
  defaultGroupId?: string;
  defaultQuarter?: number;
  aiEnabled?: boolean;
  /** Shu darsning boshqa guruhlardagi bog'langan nusxalari (faqat tahrirlashda) */
  linkedLessons?: LinkedLessonInfo[];
}

/**
 * Extract YouTube ID from link
 */
function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export function LessonEditorForm({
  groups,
  initialLesson,
  initialQuiz,
  defaultGroupId,
  defaultQuarter = 1,
  aiEnabled = false,
  linkedLessons = [],
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
    // Yangi dars: Toshkent bo'yicha bugungi sana (UTC bo'yicha olinsa, tungi 00:00–05:00 da kechagi sana chiqadi)
    initialLesson?.date ? new Date(initialLesson.date).toISOString().split("T")[0] : toDateKey()
  );
  const [isPublished, setIsPublished] = useState(initialLesson?.isPublished ?? false);
  const [materials, setMaterials] = useState<IMaterial[]>(initialLesson?.materials || []);
  const [showQuizModal, setShowQuizModal] = useState(false);

  // Uyga vazifa
  const initialHomework = initialLesson?.homework ?? null;
  const [hwEnabled, setHwEnabled] = useState(Boolean(initialHomework?.isEnabled));
  const [hwInstructions, setHwInstructions] = useState(initialHomework?.instructions ?? "");
  const [hwAttachments, setHwAttachments] = useState<IMaterial[]>(initialHomework?.attachments ?? []);
  const [hwDue, setHwDue] = useState(initialHomework?.dueAt ? toTashkentInputValue(initialHomework.dueAt) : "");
  const [hwCoins, setHwCoins] = useState<number>(initialHomework?.coinsReward ?? DEFAULT_HOMEWORK_COINS);
  // Mentor muddatni o'zi belgilamaguncha, u dars sanasi yoki guruh o'zgarganda jadvaldan qayta hisoblanadi
  const [hwDueTouched, setHwDueTouched] = useState(Boolean(initialHomework?.dueAt));
  const [hwUploading, setHwUploading] = useState(false);
  const [hwGenerating, setHwGenerating] = useState(false);

  const currentGroup = groups.find((g) => g._id.toString() === groupId);

  // Bitta dars — bir nechta guruh: qo'shimcha guruhlar uchun bog'langan nusxa yaratiladi
  const [extraGroupIds, setExtraGroupIds] = useState<string[]>([]);
  const [isCopying, setIsCopying] = useState(false);
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const linkedGroupIds = new Set(linkedLessons.map((l) => l.groupId));
  // Avval shu sinfdagi guruhlar, keyin qolganlari
  const otherGroups = groups
    .filter((g) => g._id.toString() !== groupId && !linkedGroupIds.has(g._id.toString()))
    .sort((a, b) => Number(b.grade === currentGroup?.grade) - Number(a.grade === currentGroup?.grade));
  const selectedExtraIds = extraGroupIds.filter((id) => otherGroups.some((g) => g._id.toString() === id));

  const toggleExtraGroup = (id: string) =>
    setExtraGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleCopyToGroups = async () => {
    if (!initialLesson || selectedExtraIds.length === 0) return;
    try {
      setIsCopying(true);
      const res = await copyLessonToGroupsAction({ lessonId: initialLesson._id.toString(), groupIds: selectedExtraIds });
      if (res.success) {
        toast.success(res.message || "Dars qo'shildi");
        setExtraGroupIds([]);
        router.refresh();
      } else {
        toast.error(res.message || "Darsni qo'shib bo'lmadi");
      }
    } catch {
      toast.error("Darsni qo'shib bo'lmadi");
    } finally {
      setIsCopying(false);
    }
  };

  const handleUnlink = async () => {
    if (!initialLesson) return;
    try {
      setIsUnlinking(true);
      const res = await unlinkLessonAction(initialLesson._id.toString());
      if (res.success) {
        toast.success(res.message || "Bog'lanish uzildi");
        setShowUnlinkDialog(false);
        router.refresh();
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Bog'lanishni uzib bo'lmadi");
    } finally {
      setIsUnlinking(false);
    }
  };

  /** Guruh jadvalidagi keyingi dars boshlanishi — muddatning sukut qiymati */
  const dueFor = (forGroupId: string, forDate: string): string => {
    const schedule = groups.find((g) => g._id.toString() === forGroupId)?.schedule;
    const next = forDate ? getNextLessonAfter(schedule, forDate) : null;
    return next ? toTashkentInputValue(next) : "";
  };
  const nextLessonDue = (): string => dueFor(groupId, date);

  const handleDateChange = (value: string) => {
    setDate(value);
    if (hwEnabled && !hwDueTouched) setHwDue(dueFor(groupId, value));
  };

  const handleGroupChange = (value: string) => {
    setGroupId(value);
    if (hwEnabled && !hwDueTouched) setHwDue(dueFor(value, date));
  };

  const handleToggleHomework = (enabled: boolean) => {
    setHwEnabled(enabled);
    if (enabled && !hwDue) setHwDue(nextLessonDue());
  };

  const handleHomeworkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setHwUploading(true);
      const uploaded = await uploadFileToStorage(file);
      setHwAttachments((prev) => [
        ...prev,
        { type: "file", title: file.name, urlOrKey: uploaded.key, mimeType: uploaded.contentType, fileSize: uploaded.size },
      ]);
      toast.success("Fayl vazifaga biriktirildi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fayl yuklashda xatolik yuz berdi");
    } finally {
      setHwUploading(false);
    }
  };

  const handleGenerateHomework = async () => {
    try {
      setHwGenerating(true);
      const res = await generateHomeworkAction({ title, topic, description, grade: currentGroup?.grade });
      if (res.success && res.data) {
        setHwInstructions(res.data.instructions);
      } else {
        toast.error(res.message || "AI vazifa tuza olmadi");
      }
    } catch {
      toast.error("AI vazifa tuza olmadi");
    } finally {
      setHwGenerating(false);
    }
  };

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
    if (hwEnabled && !hwInstructions.trim() && hwAttachments.length === 0) {
      setErrorMsg("Uyga vazifa matnini yozing yoki fayl biriktiring");
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
        // Vazifa hech qachon yoqilmagan bo'lsa, bo'sh yozuv saqlanmaydi
        homework:
          hwEnabled || initialHomework
            ? {
                isEnabled: hwEnabled,
                instructions: hwInstructions,
                attachments: hwAttachments,
                dueAt: fromTashkentInputValue(hwDue)?.toISOString() ?? null,
                coinsReward: Number.isFinite(hwCoins) ? hwCoins : DEFAULT_HOMEWORK_COINS,
              }
            : null,
      };

      let res;
      if (initialLesson) {
        res = await updateLessonAction(initialLesson._id.toString(), payload);
      } else {
        res = await createLessonAction(payload);
      }

      if (res.success) {
        // Yangi dars: tanlangan boshqa guruhlarga ham bog'langan nusxa yaratiladi
        let copyError: string | null = null;
        if (!initialLesson && selectedExtraIds.length > 0 && res.data?._id) {
          const copyRes = await copyLessonToGroupsAction({ lessonId: String(res.data._id), groupIds: selectedExtraIds });
          if (!copyRes.success) copyError = copyRes.message || "Boshqa guruhlarga qo'shib bo'lmadi";
        }
        if (copyError) {
          toast.error(`Dars yaratildi, lekin: ${copyError}`);
        } else if (initialLesson) {
          toast.success(res.message || "Dars muvaffaqiyatli yangilandi");
        } else {
          toast.success(
            selectedExtraIds.length > 0
              ? `Dars ${selectedExtraIds.length + 1} ta guruhga yaratildi`
              : "Yangi dars yaratildi"
          );
        }
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

      <AiAssistantPanel
        enabled={aiEnabled}
        grade={groups.find((g) => g._id.toString() === groupId)?.grade}
        lesson={{ title, topic, description }}
        onApplyDraft={(draft) => {
          setTitle(draft.title);
          setTopic(draft.topic);
          setDescription(draft.description);
        }}
        onApplyDescription={setDescription}
        onAttachMaterial={(material) => setMaterials((prev) => [...prev, material])}
      />

      {/* Main Lesson Info Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
          {initialLesson ? "Darsni tahrirlash" : "Yangi dars ma'lumotlari"}
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field htmlFor="lesson-group" label="O'quv guruhi" required>
            <select
              id="lesson-group"
              value={groupId}
              onChange={(e) => handleGroupChange(e.target.value)}
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

          <Field htmlFor="lesson-quarter" label="Chorak" required>
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

          <Field htmlFor="lesson-order" label="Tartib raqami (dars #)" required>
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

        <Field htmlFor="lesson-title" label="Dars mavzusi / Sarlavhasi" required hint="Darsning to'liq rasmiy nomi">
          <Input
            id="lesson-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="masalan: 1-dars. Python asoslari va o'zgaruvchilar"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="lesson-topic" label="Mavzu qisqacha (podzagolovok)" hint="Asosiy teglari yoki kalit so'zlar">
            <Input
              id="lesson-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="masalan: Data types, variables, input/output"
            />
          </Field>

          <Field htmlFor="lesson-date" label="Dars o'tiladigan sana">
            <Input
              id="lesson-date"
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </Field>
        </div>

        <Field htmlFor="lesson-description" label="Dars konspekti / Tavsifi" hint="Dars mazmuni, uy vazifasi va ko'rsatmalar">
          <textarea
            id="lesson-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dars konspekti, asosiy mavzular va o'quvchiga yo'riqnoma..."
            rows={10}
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

      {/* Bitta dars — bir nechta guruh */}
      {(linkedLessons.length > 0 || otherGroups.length > 0) && (
        <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              Boshqa guruhlar
            </h2>
            {linkedLessons.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowUnlinkDialog(true)}
                className="gap-2 min-h-[40px] text-slate-500"
              >
                <Unlink className="w-4 h-4" />
                Bog&apos;lanishni uzish
              </Button>
            )}
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bitta darsni bir nechta guruhga bering — har safar qaytadan yaratish shart emas. Sarlavha, konspekt,
            materiallar, uyga vazifa matni va test barcha bog&apos;langan guruhlarda <strong>birga yangilanadi</strong>.
            Sana, tartib raqami, nashr holati, vazifa muddati hamda o&apos;quvchilarning javob va baholari har
            guruhda <strong>alohida</strong> qoladi.
          </p>

          {linkedLessons.length > 0 && (
            <ul className="space-y-2">
              {linkedLessons.map((l) => (
                <li
                  key={l._id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50"
                >
                  <span className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{l.groupName}</span>
                    {l.grade !== null && <span className="text-xs text-slate-500 dark:text-slate-400">{l.grade}-sinf</span>}
                    {l.date && <span className="text-xs text-slate-500 dark:text-slate-400">· {formatDateUz(l.date)}</span>}
                    <Badge variant={l.isPublished ? "success" : "warning"}>
                      {l.isPublished ? "Nashr etilgan" : "Qoralama"}
                    </Badge>
                  </span>
                  <Link
                    href={`/mentor/lessons/${l._id}/edit`}
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline min-h-[36px] flex items-center"
                  >
                    Shu guruhdagi nusxani ochish
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {otherGroups.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {initialLesson ? "Yana qaysi guruhlarga qo'shilsin?" : "Shu darsni quyidagi guruhlarga ham yaratish"}
              </p>
              <div className="flex flex-wrap gap-2">
                {otherGroups.map((g) => {
                  const id = g._id.toString();
                  const checked = selectedExtraIds.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-2.5 px-3.5 rounded-xl border text-sm font-semibold cursor-pointer min-h-[44px] transition-colors ${
                        checked
                          ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExtraGroup(id)}
                        className="w-4 h-4 accent-teal-600 cursor-pointer"
                      />
                      <span>{g.name}</span>
                      <span className={`text-xs font-normal ${g.grade === currentGroup?.grade ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400"}`}>
                        {g.grade}-sinf
                      </span>
                    </label>
                  );
                })}
              </div>
              {initialLesson ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCopyToGroups}
                    isLoading={isCopying}
                    disabled={selectedExtraIds.length === 0}
                    className="gap-2 min-h-[44px]"
                  >
                    <Copy className="w-4 h-4" />
                    Tanlangan guruhlarga qo&apos;shish
                  </Button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Darsning saqlangan holati ko&apos;chiriladi; sana har guruhning jadvaliga moslanadi.
                  </span>
                </div>
              ) : (
                selectedExtraIds.length > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dars {selectedExtraIds.length + 1} ta guruhga yaratiladi; sana va vazifa muddati har guruhning
                    jadvaliga moslanadi.
                  </p>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Materials Builder Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
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
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">({m.type})</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveMaterial(idx)}
                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
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
            <Field htmlFor="mat-title" label="Material sarlavhasi (ixtiyoriy)">
              <Input
                id="mat-title"
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="masalan: Dars taqdimoti (PDF)"
              />
            </Field>

            {materialType === "file" ? (
              <Field htmlFor="file-upload" label="Faylni tanlang">
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
                htmlFor="mat-url"
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
            <div className="p-3 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
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
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
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

      {/* Uyga vazifa */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Uyga vazifa
          </h2>
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={hwEnabled}
              onChange={(e) => handleToggleHomework(e.target.checked)}
              className="w-5 h-5 rounded-md accent-teal-600 cursor-pointer"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Bu darsga vazifa berish
            </span>
          </label>
        </div>

        {!hwEnabled ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Yoqilsa, o&apos;quvchilar dars sahifasida javobini (matn, kod, havola yoki fayl) yuboradi, siz esa
            &quot;Uyga vazifalar&quot; bo&apos;limida tekshirib baholaysiz.
          </p>
        ) : (
          <div className="space-y-4 animate-in fade-in">
            <Field htmlFor="hw-instructions" label="Topshiriq matni" required>
              <textarea
                id="hw-instructions"
                value={hwInstructions}
                onChange={(e) => setHwInstructions(e.target.value)}
                rows={6}
                maxLength={10000}
                placeholder="1. ...&#10;2. ...&#10;Topshirish: kodni yoki GitHub havolasini yuboring"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
              />
            </Field>

            {aiEnabled && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerateHomework}
                isLoading={hwGenerating}
                className="gap-2 min-h-[44px]"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                {hwInstructions.trim() ? "AI bilan qayta tuzish" : "AI bilan tuzish"}
              </Button>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                htmlFor="hw-due"
                label="Topshirish muddati (Toshkent vaqti)"
                hint="Bo'sh qoldirilsa — muddatsiz. Muddatdan keyin ham qabul qilinadi, lekin “kechikkan” deb belgilanadi"
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="hw-due"
                    type="datetime-local"
                    value={hwDue}
                    onChange={(e) => {
                      setHwDueTouched(true);
                      setHwDue(e.target.value);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const next = nextLessonDue();
                      if (next) {
                        setHwDue(next);
                        setHwDueTouched(false);
                      } else toast.error("Guruh jadvali kiritilmagan — muddatni qo'lda tanlang");
                    }}
                    className="shrink-0 gap-1.5 min-h-[44px]"
                    title="Guruh jadvalidagi keyingi dars boshlanishi"
                  >
                    <CalendarClock className="w-4 h-4" />
                    <span className="hidden sm:inline">Keyingi darsgacha</span>
                  </Button>
                </div>
              </Field>

              <Field htmlFor="hw-coins" label="Coin (100 ball uchun)" hint="Ballga mutanosib beriladi, baholashda o'zgartirish mumkin">
                <Input
                  id="hw-coins"
                  type="number"
                  min={0}
                  max={1000}
                  value={Number.isFinite(hwCoins) ? hwCoins : ""}
                  onChange={(e) => setHwCoins(parseInt(e.target.value, 10))}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Biriktirilgan fayllar <span className="font-normal text-slate-500 dark:text-slate-400">(ixtiyoriy)</span>
              </p>
              {hwAttachments.map((m) => (
                <div
                  key={m.urlOrKey}
                  className="flex items-center justify-between gap-2 pl-3.5 pr-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-teal-500 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.title}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setHwAttachments((prev) => prev.filter((a) => a.urlOrKey !== m.urlOrKey))}
                    className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`${m.title} faylini olib tashlash`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  onChange={handleHomeworkFile}
                  disabled={hwUploading}
                  accept=".pdf,.docx,.pptx,.xlsx,.zip,image/*"
                  aria-label="Vazifaga fayl biriktirish"
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-950/40 dark:file:text-teal-300 hover:file:bg-teal-100 cursor-pointer min-h-[44px] flex items-center"
                />
                {hwUploading && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-teal-600" />}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-30 p-4 rounded-2xl bg-white/95 dark:bg-bg/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-3">
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

      <ConfirmDialog
        isOpen={showUnlinkDialog}
        onClose={() => setShowUnlinkDialog(false)}
        onConfirm={handleUnlink}
        title="Bog'lanishni uzish"
        confirmText="Ha, uzish"
        isLoading={isUnlinking}
        description={
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Bu dars mustaqil bo&apos;ladi: bundan keyin undagi o&apos;zgarishlar boshqa guruhlarga o&apos;tmaydi va
            ulardagi o&apos;zgarishlar bunga ta&apos;sir qilmaydi. Hech narsa o&apos;chirilmaydi.
          </p>
        }
      />

      {initialLesson && (
        <QuizEditorModal
          isOpen={showQuizModal}
          onClose={() => setShowQuizModal(false)}
          lessonId={initialLesson._id.toString()}
          initialQuiz={initialQuiz}
          aiEnabled={aiEnabled}
          lessonContext={{
            title,
            topic,
            description,
            grade: groups.find((g) => g._id.toString() === groupId)?.grade,
          }}
        />
      )}
    </form>
  );
}
