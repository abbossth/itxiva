"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { MENTOR_LINKS, STUDENT_LINKS, isNavLinkActive } from "./nav-links";
import { NavPending } from "./nav-pending";

interface MobileNavProps {
  role: "mentor" | "student";
  ordersBadge?: number;
}

export function MobileNav({ role, ordersBadge = 0 }: MobileNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const links = role === "mentor" ? MENTOR_LINKS : STUDENT_LINKS;
  const primaryLinks = links.filter((l) => l.primary);
  const moreLinks = links.filter((l) => !l.primary);
  const isMoreActive = moreLinks.some((l) => isNavLinkActive(l.href, pathname));

  const itemClass = (isActive: boolean) =>
    cn(
      "relative flex flex-col items-center justify-center flex-1 h-full min-h-[48px] min-w-[48px] py-1 transition-all select-none active:scale-95 cursor-pointer",
      isActive
        ? "text-teal-700 dark:text-teal-300 font-bold"
        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
    );
  const iconWrapClass = (isActive: boolean) =>
    cn("relative p-1 rounded-xl transition-colors", isActive ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "");

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-[#0B1220]/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
        aria-label="Pastki mobil navigatsiya"
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {primaryLinks.map((link) => {
            const Icon = link.icon;
            const isActive = isNavLinkActive(link.href, pathname);
            return (
              <Link key={link.href} href={link.href} className={itemClass(isActive)}>
                <div className={iconWrapClass(isActive)}>
                  <Icon className="w-5 h-5 shrink-0" />
                  {link.badge === "orders" && ordersBadge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {ordersBadge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 leading-none">{link.shortLabel}</span>
                <NavPending className="absolute top-1 right-3" />
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={itemClass(isMoreActive)}
          >
            <div className={iconWrapClass(isMoreActive)}>
              <Menu className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Yana</span>
          </button>
        </div>
      </nav>

      <BottomSheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Boshqa bo'limlar">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {moreLinks.map((link) => {
            const Icon = link.icon;
            const isActive = isNavLinkActive(link.href, pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl text-sm font-semibold min-h-[52px] transition-colors border",
                  isActive
                    ? "bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-300"
                    : "border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <Icon className="w-5 h-5 shrink-0 text-teal-600 dark:text-teal-400" />
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
