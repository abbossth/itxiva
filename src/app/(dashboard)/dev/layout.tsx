import { notFound } from "next/navigation";

// Ichki dizayn ko'rgazmasi: faqat lokal ishlab chiqishda ochiladi
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <>{children}</>;
}
