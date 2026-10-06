import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductImage({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500/15 to-blue-500/15 flex items-center justify-center text-teal-600 dark:text-teal-400",
        className
      )}
    >
      {src ? (
        // Presigned (muddatli) havola bo'lgani uchun next/image optimizatsiyasi ishlatilmaydi
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <Gift className="w-10 h-10" aria-hidden />
      )}
    </div>
  );
}
