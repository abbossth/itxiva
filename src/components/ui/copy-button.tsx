"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

async function writeClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Eski brauzerlar yoki ruxsat berilmagan holat: yashirin maydon orqali
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

/**
 * Qiymatni nusxalash tugmasi. `<button>` emas, `role="button"` — `<fieldset disabled>` ichida ham ishlaydi
 * (tahrirlash yopiq profilda o'quvchi o'z JSHSHIRini nusxalay olishi uchun).
 */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const empty = !value.trim();

  const copy = async () => {
    if (empty) return;
    if (await writeClipboard(value.trim())) {
      setCopied(true);
      toast.success(`${label} nusxalandi`);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Nusxalab bo'lmadi");
    }
  };

  return (
    <span
      role="button"
      tabIndex={empty ? -1 : 0}
      aria-disabled={empty}
      aria-label={`${label}ni nusxalash`}
      title={empty ? undefined : "Nusxalash"}
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copy();
        }
      }}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500/40",
        empty
          ? "pointer-events-none text-slate-300 dark:text-slate-600"
          : "cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300",
        className
      )}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </span>
  );
}
