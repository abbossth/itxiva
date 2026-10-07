// Bildirishnoma turlari. Bu fayl brauzerda ham ishlatiladi (profil sozlamalari), shuning uchun serverga bog'liq emas.

export type NotificationType =
  // O'quvchi
  | "homework_graded"
  | "lesson_new"
  | "material_new"
  | "exam_new"
  | "homework_due"
  | "coins_changed"
  | "order_status"
  | "product_new"
  // Mentor
  | "homework_submitted"
  | "order_new"
  | "exam_finished"
  // Ikkala rol
  | "lesson_reminder";

export interface NotificationOption {
  type: NotificationType;
  label: string;
  description: string;
}

export const STUDENT_NOTIFICATIONS: NotificationOption[] = [
  { type: "lesson_reminder", label: "Dars eslatmasi", description: "Dars boshlanishiga bir soat qolganda" },
  { type: "homework_graded", label: "Vazifa tekshirildi", description: "Baho, izoh yoki qayta ishlashga qaytarilgani" },
  { type: "lesson_new", label: "Yangi dars", description: "Guruhingizga yangi dars nashr etilganda" },
  { type: "material_new", label: "Yangi material", description: "Darsga video, fayl yoki havola qo'shilganda" },
  { type: "exam_new", label: "Yangi test yoki imtihon", description: "Test yoki imtihon e'lon qilinganda" },
  { type: "homework_due", label: "Vazifa muddati yaqin", description: "Muddat tugashiga bir kun qolganda eslatma" },
  { type: "coins_changed", label: "Coin o'zgarishi", description: "Coin berilganda yoki olinganda, sababi bilan" },
  { type: "order_status", label: "Buyurtma holati", description: "Buyurtma qabul qilindi, rad etildi yoki topshirildi" },
  { type: "product_new", label: "Do'konda yangi mahsulot", description: "Do'konga yangi sovg'a qo'shilganda" },
];

export const MENTOR_NOTIFICATIONS: NotificationOption[] = [
  { type: "lesson_reminder", label: "Dars eslatmasi", description: "Har bir guruh darsi boshlanishiga bir soat qolganda" },
  { type: "homework_submitted", label: "Yangi vazifa javobi", description: "O'quvchi uyga vazifa topshirganda" },
  { type: "order_new", label: "Do'kon so'rovi", description: "O'quvchi do'kondan buyurtma berganda" },
  { type: "exam_finished", label: "Imtihon yakunlandi", description: "Imtihon vaqti tugaganda qisqa statistika" },
];

export function notificationsForRole(role: "mentor" | "student"): NotificationOption[] {
  return role === "mentor" ? MENTOR_NOTIFICATIONS : STUDENT_NOTIFICATIONS;
}

const ALL_TYPES = new Set<string>([...STUDENT_NOTIFICATIONS, ...MENTOR_NOTIFICATIONS].map((n) => n.type));

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && ALL_TYPES.has(value);
}

/** Sozlamada aniq o'chirilmagan har qanday tur yoqilgan hisoblanadi */
export function isNotificationEnabled(prefs: Record<string, boolean> | null | undefined, type: NotificationType): boolean {
  return prefs?.[type] !== false;
}
