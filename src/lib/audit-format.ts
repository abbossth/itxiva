import { ATTENDANCE_STATUS_META } from "@/lib/attendance-status";
import type { AttendanceStatus } from "@/lib/db/models/attendance-record.model";
import { dateFromKey } from "@/lib/schedule";
import { formatDateUz } from "@/lib/utils";

// Audit yozuvini odam o'qiydigan ko'rinishga keltiradi: nomi, toifasi, qisqa matni va (bo'lsa) tegishli sahifa havolasi.

export type AuditCategory = "lessons" | "homework" | "attendance" | "students" | "groups" | "shop" | "exams" | "other";
export type AuditTone = "success" | "teal" | "warning" | "danger" | "default";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  lessons: "Darslar",
  homework: "Vazifalar",
  attendance: "Davomat",
  students: "O'quvchilar",
  groups: "Guruhlar",
  shop: "Do'kon",
  exams: "Imtihon va test",
  other: "Boshqa",
};

const ACTIONS: Record<string, { label: string; tone: AuditTone; category: AuditCategory }> = {
  CREATE_LESSON: { label: "Dars yaratildi", tone: "success", category: "lessons" },
  UPDATE_LESSON: { label: "Dars tahrirlandi", tone: "teal", category: "lessons" },
  DELETE_LESSON: { label: "Dars o'chirildi", tone: "danger", category: "lessons" },
  PUBLISH_LESSON: { label: "Dars nashr etildi", tone: "success", category: "lessons" },
  UNPUBLISH_LESSON: { label: "Dars qoralamaga olindi", tone: "warning", category: "lessons" },
  TOGGLE_PUBLISH_LESSON: { label: "Dars holati o'zgardi", tone: "warning", category: "lessons" },
  COPY_LESSON_TO_GROUPS: { label: "Dars boshqa guruhlarga qo'shildi", tone: "teal", category: "lessons" },
  UNLINK_LESSON: { label: "Dars bog'lanishi uzildi", tone: "warning", category: "lessons" },
  UPSERT_QUIZ: { label: "Test saqlandi", tone: "teal", category: "exams" },
  GRADE_QUIZ: { label: "Test baholandi", tone: "teal", category: "exams" },
  GRADE_HOMEWORK: { label: "Vazifa baholandi", tone: "success", category: "homework" },
  RETURN_HOMEWORK: { label: "Vazifa qayta ishlashga qaytarildi", tone: "warning", category: "homework" },
  HOMEWORK_REMINDER: { label: "Vazifa eslatmasi yuborildi", tone: "teal", category: "homework" },
  START_ATTENDANCE: { label: "Davomat boshlandi", tone: "success", category: "attendance" },
  CLOSE_ATTENDANCE: { label: "Davomat yopildi", tone: "teal", category: "attendance" },
  FINALIZE_ATTENDANCE: { label: "Qo'lda davomat yakunlandi", tone: "teal", category: "attendance" },
  MANUAL_ATTENDANCE: { label: "Davomat holati o'zgartirildi", tone: "teal", category: "attendance" },
  MANUAL_ATTENDANCE_SESSION: { label: "Davomat qo'lda kiritildi", tone: "teal", category: "attendance" },
  CONVERT_ATTENDANCE_RULES: { label: "Davomat yangi coin qoidasiga o'tkazildi", tone: "warning", category: "attendance" },
  DELETE_ATTENDANCE: { label: "Davomat o'chirildi", tone: "danger", category: "attendance" },
  IMPORT_STUDENTS: { label: "O'quvchilar qo'shildi", tone: "success", category: "students" },
  EXCEL_IMPORT: { label: "Excel'dan import qilindi", tone: "success", category: "students" },
  RESET_PASSWORD: { label: "Parol tiklandi", tone: "warning", category: "students" },
  MOVE_STUDENT: { label: "O'quvchi boshqa guruhga ko'chirildi", tone: "teal", category: "students" },
  DELETE_STUDENT: { label: "O'quvchi o'chirildi", tone: "danger", category: "students" },
  EXPORT_CREDENTIALS: { label: "Login-parollar yuklab olindi", tone: "warning", category: "students" },
  EXPORT_CREDENTIALS_DENIED: { label: "Login-parollarni yuklash rad etildi", tone: "danger", category: "students" },
  CREATE_GROUP: { label: "Guruh yaratildi", tone: "success", category: "groups" },
  UPDATE_GROUP: { label: "Guruh yangilandi", tone: "teal", category: "groups" },
  DELETE_GROUP: { label: "Guruh o'chirildi", tone: "danger", category: "groups" },
  CREATE_PRODUCT: { label: "Mahsulot qo'shildi", tone: "success", category: "shop" },
  UPDATE_PRODUCT: { label: "Mahsulot tahrirlandi", tone: "teal", category: "shop" },
  DELETE_PRODUCT: { label: "Mahsulot o'chirildi", tone: "danger", category: "shop" },
  ACCEPT_ORDER: { label: "Buyurtma qabul qilindi", tone: "success", category: "shop" },
  REJECT_ORDER: { label: "Buyurtma rad etildi", tone: "danger", category: "shop" },
  HAND_OVER_ORDER: { label: "Buyurtma topshirildi", tone: "success", category: "shop" },
  CREATE_EXAM: { label: "Imtihon yaratildi", tone: "success", category: "exams" },
  UPDATE_EXAM: { label: "Imtihon yangilandi", tone: "teal", category: "exams" },
  DELETE_EXAM: { label: "Imtihon o'chirildi", tone: "danger", category: "exams" },
  GRADE_EXAM: { label: "Imtihon baholandi", tone: "teal", category: "exams" },
};

