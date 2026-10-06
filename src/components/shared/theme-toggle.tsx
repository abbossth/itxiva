"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function ThemeToggle({ className }: { className?: string }) {
  const isMounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      return "dark";
    }
    return "light";
  });

  // Tema boshqa joydan (buyruqlar palitrasi) almashtirilsa, tugma belgisi ham yangilanadi
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    window.addEventListener("itxiva:theme", sync);
    return () => window.removeEventListener("itxiva:theme", sync);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  if (!isMounted) {
    return (
      <div className={cn("w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800", className)} />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={cn(
        "relative p-2 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center",
        "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200",
        "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500",
        className
      )}
      aria-label={theme === "light" ? "Qorong'i rejimga o'tish" : "Yorug' rejimga o'tish"}
    >
      {theme === "light" ? (
        <Moon className="w-5 h-5 transition-transform" />
      ) : (
        <Sun className="w-5 h-5 text-amber-400 transition-transform" />
      )}
    </button>
  );
}
