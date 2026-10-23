"use client";

import { useRef, useState } from "react";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { Award, Check, ChevronLeft, CircleCheck, FileText, Link2, Loader2, Send, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { getQuestFileUrlAction, submitQuestEvidenceAction, type StudentQuestDetail, type SubmissionView } from "@/actions/quest-review.actions";
import { PROOF_PLATFORMS, QUEST_FILE_MAX_BYTES, QUEST_FILE_TYPES } from "@/lib/gamification/proof";
import { REPEAT_LABEL, VERIFY_LABEL, rewardLabel } from "@/lib/gamification/labels";
import { uploadFileToStorage } from "@/lib/upload-client";
import { openResolvedUrl } from "@/lib/open-tab";
import { cn, formatDateUz } from "@/lib/utils";

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5";

function statusChip(s: SubmissionView) {
  if (s.revoked) return <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">Bekor qilindi</span>;
  if (s.status === "approved")
    return (
      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
        {s.place ? `${s.place}-o'rin · ` : ""}+{s.coins}
      </span>
    );
  if (s.status === "pending") return <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">Tekshiruvda</span>;
  return <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">Rad etildi</span>;
}

export function QuestDetailView({ data }: { data: StudentQuestDetail }) {
  const router = useRouter();
  const { toast } = useToast();
  const q = data.quest;
  const ev = q.evidence;
  const isCertificate = q.verify === "proof" && (q.template === "certificate" || ev.certId);
  const [platform, setPlatform] = useState(isCertificate ? PROOF_PLATFORMS[0] : "");
  const [courseName, setCourseName] = useState("");
  const [url, setUrl] = useState("");
  const [certId, setCertId] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<{ key: string; name: string; size: number; mimeType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const conditions = [
    ev.link === "required" && "Tasdiqlash havolasi majburiy — mentor uni o'zi ochib tekshiradi",
    isCertificate && "Sertifikatdagi ism profilingizdagi ism bilan bir xil bo'lsin",
    q.guard.dateAfterJoin && "Sana — dasturga qo'shilgan kuningizdan keyin",
    q.guard.uniqueProof && `Har bir dalil faqat bir marta qabul qilinadi${q.guard.monthlyLimit ? ` · oyiga ${q.guard.monthlyLimit} tagacha` : ""}`,
    !q.guard.uniqueProof && q.guard.monthlyLimit && `Oyiga ${q.guard.monthlyLimit} martagacha`,
  ].filter(Boolean) as string[];

  const upload = async (f: File) => {
    setError(null);
    if (!QUEST_FILE_TYPES.includes(f.type)) return setError("Faqat PDF, JPG yoki PNG yuklash mumkin");
    if (f.size > QUEST_FILE_MAX_BYTES) return setError("Fayl hajmi 10 MB dan oshmasligi kerak");
    try {
      setUploading(true);
      const res = await uploadFileToStorage(f, { questId: q._id });
      setFile({ key: res.key, name: f.name, size: res.size, mimeType: res.contentType });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Faylni yuklab bo'lmadi");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setError(null);
    try {
      setBusy(true);
      const res = await submitQuestEvidenceAction({ questId: q._id, platform, courseName, url, certId, issuedAt, note, file, confirmed });
      if (res.success) {
        toast.success(res.message || "Yuborildi");
        router.push("/quests");
        router.refresh();
      } else setError(res.message || "Yuborib bo'lmadi");
    } catch {
      setError("Yuborib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (submissionId: string) => {
    const ok = await openResolvedUrl(async () => (await getQuestFileUrlAction(submissionId)).url ?? null);
    if (!ok) toast.error("Faylni ochib bo'lmadi");
  };

  const xp = q.reward.xp ?? null;

  return (
    <div className="space-y-5 pb-12">
      <div>
        <Link href="/quests" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600">
          <ChevronLeft className="h-4 w-4" />
          Topshiriqlar
        </Link>
        <h1 className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          {isCertificate ? "Sertifikat yuborish" : q.title}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isCertificate ? q.title : REPEAT_LABEL[q.repeat]} · {VERIFY_LABEL[q.verify]}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <aside className="space-y-4 lg:order-2">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
              <Award className="h-5 w-5" />
            </span>
            <div>
              <div className="font-mono text-xl font-black text-amber-700 dark:text-amber-300">{rewardLabel(q.reward, q.verify)} coin</div>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                {q.verify === "competition"
                  ? "1–3-o'rinlar tasdiqlanish tartibida beriladi."
                  : q.reward.coinsMin !== q.reward.coinsMax
                    ? "Aniq miqdorni mentor ish hajmi va dasturga mosligiga qarab belgilaydi. XP ham shuncha."
                    : `XP: ${xp ?? q.reward.coinsMin}`}
              </p>
            </div>
          </div>

          {conditions.length > 0 && (
            <div className={card}>
              <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Qabul qilish shartlari</h2>
              <ul className="space-y-1.5">
                {conditions.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.submissions.length > 0 && (
            <div className={card}>
              <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">{isCertificate ? "Avvalgi sertifikatlarim" : "Yuborganlarim"}</h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.submissions.map((s) => (
                  <li key={s._id} className="py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {[s.evidence.platform, s.evidence.courseName].filter(Boolean).join(" · ") || (s.auto ? "Avtomatik" : "Yuborish")}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{formatDateUz(s.submittedAt)}</div>
                      </div>
                      {statusChip(s)}
                    </div>
                    {s.status === "rejected" && s.rejectReason && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{s.rejectReason}</p>}
                    {s.evidence.fileName && (
                      <button type="button" onClick={() => openFile(s._id)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
                        <FileText className="h-3.5 w-3.5" />
                        {s.evidence.fileName}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <section className={cn(card, "space-y-4 lg:order-1")}>
          {q.description && !isCertificate && <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{q.description}</p>}

          {!data.canSubmit ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-700 dark:text-slate-300">{data.blockedReason}</div>
          ) : (
            <>
              {isCertificate && (
                <Field label="Platforma">
                  <div className="flex flex-wrap gap-2">
                    {PROOF_PLATFORMS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={platform === p}
                        onClick={() => setPlatform(p)}
                        className={cn(
                          "inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold cursor-pointer",
                          platform === p ? "border-teal-600 bg-teal-500/10 text-teal-800 dark:text-teal-200" : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                        )}
                      >
                        {platform === p && <Check className="h-4 w-4" />}
                        {p}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {isCertificate && (
                <Field htmlFor="ev-course" label="Kurs nomi">
                  <Input id="ev-course" value={courseName} onChange={(e) => setCourseName(e.target.value)} maxLength={200} placeholder="Masalan: Responsive Web Design" />
                </Field>
              )}
              {ev.link !== "none" && (
                <Field
                  htmlFor="ev-url"
                  label={isCertificate ? "Tasdiqlash havolasi" : "Havola"}
                  required={ev.link === "required"}
                  hint={isCertificate ? "Sertifikatni hamma ochib tekshira oladigan havola. Rasm o'zi yetarli emas." : "https:// bilan boshlanadigan to'liq manzil"}
                >
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="ev-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" className="pl-9 font-mono text-sm" />
                  </div>
                </Field>
              )}
              {(ev.certId || q.guard.dateAfterJoin) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {ev.certId && (
                    <Field htmlFor="ev-id" label="Sertifikat ID">
                      <Input id="ev-id" value={certId} onChange={(e) => setCertId(e.target.value)} maxLength={120} className="font-mono" />
                    </Field>
                  )}
                  {q.guard.dateAfterJoin && (
                    <Field htmlFor="ev-date" label="Berilgan sana">
                      <Input id="ev-date" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
                    </Field>
                  )}
                </div>
              )}
              {ev.file && (
                <Field label={isCertificate ? "Sertifikat fayli" : "Fayl"} hint="PDF, JPG yoki PNG · 10 MB gacha">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {file && (
                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-[10px] font-black text-rose-600">
                          {file.mimeType === "application/pdf" ? "PDF" : "IMG"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{file.name}</span>
                          <span className="text-xs text-slate-500">{Math.round(file.size / 1024)} KB · yuklandi</span>
                        </span>
                        <button type="button" aria-label="Faylni olib tashlash" onClick={() => setFile(null)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) void upload(f);
                      }}
                      className={cn(
                        "flex min-h-[68px] items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 text-sm font-semibold cursor-pointer",
                        dragOver ? "border-teal-500 bg-teal-500/5" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                      )}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                      {uploading ? "Yuklanmoqda…" : file ? "Boshqa fayl — sudrab tashlang" : "Fayl tanlang yoki sudrab tashlang"}
                    </button>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = "";
                    }}
                  />
                </Field>
              )}
              {(ev.note || q.verify === "competition") && (
                <Field
                  htmlFor="ev-note"
                  label={isCertificate ? "Kursda nimani o'rgandingiz?" : q.verify === "competition" ? "Yechimingiz" : "Izoh"}
                  hint={isCertificate ? "2–3 jumla. Mentor qo'shimcha savol berishi mumkin." : undefined}
                >
                  <Textarea id="ev-note" value={note} onChange={(e) => setNote(e.target.value)} rows={q.verify === "competition" ? 8 : 3} maxLength={2000} className={q.verify === "competition" ? "font-mono text-sm" : undefined} />
                </Field>
              )}
              {q.verify === "proof" && (
                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal-600" />
                  <span>
                    {isCertificate ? "Sertifikat menga tegishli va haqiqiy." : "Dalil menga tegishli va haqiqiy."} Profilimdagi ism: <b>{data.studentName}</b>
                  </span>
                </label>
              )}
              {error && (
                <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300">
                  {error}
                </p>
              )}
              <div className="flex justify-end">
                <Button onClick={submit} isLoading={busy} disabled={busy || uploading} size="lg" className="w-full sm:w-auto gap-2 rounded-2xl">
                  <Send className="h-4 w-4" />
                  Tekshiruvga yuborish
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
