// Platforma bezaklari: fasl effektlari (header'da qor, yomg'ir, yaproq...), bayramlar va o'quvchi darajasiga mos
// bezak. Sof funksiyalar — serverda ham, brauzerda ham ishlaydi.

export type Season = "winter" | "spring" | "summer" | "autumn";
export type SeasonMode = "auto" | "off" | Season;
export type Holiday = "newyear" | "navruz" | null;

export interface AmbienceSettings {
  /** auto — sanaga qarab o'zi almashadi; off — o'chiq; yoki aniq fasl */
  season: SeasonMode;
  /** O'quvchi darajasi oshgan sari platforma bezagi kuchayadi */
  levelEffects: boolean;
  /** Yangi yil va Navro'z kunlarida maxsus bezak */
  holidays: boolean;
}

export const DEFAULT_AMBIENCE: AmbienceSettings = { season: "auto", levelEffects: true, holidays: true };

export const SEASON_MODES: SeasonMode[] = ["auto", "off", "winter", "spring", "summer", "autumn"];

export const SEASON_LABEL: Record<SeasonMode, string> = {
  auto: "Avtomatik",
  off: "O'chiq",
  winter: "Qish — qor",
  spring: "Bahor — yomg'ir va gul barglari",
  summer: "Yoz — quyosh uchqunlari",
  autumn: "Kuz — sarg'ish yaproqlar",
};

export function parseAmbience(raw: unknown): AmbienceSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    season: SEASON_MODES.includes(r.season as SeasonMode) ? (r.season as SeasonMode) : DEFAULT_AMBIENCE.season,
    levelEffects: typeof r.levelEffects === "boolean" ? r.levelEffects : DEFAULT_AMBIENCE.levelEffects,
    holidays: typeof r.holidays === "boolean" ? r.holidays : DEFAULT_AMBIENCE.holidays,
  };
}

/** Sana kaliti (YYYY-MM-DD, Toshkent) bo'yicha fasl */
export function seasonFor(dateKey: string): Season {
  const month = Number(dateKey.slice(5, 7));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

/** Sanaga bog'liq bayram (o'zgarmas sanalilar): Yangi yil 20-dekabr – 7-yanvar, Navro'z 18–24-mart */
export function holidayFor(dateKey: string): Holiday {
  const md = dateKey.slice(5);
  if (md >= "12-20" || md <= "01-07") return "newyear";
  if (md >= "03-18" && md <= "03-24") return "navruz";
  return null;
}

/** Bugun header'da qaysi effekt ko'rinadi */
export function resolveAmbience(settings: AmbienceSettings, dateKey: string): { season: Season | null; holiday: Holiday } {
  const holiday = settings.holidays ? holidayFor(dateKey) : null;
  if (settings.season === "off") return { season: null, holiday };
  return { season: settings.season === "auto" ? seasonFor(dateKey) : settings.season, holiday };
}

/** Daraja bezagining kuchi: 1–2-darajada deyarli yo'q, 10-darajada eng yorqin (0..1) */
export function levelGlowStrength(level: number): number {
  const l = Math.min(10, Math.max(1, Math.round(level) || 1));
  return l <= 1 ? 0 : (l - 1) / 9;
}
