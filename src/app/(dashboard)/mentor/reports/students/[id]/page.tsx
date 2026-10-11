import { redirect } from "next/navigation";

// O'quvchi hisoboti endi uning profilida (eski havolalar ishlashda davom etadi)
export default async function StudentReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/mentor/students/${encodeURIComponent(id)}`);
}
