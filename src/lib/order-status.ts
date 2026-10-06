import type { OrderStatus } from "@/lib/db/models/order.model";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Kutilmoqda",
  accepted: "Qabul qilindi",
  handed_over: "Topshirildi",
  received: "Yakunlandi",
  rejected: "Rad etildi",
  cancelled: "Bekor qilindi",
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, "warning" | "teal" | "gold" | "success" | "danger" | "secondary"> = {
  pending: "warning",
  accepted: "teal",
  handed_over: "gold",
  received: "success",
  rejected: "danger",
  cancelled: "secondary",
};

/** Buyurtma bosqichlari chizig'i uchun tartib */
export const ORDER_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Buyurtma berildi" },
  { status: "accepted", label: "Mentor qabul qildi" },
  { status: "handed_over", label: "Topshirildi" },
  { status: "received", label: "Qabul qilib oldim" },
];
