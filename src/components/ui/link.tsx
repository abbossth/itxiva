"use client";

import NextLink from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * next/link o'rniga: sahifa faqat foydalanuvchi havolaga qiziqqanda (sichqoncha ustiga kelganda,
 * barmoq tekkanda yoki klaviatura bilan fokuslanganda) oldindan yuklanadi.
 * Odatiy next/link ekranda ko'ringan har bir havolani darhol prefetch qiladi — bizning sahifalar dinamik,
 * shuning uchun har prefetch serverda dashboard layout'ini (bir nechta DB so'rovi) qayta ishlatardi
 * va har sahifa ochilganda sidebar'dagi barcha bo'limlar uchun takrorlanardi.
 */
export default function Link({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false);
  // prefetch aniq berilgan bo'lsa (masalan, false) — o'shasi ishlatiladi
  const effective = prefetch !== undefined ? prefetch : intent ? null : false;
  return (
    <NextLink
      {...props}
      prefetch={effective}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
    />
  );
}
