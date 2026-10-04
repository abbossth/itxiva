import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  href?: string;
}

export function Logo({ className, size = "md", href = "/" }: LogoProps) {
  const dimensions = {
    sm: { icon: 28, text: "text-lg", sub: "text-[10px]" },
    md: { icon: 36, text: "text-xl", sub: "text-xs" },
    lg: { icon: 48, text: "text-2xl", sub: "text-sm" },
  }[size];

  const content = (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <div className="relative flex items-center justify-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 shadow-xs">
        <Image
          src="/icons/minaret.svg"
          alt="ITXiva Logotipi"
          width={dimensions.icon}
          height={dimensions.icon}
          priority
        />
      </div>
      <div className="flex flex-col">
        <span className={cn("font-bold tracking-tight text-itxiva-gradient leading-tight", dimensions.text)}>
          ITXiva
        </span>
        <span className={cn("text-slate-500 dark:text-slate-400 font-medium tracking-wide -mt-0.5", dimensions.sub)}>
          O&apos;quv platformasi
        </span>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}
