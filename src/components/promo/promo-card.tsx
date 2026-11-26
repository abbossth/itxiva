import { ExternalLink } from "lucide-react";
import { colorOfPromo, PROMO_KINDS, type PromoView } from "@/lib/promo";
import { cn } from "@/lib/utils";

/** Bosh sahifadagi e'lon kartochkasi (o'quvchi joylagan, ustoz tasdiqlagan) */
export function PromoCard({ p, className }: { p: Pick<PromoView, "kind" | "title" | "text" | "link" | "emoji" | "color" | "author" | "group">; className?: string }) {
  const c = colorOfPromo(p.color);
  const kind = PROMO_KINDS.find((k) => k.id === p.kind);
  let host = "";
  try {
    host = p.link ? new URL(p.link).hostname.replace(/^www\./, "") : "";
  } catch {}
  return (
    <article
      className={cn("relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl p-4 text-white shadow-md", className)}
      style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
    >
      <span aria-hidden className="pointer-events-none absolute -right-3 -top-4 select-none text-7xl opacity-25">
        {p.emoji}
      </span>
      <span className="w-fit rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        {kind?.emoji} {kind?.label ?? "E'lon"}
      </span>
      <h3 className="pr-10 text-base font-extrabold leading-snug [overflow-wrap:anywhere]">
        {p.emoji} {p.title || "Sarlavha"}
      </h3>
      {p.text && <p className="whitespace-pre-line text-sm leading-snug text-white/90 [overflow-wrap:anywhere]">{p.text}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="min-w-0 truncate text-xs font-semibold text-white/85">
          {p.author}
          {p.group ? ` · ${p.group}` : ""}
        </span>
        {p.link && (
          <a
            href={p.link}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-white/20 px-3 text-xs font-bold hover:bg-white/30"
          >
            {host || "Ochish"} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}