/** Havola yasash uchun bazadan topilgan (hali mavjud) obyektlar */
export interface AuditRefs {
  lessons: Map<string, { title: string; groupId: string; quarter: number }>;
  sessions: Map<string, { groupId: string; dateLabel: string }>;
  groups: Map<string, string>;
}

export interface AuditRow {
  _id: string;
  action: string;
  label: string;
  tone: AuditTone;
  category: AuditCategory;
  actor: string;
  target: { id: string; name: string } | null;
  /** Qisqa, odam o'qiydigan tafsilotlar */
  facts: string[];
  /** Shu yozuvga tegishli sahifa (obyekt hali mavjud bo'lsa) */
  link: { href: string; label: string } | null;
  createdAt: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : v != null && typeof v !== "object" ? String(v) : null);
const statusLabel = (v: unknown) => ATTENDANCE_STATUS_META[v as AttendanceStatus]?.label ?? null;

export function formatAuditRow(
  log: {
    _id: string;
    action: string;
    actor?: { fullName: string } | null;
    target?: { _id: string; fullName: string; role?: string } | null;
    details?: Record<string, unknown> | null;
    createdAt: string;
  },
  refs: AuditRefs
): AuditRow {
  const meta = ACTIONS[log.action] ?? { label: log.action.toLowerCase().replaceAll("_", " "), tone: "default" as const, category: "other" as const };
  const d = log.details ?? {};
  const facts: string[] = [];
  const add = (label: string, value: unknown) => {
    const v = str(value);
    if (v) facts.push(label ? `${label}: ${v}` : v);
  };

  const lessonId = str(d.lessonId);
  const sessionId = str(d.sessionId);
  const groupId = str(d.groupId);
  const lesson = lessonId ? refs.lessons.get(lessonId) : undefined;
  const session = sessionId ? refs.sessions.get(sessionId) : undefined;

  // Nomlar
  add("", d.title ?? lesson?.title ?? d.product);
  // Guruh hali mavjud bo'lsa qisqa nomi, o'chirilgan bo'lsa yozuvda saqlangan nomi
  const groupName = refs.groups.get(groupId ?? lesson?.groupId ?? session?.groupId ?? "") ?? str(d.groupName);
  add("Guruh", groupName);
  if (session) add("Sana", session.dateLabel);
  else if (typeof d.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.dateKey)) add("Sana", formatDateUz(dateFromKey(d.dateKey, "12:00")));

  // Amalga xos raqamlar
  const from = statusLabel(d.oldStatus);
  const to = statusLabel(d.newStatus);
  if (to) facts.push(from ? `${from} → ${to}` : to);
  add("Ball", d.score ?? d.totalScore);
  if (typeof d.coins === "number") add("Coin", d.coins);
  if (typeof d.refunded === "number") add("Qaytarilgan coin", d.refunded);
  if (typeof d.price === "number") add("Narxi", `${d.price} coin`);
  if (typeof d.count === "number") add("Soni", `${d.count} ta`);
  if (typeof d.sent === "number") facts.push(`${d.sent} ta o'quvchiga ketdi${typeof d.pending === "number" ? ` (${d.pending} tadan)` : ""}`);
  if (typeof d.changed === "number") facts.push(`${d.changed} ta o'quvchining coini o'zgardi`);
  if (typeof d.records === "number") facts.push(`${d.records} ta yozuv o'chirildi`);
  if (typeof d.syncedCopies === "number" && d.syncedCopies > 0) facts.push(`${d.syncedCopies} ta guruhdagi nusxa ham yangilandi`);
  if (d.auto === true) facts.push("avtomatik yopildi");
  if (typeof d.isPassed === "boolean") facts.push(d.isPassed ? "o'tdi" : "o'tmadi");
  if (log.action === "MOVE_STUDENT") {
    const a = refs.groups.get(str(d.oldGroupId) ?? "");
    const b = refs.groups.get(str(d.newGroupId) ?? "");
    if (a || b) facts.push(`${a ?? "?"} → ${b ?? "?"}`);
  }
  if (d.studentLogin && !log.target) add("", `@${d.studentLogin}`);
  add("", d.fullName);
  const summary = d.summary as { totalPresent?: number; totalLate?: number; totalAbsent?: number } | undefined;
  if (summary && typeof summary === "object") {
    facts.push(`${(summary.totalPresent ?? 0) + (summary.totalLate ?? 0)} keldi, ${summary.totalAbsent ?? 0} kelmadi`);
  }

  // Havola: faqat obyekt hali mavjud bo'lsa
  let link: AuditRow["link"] = null;
  if (meta.category === "homework" && lesson && lessonId) link = { href: `/mentor/homework/${lessonId}`, label: "Javoblarni ochish" };
  else if (lesson && lessonId && !log.action.startsWith("DELETE")) link = { href: `/mentor/lessons/${lessonId}/edit`, label: "Darsni ochish" };
  else if (session && sessionId) link = { href: `/mentor/attendance/${sessionId}`, label: "Davomatni ochish" };
  else if (meta.category === "shop") link = { href: log.action.endsWith("_ORDER") ? "/mentor/orders" : "/mentor/shop", label: log.action.endsWith("_ORDER") ? "Buyurtmalar" : "Mahsulotlar" };
  else if (log.target && log.target.role === "student") link = { href: `/mentor/reports/students/${log.target._id}`, label: "O'quvchi hisoboti" };
  else if (groupId && refs.groups.has(groupId)) link = { href: `/mentor/groups/${groupId}`, label: "Guruhni ochish" };
  else if (meta.category === "exams" && !log.action.startsWith("DELETE")) link = { href: "/mentor/exams", label: "Imtihonlar" };

  return {
    _id: log._id,
    action: log.action,
    label: meta.label,
    tone: meta.tone,
    category: meta.category,
    actor: log.actor?.fullName ?? "Tizim",
    target: log.target ? { id: log.target._id, name: log.target.fullName } : null,
    facts,
    link,
    createdAt: log.createdAt,
  };
}
