import { redirect } from "next/navigation";

// Uyga vazifalar endi "Darslar" bo'limining ichida: eski havola va xatcho'plar shu yerga olib boradi
export default async function MentorHomeworkPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams;
  redirect(group ? `/mentor/lessons?groupId=${encodeURIComponent(group)}` : "/mentor/lessons");
}
