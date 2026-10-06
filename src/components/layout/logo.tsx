import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Qavslar ikki yondan, minora pastdan chiqib keladi (login va sidebar uchun) */
  animated?: boolean;
  title?: string;
}

/**
 * ITXiva belgisi: kod qavslari `< >` orasida Xiva minorasi.
 * Qavslar joriy matn rangida (yorug'/qorong'i rejimga o'zi moslashadi), minora — firuza accent.
 */
export function LogoMark({ size = 32, className, animated = false, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", animated && "logo-animated", className)}
    >
      <g className="logo-bracket-left" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 15 5 24l9 9" />
      </g>
      <g className="logo-bracket-right" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="m34 15 9 9-9 9" />
      </g>
      <g className="logo-tower">
        {/* Gumbaz */}
        <path d="M21.2 12c0-2.8 1.3-5 2.8-6.5 1.5 1.5 2.8 3.7 2.8 6.5Z" fill="var(--color-teal-500)" />
        {/* Ayvon halqasi */}
        <rect x="19" y="12.5" width="10" height="3" rx="1.5" fill="var(--color-teal-500)" />
        {/* Minora tanasi (pastga kengayadi) */}
        <path d="M20.6 16.5h6.8L29.6 39H18.4Z" fill="var(--color-teal-500)" />
        {/* Koshin belbog'lari */}
        <path d="M19.8 24h8.4M19 32h10" stroke="var(--logo-band, var(--color-bg))" strokeWidth="1.8" />
        {/* Poydevor */}
        <rect x="15.5" y="39" width="17" height="3" rx="1.5" fill="var(--color-teal-500)" />
      </g>
    </svg>
  );
}

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  href?: string;
  animated?: boolean;
  /** Faqat belgi (yig'ilgan sidebar uchun) */
  markOnly?: boolean;
}

export function Logo({ className, size = "md", href = "/", animated = false, markOnly = false }: LogoProps) {
  const dimensions = {
    sm: { icon: 30, text: "text-lg", sub: "text-[10px]" },
    md: { icon: 38, text: "text-xl", sub: "text-xs" },
    lg: { icon: 52, text: "text-3xl", sub: "text-sm" },
  }[size];

  const content = (
    <div className={cn("flex items-center gap-2.5 select-none text-slate-900 dark:text-slate-100", className)}>
      <LogoMark size={dimensions.icon} animated={animated} title={markOnly ? "ITXiva" : undefined} />
      {!markOnly && (
        <div className={cn("flex flex-col", animated && "logo-wordmark")}>
          <span className={cn("font-display font-extrabold leading-none", dimensions.text)}>
            IT<span className="text-teal-600 dark:text-teal-400">Xiva</span>
          </span>
          <span className={cn("text-slate-500 dark:text-slate-400 font-medium tracking-wide mt-0.5", dimensions.sub)}>
            O&apos;quv platformasi
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} aria-label="ITXiva — bosh sahifa" className="inline-block transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}
