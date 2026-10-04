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
      {/* Sticky Top Header */}
      <Header user={session} />

      {/* Main body with desktop sidebar */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <DesktopNav role={session.role} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-5xl w-full">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav role={session.role} />
    </div>
  );
}
