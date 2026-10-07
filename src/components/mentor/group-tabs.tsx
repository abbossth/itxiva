"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCode, Users } from "lucide-react";
import { NavPending } from "@/components/layout/nav-pending";
import { cn } from "@/lib/utils";

/** Guruh sahifasidagi tablar: O'quvchilar / Davomat (ko'rinishi SectionTabs bilan bir xil) */
export function GroupTabs({ groupId, activeSessionId }: { groupId: string; activeSessionId?: string | null }) {
  const pathname = usePathname();
  const base = `/mentor/groups/${groupId}`;
  const tabs = [
    { href: base, label: "O'quvchilar", icon: Users, isActive: pathname === base },
    { href: `${base}/attendance`, label: "Davomat", icon: QrCode, isActive: pathname.startsWith(`${base}/attendance`) },
  ];

  return (
    <nav
      aria-label="Guruh bo'limlari"
      className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="flex items-center gap-1 min-w-max">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2 px-3 sm:px-4 min-h-[40px] -mb-px border-b-2 text-sm font-semibold whitespace-nowrap rounded-t-lg transition-colors",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500",
                tab.isActive
                  ? "border-teal-600 dark:border-teal-400 text-teal-700 dark:text-teal-300"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", tab.isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400")} />
              <span>{tab.label}</span>
              {tab.label === "Davomat" && activeSessionId && (
                <span className="flex items-center gap-1 rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
                  ochiq
                </span>
              )}
              <NavPending />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
