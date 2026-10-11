// Brauzerda yangi varaq ochish yordamchilari (faqat client komponentlarda ishlatiladi)

/** Sxemasiz yozilgan manzilni ("youtu.be/...") to'liq havolaga aylantiradi; http(s) bo'lmasa null */
export function toExternalUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Havolasi serverdan so'raladigan faylni yangi varaqda ochadi.
 * Safari (iPhone) foydalanuvchi bosganidan keyin kutish (await) bo'lsa `window.open` ni bloklaydi,
 * shuning uchun varaq bosilgan zahoti ochiladi va havola kelgach unga yo'naltiriladi.
 * Havola olinmasa `false` qaytadi.
 */
export async function openResolvedUrl(resolve: () => Promise<string | null | undefined>): Promise<boolean> {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const url = await resolve();
    if (!url) {
      tab?.close();
      return false;
    }
    if (tab) tab.location.replace(url);
    else window.location.assign(url);
    return true;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
