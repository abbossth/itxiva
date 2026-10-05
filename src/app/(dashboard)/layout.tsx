import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Header } from "@/components/layout/header";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1220]">
      {/* Lokal ishlab chiqishda: bu yerdagi o'zgarishlar (masalan, parol tiklash) itxiva.uz ga ta'sir qilmaydi */}
      {process.env.NODE_ENV !== "production" && (
        <div className="bg-amber-400 text-amber-950 text-xs font-bold text-center px-3 py-1.5">
          LOKAL TEST BAZASI — bu yerdagi o&apos;zgarishlar itxiva.uz saytiga ta&apos;sir qilmaydi
        </div>
      )}

      {/* Sticky Top Header */}
      <Header user={session} />

      {/* Main body with sticky desktop sidebar */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <DesktopNav user={session} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 md:pb-8 max-w-5xl w-full">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav role={session.role} />
    </div>
  );
}
