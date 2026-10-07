"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENTOR_SECTIONS, isNavLinkActive, type NavBadges } from "./nav-links";
import { NavPending } from "./nav-pending";
import { cn } from "@/lib/utils";

/**
 * Bir necha sahifadan iborat bo'limlarda (Do'kon, Sozlamalar) sahifa tepasidagi tablar.
 * Sidebar'da bo'lim bitta havola bo'lib turadi, ichki sahifalar shu yerdan almashtiriladi.
 */
export function SectionTabs({ badges = {} }: { badges?: NavBadges }) {
  const pathname = usePathname();
  const section = MENTOR_SECTIONS.find((s) => s.tabs.some((t) => isNavLinkActive(t.href, pathname)));
  if (!section) return null;

  return (
    <nav
      aria-label={`${section.label} bo'limlari`}
      className="mb-4 -mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="flex items-center gap-1 min-w-max">
        <span className="hidden sm:block pr-3 mr-2 border-r border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {section.label}
        </span>
        {section.tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = isNavLinkActive(tab.href, pathname);
          const count = tab.badge ? badges[tab.badge] ?? 0 : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2 px-3 sm:px-4 min-h-[40px] -mb-px border-b-2 text-sm font-semibold whitespace-nowrap rounded-t-lg transition-colors",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500",
                isActive
                  ? "border-teal-600 dark:border-teal-400 text-teal-700 dark:text-teal-300"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400")} />
              <span>{tab.label}</span>
              {count > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold font-mono flex items-center justify-center">
                  {count}
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
