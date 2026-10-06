"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * <Link> ichiga qo'yiladi: havola bosilib, sahifa hali yuklanayotgan bo'lsa kichik indikator ko'rsatadi.
 * Tez o'tishlarda miltillamasligi uchun 120ms kechikish bilan paydo bo'ladi.
 */
export function NavPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full bg-teal-500 transition-opacity duration-200",
        pending ? "opacity-100 animate-pulse delay-100" : "opacity-0",
        className
      )}
    />
  );
}
