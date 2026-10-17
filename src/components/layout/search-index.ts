"use client";

import { getSearchIndex } from "@/actions/search.actions";
import type { SearchItem } from "@/lib/search";

// Qidiruv ro'yxati bir marta yuklanadi va xotirada turadi; 2 daqiqadan eski bo'lsa, eskisi ko'rsatilib
// turgan holda orqada yangilanadi. Shuning uchun har bosilgan harf serverga bormaydi — natija bir zumda.
const FRESH_MS = 2 * 60_000;

let cache: { items: SearchItem[]; at: number } | null = null;
let pending: Promise<SearchItem[]> | null = null;

export function cachedSearchIndex(): SearchItem[] | null {
  return cache?.items ?? null;
}

/** Ro'yxatni yuklaydi (yangi bo'lsa — xotiradagisini qaytaradi). Bir vaqtda faqat bitta so'rov ketadi */
export function loadSearchIndex(): Promise<SearchItem[]> {
  if (cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.items);
  pending ??= getSearchIndex()
    .then((items) => {
      cache = { items, at: Date.now() };
      return items;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Qidiruv tugmasiga sichqoncha kelganda oldindan yuklab qo'yish (xato bo'lsa jim) */
export function prefetchSearchIndex(): void {
  loadSearchIndex().catch(() => {});
}
