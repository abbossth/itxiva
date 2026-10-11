"use client";

import { createPortal } from "react-dom";

/**
 * Qoplama oynalar (dialog, pastki varaq) <body> ga chiqariladi. Aks holda `backdrop-filter` yoki `transform`
 * qo'llangan ota element (masalan, xira fonli sarlavha) ichida `position: fixed` butun ekranga emas,
 * o'sha elementga nisbatan joylashadi va oyna kesilib, boshqa qatlamlar ostida qoladi.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
