// Platformaning asosiy (accent) rangi. Barcha komponentlar `teal-*` utilitalaridan foydalanadi,
// shuning uchun rangni almashtirish — `--color-teal-*` o'zgaruvchilarini boshqa shkalaga yo'naltirish demak.
// Har bir shkalada 600 oq matn bilan WCAG AA kontrast beradi (tugmalar shu rangda).

type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
const SHADES: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export interface Accent {
  id: string;
  label: string;
  /** null — standart firuza (globals.css dagi qiymatlar) */
  scale: Record<Shade, string> | null;
  swatch: string;
}

const scale = (...hex: string[]) => Object.fromEntries(SHADES.map((s, i) => [s, hex[i]])) as Record<Shade, string>;

export const ACCENTS: Accent[] = [
  { id: "teal", label: "Firuza", scale: null, swatch: "#0B8177" },
  {
    id: "blue",
    label: "Ko'k",
    swatch: "#2563EB",
    scale: scale("#EFF6FF", "#DBEAFE", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#1E3A8A", "#172554"),
  },
  {
    id: "indigo",
    label: "Indigo",
    swatch: "#4F46E5",
    scale: scale("#EEF2FF", "#E0E7FF", "#C7D2FE", "#A5B4FC", "#818CF8", "#6366F1", "#4F46E5", "#4338CA", "#3730A3", "#312E81", "#1E1B4B"),
  },
  {
    id: "violet",
    label: "Binafsha",
    swatch: "#7C3AED",
    scale: scale("#F5F3FF", "#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6", "#4C1D95", "#2E1065"),
  },
  {
    id: "rose",
    label: "Pushti",
    swatch: "#E11D48",
    scale: scale("#FFF1F2", "#FFE4E6", "#FECDD3", "#FDA4AF", "#FB7185", "#F43F5E", "#E11D48", "#BE123C", "#9F1239", "#881337", "#4C0519"),
  },
  {
    id: "orange",
    label: "To'q sariq",
    swatch: "#C2410C",
    scale: scale("#FFF7ED", "#FFEDD5", "#FED7AA", "#FDBA74", "#FB923C", "#F97316", "#C2410C", "#9A3412", "#7C2D12", "#6B2710", "#431407"),
  },
  {
    id: "emerald",
    label: "Yashil",
    swatch: "#047857",
    scale: scale("#ECFDF5", "#D1FAE5", "#A7F3D0", "#6EE7B7", "#34D399", "#10B981", "#047857", "#065F46", "#064E3B", "#053F31", "#022C22"),
  },
];

export const DEFAULT_ACCENT = "teal";

export function isAccentId(value: unknown): value is string {
  return typeof value === "string" && ACCENTS.some((a) => a.id === value);
}

/** Tanlangan rang uchun CSS (standart rangda — bo'sh satr). Qiymatlar faqat shu fayldagi konstantalardan olinadi. */
export function accentCss(id: string | null | undefined): string {
  const s = ACCENTS.find((a) => a.id === id)?.scale;
  if (!s) return "";
  const vars = SHADES.map((shade) => `--color-teal-${shade}:${s[shade]}`).join(";");
  const grad = `--primary-grad:linear-gradient(135deg,${s[600]} 0%,${s[700]} 100%);--primary-gradient-from:${s[600]};--primary-gradient-to:${s[700]}`;
  return `:root{${vars};--primary:${s[600]};${grad}}.dark{--primary:${s[400]};${grad}}`;
}
