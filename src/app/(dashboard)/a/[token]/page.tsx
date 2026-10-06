import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { QrCheckin } from "@/components/attendance/qr-checkin";

export const metadata = {
  title: "QR Davomat — ITXiva",
};

interface QrAttendancePageProps {
  params: Promise<{ token: string }>;
}

export default async function QrAttendancePage({ params }: QrAttendancePageProps) {
  const resolvedParams = await params;
  const token = resolvedParams.token;

  const session = await getSession();
  if (!session) {
    redirect(`/login?next=/a/${token}`);
  }

  if (session.role === "mentor") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md p-6 rounded-3xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 text-center space-y-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Mentor hisobi aniqlandi
          </h2>
          <p className="text-xs text-slate-500">
            QR davomat faqat o&apos;quvchilar uchun mo&apos;ljallangan. Siz mentor boshqaruv sahifasidasiz.
          </p>
        </div>
      </div>
    );
  }

  return <QrCheckin token={token} />;
}
