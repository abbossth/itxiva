"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Link2, Loader2, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { saveAnnouncementAction, type MentorAnnouncement } from "@/actions/announcement.actions";
import { ANNOUNCEMENT_LIMITS, ANNOUNCEMENT_TEMPLATES, THEME_META, type AnnouncementAudience, type AnnouncementTheme } from "@/lib/announcements";
import { uploadFileToStorage } from "@/lib/upload-client";
import { fromTashkentInputValue, toTashkentInputValue } from "@/lib/schedule";
import { formatFileSize } from "@/lib/homework-status";
import { groupShortName } from "@/lib/group-name";
import { cn } from "@/lib/utils";

interface UploadedItem {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  /** Oldindan ko'rish uchun (yangi yuklangan — brauzerdagi nusxa, mavjud — vaqtinchalik havola) */
  previewUrl?: string;
}

/** Shablon muddati: bugundan N kun keyin (Toshkent vaqti, datetime-local uchun) */
function daysFromNow(days: number): string {
  return toTashkentInputValue(Date.now() + days * 86_400_000);
}

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5 space-y-3";

export function AnnouncementForm({
  initial,
  initialPreviewUrls = [],
  groups,
}: {
  initial?: MentorAnnouncement | null;
  initialPreviewUrls?: string[];
  groups: { _id: string; name: string; shortName?: string | null; grade: number }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [theme, setTheme] = useState<AnnouncementTheme>(initial?.theme ?? "info");
  const [images, setImages] = useState<UploadedItem[]>(
    (initial?.images ?? []).map((img, i) => ({ ...img, previewUrl: initialPreviewUrls[i] }))
  );
  const [files, setFiles] = useState<UploadedItem[]>(initial?.files ?? []);
  const [links, setLinks] = useState<{ label: string; url: string }[]>(initial?.links ?? []);
  const [audience, setAudience] = useState<AnnouncementAudience>(initial?.audience ?? "all");
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [grades, setGrades] = useState<number[]>(initial?.grades ?? []);
  const [startsAt, setStartsAt] = useState(initial?.startsAt ? toTashkentInputValue(initial.startsAt) : "");
  const [endsAt, setEndsAt] = useState(initial?.endsAt ? toTashkentInputValue(initial.endsAt) : "");
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const published = initial?.status === "published";
  const allGrades = [...new Set(groups.map((g) => g.grade))].sort((a, b) => a - b);

  const applyTemplate = (id: string) => {
    const t = ANNOUNCEMENT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (t.title) setTitle(t.title);
    if (t.body) setBody(t.body);
    setTheme(t.theme);
    setStartsAt("");
    setEndsAt(daysFromNow(t.days));
  };

  const upload = async (list: FileList | null, kind: "image" | "file") => {
    const picked = Array.from(list ?? []);
    const room = kind === "image" ? ANNOUNCEMENT_LIMITS.images - images.length : ANNOUNCEMENT_LIMITS.files - files.length;
    for (const file of picked.slice(0, Math.max(0, room))) {
      try {
        setUploading(file.name);
        const up = await uploadFileToStorage(file);
        const item: UploadedItem = {
          key: up.key,
          name: kind === "image" ? file.name.replace(/\.[^/.]+$/, "") + ".webp" : file.name,
          size: up.size,
          mimeType: up.contentType,
          previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
        };
        if (kind === "image") setImages((prev) => [...prev, item]);
        else setFiles((prev) => [...prev, item]);
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "yuklab bo'lmadi"}`);
      } finally {
        setUploading(null);
      }
    }
    if (picked.length > room) toast.error(`Ko'pi bilan ${kind === "image" ? ANNOUNCEMENT_LIMITS.images : ANNOUNCEMENT_LIMITS.files} ta`);
  };

  const save = async (publish: boolean) => {
    setSaving(publish ? "publish" : "draft");
    try {
      const strip = ({ key, name, size, mimeType }: UploadedItem) => ({ key, name, size, mimeType });
      const res = await saveAnnouncementAction(
        {
          title,
          body,
          theme,
          images: images.map(strip),
          files: files.map(strip),
          links: links.filter((l) => l.url.trim()),
          audience,
          groupIds,
          grades,
          startsAt: startsAt ? fromTashkentInputValue(startsAt)?.toISOString() ?? null : null,
          endsAt: endsAt ? fromTashkentInputValue(endsAt)?.toISOString() ?? null : null,
          publish,
        },
        initial?._id
      );
      if (res.success && res.data) {
        toast.success(res.message || "Saqlandi");
        router.push(`/mentor/announcements/${res.data.id}`);
        router.refresh();
      } else {
        toast.error(res.message || "Saqlab bo'lmadi");
      }
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setSaving(null);
    }
  };

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] pb-12">
      <div className="space-y-4">
        {/* Shablonlar */}
        <section className={card}>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tayyor shablon</h2>
          <div className="flex flex-wrap gap-2">
            {ANNOUNCEMENT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className="min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer"
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Shablon matni va ko&apos;rsatish muddatini to&apos;ldiradi — keyin xohlagancha o&apos;zgartiring.</p>
        </section>

        {/* Mazmun */}
        <section className={card}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="E'lon turi">
            {(Object.keys(THEME_META) as AnnouncementTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                onClick={() => setTheme(t)}
                className={cn(
                  "inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition cursor-pointer",
                  theme === t ? `bg-gradient-to-r ${THEME_META[t].gradient} text-white shadow-sm` : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                )}
              >
                {THEME_META[t].emoji} {THEME_META[t].label}
              </button>
            ))}
          </div>
          <Field htmlFor="ann-title" label="Sarlavha">
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ANNOUNCEMENT_LIMITS.title} placeholder="Masalan: Ertaga dars soat 15:00 da" />
          </Field>
          <Field htmlFor="ann-body" label="Matn" hint={`${body.length} / ${ANNOUNCEMENT_LIMITS.body}`}>
            <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={ANNOUNCEMENT_LIMITS.body} placeholder="O'quvchilarga yetkazmoqchi bo'lgan ma'lumot..." />
          </Field>
        </section>

        {/* Rasmlar va fayllar */}
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Rasmlar, fayllar va havolalar</h2>
            {uploading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {uploading}
              </span>
            )}
          </div>

          {images.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <li key={img.key} className="relative h-20 w-28 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                  {img.previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.previewUrl} alt={img.name} className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg bg-slate-950/70 text-white hover:bg-rose-600 cursor-pointer"
                    aria-label={`${img.name} rasmini olib tashlash`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li key={f.key} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4 shrink-0 text-teal-600" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-[11px] text-slate-500">{formatFileSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:text-rose-600 cursor-pointer"
                    aria-label={`${f.name} faylini olib tashlash`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {links.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-2">
              <Input
                aria-label="Havola nomi"
                value={l.label}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder="Nomi (masalan: Ro'yxatdan o'tish)"
                maxLength={80}
              />
              <Input
                aria-label="Havola manzili"
                value={l.url}
                inputMode="url"
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:text-rose-600 cursor-pointer"
                aria-label="Havolani olib tashlash"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <label className={cn("inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 text-sm font-semibold cursor-pointer hover:border-teal-500", uploading && "pointer-events-none opacity-60")}>
              <ImagePlus className="h-4 w-4" /> Rasm
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void upload(e.target.files, "image"); e.target.value = ""; }} />
            </label>
            <label className={cn("inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 text-sm font-semibold cursor-pointer hover:border-teal-500", uploading && "pointer-events-none opacity-60")}>
              <Paperclip className="h-4 w-4" /> Fayl
              <input type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.zip,image/*" className="sr-only" onChange={(e) => { void upload(e.target.files, "file"); e.target.value = ""; }} />
            </label>
            <button
              type="button"
              disabled={links.length >= ANNOUNCEMENT_LIMITS.links}
              onClick={() => setLinks([...links, { label: "", url: "" }])}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 text-sm font-semibold hover:border-teal-500 cursor-pointer disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" /> Havola
            </button>
          </div>
        </section>

        {/* Kimga va qachon */}
        <section className={card}>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Kimga va qachon</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Auditoriya">
            {(
              [
                ["all", "Barcha o'quvchilar"],
                ["grades", "Sinflar"],
                ["groups", "Guruhlar"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={audience === v}
                onClick={() => setAudience(v)}
                className={cn(
                  "min-h-[36px] rounded-xl px-3 text-sm font-semibold transition cursor-pointer",
                  audience === v ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {audience === "grades" && (
            <div className="flex flex-wrap gap-1.5">
              {allGrades.map((gr) => (
                <Chip key={gr} on={grades.includes(gr)} onClick={() => setGrades(toggle(grades, gr))}>
                  {gr}-sinf
                </Chip>
              ))}
            </div>
          )}
          {audience === "groups" && (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <Chip key={g._id} on={groupIds.includes(g._id)} onClick={() => setGroupIds(toggle(groupIds, g._id))}>
                  <span className="font-mono">{groupShortName(g)}</span>
                </Chip>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="ann-start" label="Ko'rsatish boshlanadi" hint="Bo'sh — darhol">
              <Input id="ann-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field htmlFor="ann-end" label="Ko'rsatish tugaydi" hint="Bo'sh — o'quvchi yopguncha">
              <Input id="ann-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          {!published && (
            <Button variant="secondary" onClick={() => void save(false)} isLoading={saving === "draft"} disabled={saving !== null || Boolean(uploading)}>
              Qoralama saqlash
            </Button>
          )}
          <Button onClick={() => void save(true)} isLoading={saving === "publish"} disabled={saving !== null || Boolean(uploading)} className="gap-2">
            {published ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {published ? "Saqlash" : "Nashr etish"}
          </Button>
        </div>
      </div>

      {/* Jonli ko'rinish: o'quvchi aynan shuni ko'radi */}
      <aside className="lg:sticky lg:top-20 lg:self-start space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">O&apos;quvchi shunday ko&apos;radi</p>
        <AnnouncementCard
          data={{
            title,
            body,
            theme,
            images: images.filter((i) => i.previewUrl).map((i) => ({ url: i.previewUrl!, name: i.name })),
            files: files.map((f, index) => ({ index, name: f.name, size: f.size })),
            links: links.filter((l) => l.url.trim()).map((l, index) => ({ index, label: l.label || l.url, url: l.url })),
          }}
          footer={
            <div className="flex justify-end">
              <span className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-4 text-sm font-black text-white dark:text-slate-900">
                <Check className="h-4 w-4" /> Tushunarli
              </span>
            </div>
          }
        />
      </aside>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition cursor-pointer",
        on ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
      )}
    >
      {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
