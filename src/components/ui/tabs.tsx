"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextType {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const TabsContext = React.createContext<TabsContextType | null>(null);

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (val: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalTab, setInternalTab] = React.useState(defaultValue || "");
  const activeTab = value !== undefined ? value : internalTab;

  const setActiveTab = React.useCallback(
    (newVal: string) => {
      if (value === undefined) setInternalTab(newVal);
      onValueChange?.(newVal);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative w-full overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50",
          "overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth touch-pan-x",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger must be used inside Tabs");

  const isActive = ctx.activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.setActiveTab(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-xl px-4 py-2 text-xs sm:text-sm font-medium transition-all select-none cursor-pointer min-h-[38px] snap-start shrink-0",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500",
        isActive
          ? "bg-white dark:bg-[#131E32] text-teal-700 dark:text-teal-300 font-semibold shadow-xs"
          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsContent must be used inside Tabs");

  if (ctx.activeTab !== value) return null;

  return (
    <div role="tabpanel" tabIndex={0} className={cn("mt-4 focus:outline-hidden", className)}>
      {children}
    </div>
  );
}
