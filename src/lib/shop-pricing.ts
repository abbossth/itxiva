// Do'kon narxi tavsiyasi: mahsulotning hayotdagi narxidan (so'm) coin narxi. Sof funksiya — brauzerda ham ishlaydi.
// So'mdagi narx faqat mentorga: o'quvchiga hech qachon yuborilmaydi.

/**
 * Do'konda so'mdagi narxi kiritilgan mahsulot kam bo'lsa ishlatiladigan taxmin: o'rtacha o'quvchi bir oyda
 * yig'adigan coinlari taxminan shuncha so'mlik sovg'aga teng.
 */
export const DEFAULT_SOM_PER_MONTH = 30_000;
/** Shu sondan kam mahsulotda so'm narxi bo'lsa, katalog nisbati emas — daromad bo'yicha hisoblanadi */
const MIN_CATALOG_REFERENCES = 2;
const WEEKS_PER_MONTH = 4.345;

export interface PriceReference {
  title: string;
  price: number;
  realPrice: number;
}

export interface PriceSuggestion {
  suggested: number;
  /** Arzonroq (rag'batlantirish uchun) va qimmatroq (kamyob mahsulot) variantlar */
  low: number;
  high: number;
  /** catalog — do'kondagi boshqa mahsulotlarga mos; economy — o'quvchilarning o'rtacha daromadi bo'yicha */
  basis: "catalog" | "economy";
  /** 1 coin taxminan necha so'm */
  somPerCoin: number;
  /** O'rtacha o'quvchi tavsiya narxini necha haftada yig'adi (daromad ma'lum bo'lmasa — null) */
  weeksToEarn: number | null;
  referencesUsed: number;
  /** So'mdagi narxi bo'yicha eng yaqin mahsulotlar */
  nearest: PriceReference[];
  warning: string | null;
}

/** Narxni chiroyli songa yaxlitlaydi: 47 → 45, 233 → 230, 1 234 → 1 250 */
export function niceCoins(value: number): number {
  if (!Number.isFinite(value) || value <= 1) return 1;
  const step = value < 20 ? 1 : value < 100 ? 5 : value < 1000 ? 10 : 50;
  return Math.max(1, Math.round(value / step) * step);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function suggestCoinPrice({
  realPrice,
  catalog,
  perStudentMonthly,
  monthlyTarget,
}: {
  realPrice: number;
  /** Boshqa mahsulotlar (so'mdagi narxi kiritilganlari) */
  catalog: PriceReference[];
  /** O'rtacha o'quvchining oxirgi 30 kundagi daromadi (coin) */
  perStudentMonthly: number;
  /** Sozlamadagi oylik maqsad — daromad hali yo'q bo'lsa */
  monthlyTarget: number;
}): PriceSuggestion | null {
  if (!Number.isFinite(realPrice) || realPrice <= 0) return null;
  const refs = catalog.filter((r) => r.realPrice > 0 && r.price > 0);

  let coinsPerSom: number;
  let basis: PriceSuggestion["basis"];
  if (refs.length >= MIN_CATALOG_REFERENCES) {
    coinsPerSom = median(refs.map((r) => r.price / r.realPrice));
    basis = "catalog";
  } else {
    const coinsPerMonth = perStudentMonthly > 0 ? perStudentMonthly : Math.max(1, monthlyTarget);
    coinsPerSom = coinsPerMonth / DEFAULT_SOM_PER_MONTH;
    basis = "economy";
  }

  const raw = realPrice * coinsPerSom;
  const suggested = niceCoins(raw);
  const weeksToEarn = perStudentMonthly > 0 ? Math.round((suggested / (perStudentMonthly / WEEKS_PER_MONTH)) * 10) / 10 : null;

  let warning: string | null = null;
  if (weeksToEarn !== null && weeksToEarn > 13) {
    warning = "O'rtacha o'quvchi buni 3 oydan ko'p yig'adi — juda uzoq, qiziqish so'nishi mumkin";
  } else if (weeksToEarn !== null && weeksToEarn < 1) {
    warning = "O'rtacha o'quvchi buni bir haftadan tez yig'adi — juda arzon bo'lishi mumkin";
  }

  return {
    suggested,
    low: Math.min(suggested, niceCoins(raw * 0.8)),
    high: Math.max(suggested, niceCoins(raw * 1.25)),
    basis,
    somPerCoin: Math.round(1 / coinsPerSom),
    weeksToEarn,
    referencesUsed: basis === "catalog" ? refs.length : 0,
    nearest: [...refs].sort((a, b) => Math.abs(a.realPrice - realPrice) - Math.abs(b.realPrice - realPrice)).slice(0, 3),
    warning,
  };
}
