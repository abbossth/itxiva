// Do'kon chegirmasi: vaqtinchalik arzonroq narx. Sof funksiyalar — server va brauzerda bir xil hisoblanadi.

export interface SaleFields {
  price: number;
  salePrice?: number | null;
  saleEndsAt?: Date | string | null;
}

export interface SaleInfo {
  /** Hozir to'lanadigan narx */
  price: number;
  /** Chegirmagacha bo'lgan narx */
  oldPrice: number;
  percent: number;
  endsAt: string;
}

/** Chegirma amaldami: narxi asl narxdan arzon va tugash vaqti hali kelmagan */
export function activeSale(p: SaleFields, now: Date = new Date()): SaleInfo | null {
  if (!p.salePrice || !p.saleEndsAt || p.salePrice >= p.price || p.salePrice < 1) return null;
  const ends = new Date(p.saleEndsAt);
  if (Number.isNaN(ends.getTime()) || ends.getTime() <= now.getTime()) return null;
  return {
    price: p.salePrice,
    oldPrice: p.price,
    percent: Math.round((1 - p.salePrice / p.price) * 100),
    endsAt: ends.toISOString(),
  };
}

/** Hozir to'lanadigan narx (chegirma bo'lsa — chegirma narxi) */
export function effectivePrice(p: SaleFields, now: Date = new Date()): number {
  return activeSale(p, now)?.price ?? p.price;
}

/** "3 kun qoldi", "5 soat qoldi", "40 daqiqa qoldi" */
export function saleLeftLabel(endsAt: string | Date, now: Date = new Date()): string {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return "tugadi";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} daqiqa qoldi`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat qoldi`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 && days < 3 ? `${days} kun ${rest} soat qoldi` : `${days} kun qoldi`;
}

/** Foiz bo'yicha chegirma narxi: kamida 1 coin va asl narxdan arzon */
export function priceWithPercent(price: number, percent: number): number {
  return Math.max(1, Math.min(price - 1, Math.round(price * (1 - percent / 100))));
}
