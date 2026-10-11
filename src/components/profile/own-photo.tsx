"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { setOwnPhotoAction } from "@/actions/student-profile.actions";
import { uploadFileToStorage } from "@/lib/upload-client";

/** O'quvchining profil rasmi: kamera tugmasi orqali qo'yadi yoki almashtiradi */
export function OwnPhoto({ userId, fullName, initialUrl }: { userId: string; fullName: string; initialUrl: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);

  const save = async (key: string | null) => {
    const res = await setOwnPhotoAction(key);
    if (res.success) {
      setUrl(res.data?.photoUrl ?? null);
      toast.success(res.message || "Saqlandi");
      router.refresh();
    } else {
      toast.error(res.message || "Xatolik yuz berdi");
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Faqat rasm fayli tanlang");
      return;
    }
    try {
      setBusy(true);
      const uploaded = await uploadFileToStorage(file, { avatarStudentId: userId });
      await save(uploaded.key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rasmni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      setBusy(true);
      await save(null);
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <Avatar src={url} name={fullName} size="xl" className="w-20 h-20 text-2xl rounded-3xl" />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label={url ? "Rasmni almashtirish" : "Rasm qo'yish"}
        title={url ? "Rasmni almashtirish" : "Rasm qo'yish"}
        className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white shadow-md hover:bg-teal-700 cursor-pointer disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
      </button>
      {url && !busy && (
        <button
          type="button"
          onClick={remove}
          aria-label="Rasmni olib tashlash"
          title="Rasmni olib tashlash"
          className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 shadow-xs cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
    </div>
  );
}
