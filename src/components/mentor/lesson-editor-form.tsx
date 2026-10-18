"use client";

import { groupShortName } from "@/lib/group-name";
import { useEffect, useRef, useState } from "react";
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
  Download,
  ExternalLink,
  Eye,
  Paperclip,
  Upload,
  Plus,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn, formatDateUz } from "@/lib/utils";
import { openResolvedUrl, toExternalUrl } from "@/lib/open-tab";
import { IGroupData } from "@/lib/db/models/group.model";
import { ILessonData, IMaterial } from "@/lib/db/models/lesson.model";
import { DEFAULT_HOMEWORK_COINS, formatFileSize } from "@/lib/homework-status";
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
  getMentorMaterialUrlAction,
  type LinkedLessonInfo,
} from "@/actions/lesson.actions";
import { QuizEditorModal } from "@/components/mentor/quiz-editor-modal";
import { uploadFileToStorage } from "@/lib/upload-client";
import { generateHomeworkAction } from "@/actions/ai.actions";
import { fromTashkentInputValue, getNextLessonAfter, toDateKey, toTashkentInputValue } from "@/lib/schedule";
import { Toggle } from "@/components/ui/toggle";
import { AiAssistantPanel } from "@/components/mentor/ai-assistant-panel";
import { LessonTabPanel, LessonTabs, selectLessonTab, type LessonTabDef } from "@/components/lessons/lesson-tabs";

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

  // Material qo'shish
  const [matUrl, setMatUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Form submitting state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Havola turi o'zi aniqlanadi: YouTube manzili — video, qolgani — tashqi havola
  const youtubeId = extractYouTubeId(matUrl);

  /** Bir yoki bir nechta faylni omborga yuklab, materiallar ro'yxatiga qo'shadi (rasmlar WebP ga siqiladi) */
  const uploadMaterialFiles = async (files: File[]) => {
    if (files.length === 0 || uploadingFile) return;
    setUploadingFile(true);
    setErrorMsg(null);
    let added = 0;
    try {
      for (const [i, file] of files.entries()) {
        setUploadProgress(files.length > 1 ? `Yuklanmoqda ${i + 1} / ${files.length}...` : "Yuklanmoqda...");
        try {
          const uploaded = await uploadFileToStorage(file);
          setMaterials((prev) => [
            ...prev,
            {
              type: "file",
              title: file.name,
              urlOrKey: uploaded.key,
              mimeType: uploaded.contentType,
              fileSize: uploaded.size,
              createdAt: new Date(),
            },
          ]);
          added++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Fayl yuklashda xatolik yuz berdi";
          toast.error(`${file.name}: ${msg}`);
        }
      }
      if (added > 0) toast.success(added === 1 ? "Fayl yuklandi" : `${added} ta fayl yuklandi`);
    } finally {
      setUploadProgress(null);
      setUploadingFile(false);
    }
  };

  const handleAddLinkOrVideo = () => {
    const raw = matUrl.trim();
    if (!raw) return;
    const url = toExternalUrl(raw);
    if (!url) {
      toast.error("Havola noto'g'ri kiritilgan");
      return;
    }
    let host = "Material havolasi";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
    setMaterials((prev) => [
      ...prev,
      { type: youtubeId ? "youtube" : "link", title: youtubeId ? "Dars videosi" : host, urlOrKey: raw, createdAt: new Date() },
    ]);
    setMatUrl("");
  };

  const renameMaterial = (index: number, value: string) =>
    setMaterials((prev) => prev.map((m, i) => (i === index ? { ...m, title: value } : m)));

  const [openingKey, setOpeningKey] = useState<string | null>(null);

  // Materialni ochib ko'rish: fayl — vaqtinchalik havola orqali, video va havola — to'g'ridan-to'g'ri
  const handleOpenMaterial = async (m: IMaterial) => {
    if (m.type !== "file") {
      const url = toExternalUrl(m.urlOrKey);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("Havola noto'g'ri kiritilgan");
      return;
    }
    try {
      setOpeningKey(m.urlOrKey);
      let message: string | undefined;
      const opened = await openResolvedUrl(async () => {
        const res = await getMentorMaterialUrlAction(m.urlOrKey);
        message = res.message;
        return res.success ? res.downloadUrl : null;
      });
      if (!opened) toast.error(message || "Faylni ochib bo'lmadi");
    } catch {
      toast.error("Faylni ochib bo'lmadi");
    } finally {
      setOpeningKey(null);
    }
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  // Saqlanmagan o'zgarishlar: sahifa yopilishidan oldin ogohlantiriladi, tablarda esa qaysi bo'lim o'zgargani belgilanadi
  const sections = {
    lesson: JSON.stringify([groupId, quarter, order, title, topic, description, date]),
    materials: JSON.stringify(materials),
    homework: JSON.stringify([hwEnabled, hwInstructions, hwAttachments, hwDue, hwCoins]),
    groups: JSON.stringify(extraGroupIds),
    publish: String(isPublished),
  };
  const [savedSections] = useState(sections);
  const changed = (key: keyof typeof sections) => sections[key] !== savedSections[key];
  const isDirty = (Object.keys(sections) as (keyof typeof sections)[]).some(changed);

  useEffect(() => {
    if (!isDirty || isSaving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, isSaving]);

  // Ctrl/⌘ + S — saqlash
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Xato boshqa tabda bo'lsa, o'sha tab ochiladi (yashirin maydonni brauzer ko'rsata olmaydi, shuning uchun tekshiruv shu yerda)
    const fail = (tab: string, message: string, focusId?: string) => {
      setErrorMsg(message);
      selectLessonTab(tab);
      if (focusId) requestAnimationFrame(() => document.getElementById(focusId)?.focus());
    };
    if (!groupId) return fail("lesson", "Guruhni tanlang", "lesson-group");
    if (!title.trim()) return fail("lesson", "Dars sarlavhasini kiriting", "lesson-title");
    if (!Number.isFinite(order) || order < 1) return fail("lesson", "Dars tartib raqamini kiriting", "lesson-order");
    if (hwEnabled && !hwInstructions.trim() && hwAttachments.length === 0) {
      return fail("homework", "Uyga vazifa matnini yozing yoki fayl biriktiring", "hw-instructions");
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
        // Nomi o'chirib yuborilgan material bo'sh nom bilan saqlanmaydi
        materials: materials.map((m) => ({
          ...m,
          title: m.title.trim() || (m.type === "youtube" ? "Dars videosi" : m.type === "link" ? "Havola" : "Fayl"),
        })),
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
        // Saqlangach dars o'quvchi ko'radigan ko'rinishda ochiladi (u yerdan istalgan payt tahrirlashga qaytish mumkin)
        const savedId = initialLesson?._id ?? res.data?._id;
        router.push(savedId ? `/mentor/lessons/${savedId}` : "/mentor/lessons");
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

  const hasGroupsTab = linkedLessons.length > 0 || otherGroups.length > 0;
  const editorTabs: LessonTabDef[] = [
    { id: "lesson", label: "Dars", icon: "lesson", dirty: changed("lesson") },
    { id: "materials", label: "Materiallar", icon: "materials", meta: String(materials.length), tone: materials.length ? "default" : "muted", dirty: changed("materials") },
    { id: "homework", label: "Uyga vazifa", icon: "homework", meta: hwEnabled ? "Bor" : "Yo'q", tone: hwEnabled ? "done" : "muted", dirty: changed("homework") },
    {
      id: "quiz",
      label: "Test",
      icon: "quiz",
      meta: initialQuiz ? `${initialQuiz.questions?.length ?? 0} savol` : "Yo'q",
      tone: initialQuiz ? "default" : "muted",
    },
    ...(hasGroupsTab
      ? [{ id: "groups", label: "Guruhlar", icon: "groups" as const, meta: linkedLessons.length ? String(linkedLessons.length) : undefined, dirty: changed("groups") }]
      : []),
  ];

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4 max-w-3xl mx-auto pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          {initialLesson ? "Darsni tahrirlash" : "Yangi dars"}
        </h1>
        <Badge variant={isPublished ? "success" : "warning"}>{isPublished ? "Nashr etilgan" : "Qoralama"}</Badge>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center gap-2.5 text-sm"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <LessonTabs tabs={editorTabs}>
        <LessonTabPanel id="lesson" className="space-y-4">
          <AiAssistantPanel
            enabled={aiEnabled}
            defaultOpen={!initialLesson}
            grade={currentGroup?.grade}
            lesson={{ title, topic, description }}
            onApplyDraft={(draft) => {
              setTitle(draft.title);
              setTopic(draft.topic);
              setDescription(draft.description);
            }}
            onApplyDescription={setDescription}
            onAttachMaterial={(material) => setMaterials((prev) => [...prev, material])}
          />

          {/* Dars: sarlavha va konspekt hujjat kabi yoziladi, qolgan sozlamalar bitta ixcham qatorda */}
          <section className={sectionClass}>
            <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] gap-x-3 gap-y-2">
              <label className="space-y-1">
                <span className={metaLabel}>Guruh</span>
                <select
                  id="lesson-group"
                  value={groupId}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className={metaControl}
                  required
                >
                  {groups.map((g) => (
                    <option key={g._id.toString()} value={g._id.toString()}>
                      {groupShortName(g)} — {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={metaLabel}>Chorak</span>
                <select
                  id="lesson-quarter"
                  value={quarter}
                  onChange={(e) => setQuarter(parseInt(e.target.value, 10))}
                  className={metaControl}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      {q}-chorak
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={metaLabel}>Dars №</span>
                <input
                  id="lesson-order"
                  type="number"
                  min={1}
                  value={Number.isFinite(order) ? order : ""}
                  onChange={(e) => setOrder(parseInt(e.target.value, 10))}
                  className={metaControl}
                  required
                />
              </label>
              <label className="space-y-1">
                <span className={metaLabel}>Sana</span>
                <input
                  id="lesson-date"
                  type="date"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className={metaControl}
                />
              </label>
            </div>

            <div className="pt-2 space-y-1">
              <input
                id="lesson-title"
                aria-label="Dars nomi"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dars nomi"
                required
                maxLength={200}
                className="w-full bg-transparent text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-hidden"
              />
              <input
                id="lesson-topic"
                aria-label="Qisqacha mavzu"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Qisqacha mavzu — masalan: o'zgaruvchilar, ma'lumot turlari"
                className="w-full bg-transparent text-sm sm:text-base font-medium text-teal-700 dark:text-teal-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal focus:outline-hidden"
              />
            </div>

            <textarea
              id="lesson-description"
              aria-label="Dars konspekti"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dars konspekti: asosiy tushunchalar, misollar va o'quvchiga yo'riqnoma..."
              rows={8}
              className="w-full [field-sizing:content] min-h-48 resize-y border-t border-slate-100 dark:border-slate-800 bg-transparent pt-3 text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden"
            />
          </section>
        </LessonTabPanel>

        {/* Materiallar: faylni tashlash yoki havolani qo'yish kifoya — turi o'zi aniqlanadi */}
        <LessonTabPanel id="materials">
          <section
            className={cn(sectionClass, isDragging && "ring-2 ring-teal-500 border-teal-500")}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              setIsDragging(false);
              uploadMaterialFiles([...e.dataTransfer.files]);
            }}
          >
            <SectionHeader icon={Paperclip} title="Materiallar" count={materials.length} />

            {materials.length > 0 && (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {materials.map((m, idx) => (
                  <li key={`${m.urlOrKey}-${idx}`} className="flex items-center gap-2 py-1">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        m.type === "youtube"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : m.type === "link"
                          ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                      )}
                      title={m.type === "youtube" ? "YouTube video" : m.type === "link" ? "Havola" : "Fayl"}
                    >
                      {m.type === "youtube" ? <Video className="w-4 h-4" /> : m.type === "link" ? <LinkIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <input
                        aria-label="Material nomi"
                        value={m.title}
                        onChange={(e) => renameMaterial(idx, e.target.value)}
                        placeholder="Material nomi"
                        maxLength={200}
                        className="w-full bg-transparent rounded-md px-1.5 py-1 -ml-1.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 focus:outline-hidden"
                      />
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {m.type === "file" ? formatFileSize(m.fileSize) || "Fayl" : m.urlOrKey}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenMaterial(m)}
                      disabled={openingKey === m.urlOrKey}
                      className={iconButton}
                      aria-label={m.type === "file" ? `${m.title} faylini yuklab olish` : `${m.title} havolasini ochish`}
                      title={m.type === "file" ? "Yuklab olish" : "Ochish"}
                    >
                      {openingKey === m.urlOrKey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : m.type === "file" ? (
                        <Download className="w-4 h-4" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(idx)}
                      className={cn(iconButton, "hover:text-rose-600 dark:hover:text-rose-400")}
                      aria-label={`${m.title} materialini o'chirish`}
                      title="O'chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
              <label
                className={cn(
                  "flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl border border-dashed text-sm font-semibold cursor-pointer transition-colors",
                  "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300",
                  uploadingFile && "opacity-60 pointer-events-none"
                )}
              >
                {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{uploadingFile ? uploadProgress || "Yuklanmoqda..." : "Fayl yuklash"}</span>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = "";
                    uploadMaterialFiles(files);
                  }}
                  disabled={uploadingFile}
                  accept=".pdf,.docx,.pptx,.xlsx,.zip,image/*"
                  className="sr-only"
                />
              </label>

              <div className="flex items-center gap-2">
                <input
                  id="mat-url"
                  aria-label="YouTube yoki boshqa havola"
                  value={matUrl}
                  onChange={(e) => setMatUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddLinkOrVideo();
                    }
                  }}
                  placeholder="YouTube yoki boshqa havolani qo'ying..."
                  inputMode="url"
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
                />
                <Button type="button" variant="secondary" onClick={handleAddLinkOrVideo} disabled={!matUrl.trim()} className="shrink-0 gap-1.5">
                  <Plus className="w-4 h-4" />
                  Qo&apos;shish
                </Button>
              </div>
            </div>

            {youtubeId ? (
              <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                  alt=""
                  className="h-12 w-20 rounded-lg object-cover bg-slate-100 dark:bg-slate-800"
                />
                <span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">YouTube video aniqlandi</span> — &quot;Qo&apos;shish&quot;ni bosing yoki Enter
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Fayllarni shu yerga sudrab tashlash ham mumkin · PDF, Word, PowerPoint, Excel, ZIP, rasm · har biri 100 MB gacha
              </p>
            )}
          </section>
        </LessonTabPanel>

        {/* Uyga vazifa */}
        <LessonTabPanel id="homework">
          <section className={sectionClass}>
            <SectionHeader
              icon={ClipboardCheck}
              title="Uyga vazifa"
              action={<Toggle checked={hwEnabled} onChange={handleToggleHomework} label="Bu darsga vazifa berish" />}
            />

            {!hwEnabled ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Yoqilsa, o&apos;quvchilar dars sahifasida javobini (matn, kod, havola yoki fayl) yuboradi, siz esa uni tekshirib baholaysiz.
              </p>
            ) : (
              <div className="space-y-4 animate-in fade-in">
                <div className="space-y-2">
                  <textarea
                    id="hw-instructions"
                    aria-label="Topshiriq matni"
                    value={hwInstructions}
                    onChange={(e) => setHwInstructions(e.target.value)}
                    rows={4}
                    maxLength={10000}
                    placeholder={"Topshiriq matni:\n1. ...\n2. ...\nTopshirish: kodni yoki GitHub havolasini yuboring"}
                    className="w-full [field-sizing:content] min-h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent p-3 text-sm leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {aiEnabled && (
                      <Button type="button" variant="secondary" size="sm" onClick={handleGenerateHomework} isLoading={hwGenerating} className="gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        {hwInstructions.trim() ? "AI bilan qayta tuzish" : "AI bilan tuzish"}
                      </Button>
                    )}
                    <label
                      className={cn(
                        "inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 transition-colors",
                        hwUploading && "opacity-60 pointer-events-none"
                      )}
                    >
                      {hwUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                      Fayl biriktirish
                      <input
                        type="file"
                        onChange={handleHomeworkFile}
                        disabled={hwUploading}
                        accept=".pdf,.docx,.pptx,.xlsx,.zip,image/*"
                        aria-label="Vazifaga fayl biriktirish"
                        className="sr-only"
                      />
                    </label>
                  </div>
                  {hwAttachments.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {hwAttachments.map((m) => (
                        <li
                          key={m.urlOrKey}
                          className="inline-flex items-center gap-1.5 max-w-full pl-2.5 pr-1 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                          <span className="truncate">{m.title}</span>
                          <button
                            type="button"
                            onClick={() => setHwAttachments((prev) => prev.filter((a) => a.urlOrKey !== m.urlOrKey))}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                            aria-label={`${m.title} faylini olib tashlash`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <Field
                    htmlFor="hw-due"
                    label="Topshirish muddati (Toshkent vaqti)"
                    hint="Bo'sh — muddatsiz. Muddatdan keyin ham qabul qilinadi, “kechikkan” belgisi bilan"
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
                        className="shrink-0 gap-1.5"
                        title="Guruh jadvalidagi keyingi dars boshlanishi"
                      >
                        <CalendarClock className="w-4 h-4" />
                        <span className="hidden sm:inline">Keyingi darsgacha</span>
                      </Button>
                    </div>
                  </Field>

                  <Field htmlFor="hw-coins" label="Coin (100 ball uchun)" hint="Ballga mutanosib beriladi">
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
              </div>
            )}
          </section>

        </LessonTabPanel>

        {/* Kichik test: alohida oynada tahrirlanadi va o'zi saqlanadi */}
        <LessonTabPanel id="quiz">
          <section className={sectionClass}>
            <SectionHeader
              icon={HelpCircle}
              title="Kichik test (quiz)"
              count={initialQuiz?.questions?.length || undefined}
              action={
                initialLesson ? (
                  <Button type="button" variant={initialQuiz ? "secondary" : "primary"} size="sm" onClick={() => setShowQuizModal(true)} className="gap-1.5">
                    {initialQuiz ? "Testni tahrirlash" : "Test tuzish"}
                  </Button>
                ) : undefined
              }
            />
            {!initialLesson ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Testni dars yaratilgandan keyin qo&apos;shasiz: avval darsni saqlang.</p>
            ) : !initialQuiz ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Bu darsda hali test yo&apos;q. Savollarni qo&apos;lda yozish yoki AI bilan konspekt asosida tuzish mumkin.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {initialQuiz.isPublished ? "O'quvchilarga ochiq" : "Qoralama — o'quvchilar ko'rmaydi"} · test o&apos;zgarishlari test oynasida
                  alohida saqlanadi
                </p>
                {initialQuiz.questions.length > 0 && (
                  <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                    {initialQuiz.questions.map((q, i) => (
                      <li key={q._id?.toString() ?? i} className="flex items-start gap-3 py-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200 line-clamp-2">{q.prompt}</span>
                        <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{QUESTION_TYPE_LABEL[q.type]}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>
        </LessonTabPanel>

        {/* Bitta dars — bir nechta guruh */}
        {hasGroupsTab && (
          <LessonTabPanel id="groups">
            <section className={sectionClass}>
              <SectionHeader
                icon={Link2}
                title="Boshqa guruhlar"
                count={linkedLessons.length || undefined}
                action={
                  linkedLessons.length > 0 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowUnlinkDialog(true)} className="gap-1.5 text-slate-500">
                      <Unlink className="w-4 h-4" />
                      Bog&apos;lanishni uzish
                    </Button>
                  ) : undefined
                }
              />

              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Sarlavha, konspekt, materiallar, vazifa matni va test bog&apos;langan guruhlarda <strong>birga yangilanadi</strong>. Sana, tartib
                raqami, nashr holati, vazifa muddati va o&apos;quvchilar javoblari har guruhda <strong>alohida</strong> qoladi.
              </p>

              {linkedLessons.length > 0 && (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {linkedLessons.map((l) => (
                    <li key={l._id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{l.groupName}</span>
                        {l.grade !== null && <span className="text-xs text-slate-500 dark:text-slate-400">{l.grade}-sinf</span>}
                        {l.date && <span className="text-xs text-slate-500 dark:text-slate-400">· {formatDateUz(l.date)}</span>}
                        <Badge variant={l.isPublished ? "success" : "warning"}>{l.isPublished ? "Nashr etilgan" : "Qoralama"}</Badge>
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
                <div className="space-y-2">
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
                          className={cn(
                            "flex items-center gap-2 px-3 rounded-xl border text-sm font-semibold cursor-pointer min-h-[40px] transition-colors",
                            checked
                              ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                              : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
                          )}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleExtraGroup(id)} className="sr-only" />
                          {checked && <Check className="w-4 h-4" />}
                          <span className="font-mono" title={g.name}>
                            {groupShortName(g)}
                          </span>
                          <span className={cn("text-xs font-normal", g.grade === currentGroup?.grade ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400")}>
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
                        className="gap-2"
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
                        Dars {selectedExtraIds.length + 1} ta guruhga yaratiladi; sana va vazifa muddati har guruhning jadvaliga moslanadi.
                      </p>
                    )
                  )}
                </div>
              )}
            </section>
          </LessonTabPanel>
        )}
      </LessonTabs>

      {/* Doim ko'rinib turadigan amallar paneli */}
      <div className="sticky bottom-20 md:bottom-3 z-30 px-3 py-2 rounded-2xl bg-white/95 dark:bg-surface/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-card flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-h-[44px]">
          <Toggle checked={isPublished} onChange={setIsPublished} label="Nashr qilish" />
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
            {isPublished ? "O'quvchilarga ko'rinadi" : "Faqat sizga ko'rinadi"}
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {isDirty && <span className="hidden md:inline text-xs text-amber-700 dark:text-amber-400">Saqlanmagan o&apos;zgarishlar</span>}
          {initialLesson && (
            <Link
              href={`/mentor/lessons/${initialLesson._id}`}
              title="Saqlangan holatini o'quvchi ko'rinishida ochish"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Eye className="w-4 h-4" />
              Ko&apos;rish
            </Link>
          )}
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isSaving}>
            Bekor qilish
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving} className="font-semibold" title="Ctrl/⌘ + S">
            {initialLesson ? "Saqlash" : "Darsni yaratish"}
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
            grade: currentGroup?.grade,
          }}
        />
      )}
    </form>
  );
}

const QUESTION_TYPE_LABEL: Record<IQuizData["questions"][number]["type"], string> = {
  single_choice: "Bitta javob",
  multiple_choice: "Bir nechta javob",
  short_answer: "Qisqa javob",
  open_ended: "Ochiq savol",
};

const sectionClass =
  "p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3 transition-shadow";
const metaLabel = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const metaControl =
  "w-full h-10 rounded-lg border border-transparent bg-slate-100 dark:bg-slate-800/70 px-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 focus:border-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20";
const iconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60";

function SectionHeader({
  icon: Icon,
  title,
  count,
  action,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 min-h-[36px]">
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        {title}
        {count ? <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}
