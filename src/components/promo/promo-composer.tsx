"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cancelPromoAction, createPromoAction } from "@/actions/promo.actions";
import {
  PROMO_COLORS,
  PROMO_EMOJIS,
  PROMO_KINDS,
  PROMO_MAX_DAYS,
  PROMO_PRICE_PER_DAY,
  PROMO_TEXT_MAX,
  PROMO_TITLE_MAX,
  promoPrice,
  type PromoKind,
  type PromoView,
} from "@/lib/promo";
import { cn } from "@/lib/utils";
import { PromoCard } from "./promo-card";

const STATUS: Record<PromoView["status"], { label: string; cls: string }> = {
  pending: { label: "Ustoz tasdiqlashini kutmoqda", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" },
  approved: { label: "Tasdiqlangan", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" },
  rejected: { label: "Rad etilgan", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" },
  cancelled: { label: "Bekor qilingan", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const fmt = (iso: string) => new Date(iso).toLocaleString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });

/** Do'kondagi "Bosh sahifada e'lon" bo'limi: joylash oynasi va o'z e'lonlari holati */
export function PromoComposer({ mine, balance, me }: { mine: PromoView[]; balance: number; me: { name: string; group: string | null } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PromoKind>("project");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [emoji, setEmoji] = useState("🚀");
  const [color, setColor] = useState<string>("violet");
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const price = promoPrice(days);
  const [now] = useState(() => Date.now());
  const busyPromo = mine.find((p) => p.status === "pending" || (p.status === "approved" && p.endsAt && new Date(p.endsAt).getTime() > now));

  const submit = async () => {
    setBusy(true);
    const r = await createPromoAction({ kind, title, text, link, emoji, color, days });
    setBusy(false);
    if (!r.success) return toast.error(r.message ?? "Xato");
    toast.success(r.message ?? "Yuborildi");
    setOpen(false);
    setTitle("");
    setText("");
    setLink("");
    router.refresh();
  };

  return (
    <section id="promo" className="scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/80 dark:bg-surface sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
          <Megaphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Bosh sahifada e&apos;lon</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            O&apos;zingiz, loyihangiz yoki e&apos;loningizni hammaning bosh sahifasiga chiqaring — kuniga {PROMO_PRICE_PER_DAY} coin
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={Boolean(busyPromo)} title={busyPromo ? "Avvalgi e'loningiz tugashini kuting" : undefined}>
          Joylashtirish
        </Button>
      </div>

      {mine.length > 0 && (
        <ul className="mt-4 space-y-2">
          {mine.slice(0, 4).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 px-3 py-2 text-sm dark:border-slate-800">
              <span className="min-w-0 flex-1 basis-40 truncate font-semibold">
                {p.emoji} {p.title}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[p.status].cls)}>
                {p.status === "approved" && p.startsAt && new Date(p.startsAt).getTime() > now
                  ? `Navbatda · ${fmt(p.startsAt)} dan`
                  : p.status === "approved" && p.endsAt
                    ? new Date(p.endsAt).getTime() > now
                      ? `Ko'rinmoqda · ${fmt(p.endsAt)} gacha`
                      : "Tugagan"
                    : STATUS[p.status].label}
              </span>
              {p.status === "rejected" && p.note && <span className="w-full text-xs text-rose-600">Sabab: {p.note}</span>}
              {p.status === "pending" && (
                <button
                  onClick={async () => {
                    const r = await cancelPromoAction(p.id);
                    if (!r.success) return toast.error(r.message ?? "Xato");
                    toast.success(r.message ?? "Bekor qilindi");
                    router.refresh();
                  }}
                  className="inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-3.5 w-3.5" /> Bekor qilish
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Bosh sahifada e'lon" maxWidth="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Turi">
            {PROMO_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => {
                  setKind(k.id);
                  setEmoji(k.emoji);
                }}
                className={cn(
                  "min-h-[40px] cursor-pointer rounded-xl px-3 text-sm font-semibold",
                  kind === k.id ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                )}
              >
                {k.emoji} {k.label}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Sarlavha</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={PROMO_TITLE_MAX}
              placeholder={kind === "project" ? "Masalan: Python'da Telegram bot yasadim" : kind === "me" ? "Masalan: Robototexnikaga sherik izlayapman" : "Masalan: Shanba kuni futbol!"}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
              Matn <span className="font-normal">{text.length}/{PROMO_TEXT_MAX}</span>
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={PROMO_TEXT_MAX}
              rows={3}
              placeholder="Qisqacha: nima qildingiz, kim kerak, qachon…"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Havola (ixtiyoriy)</span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={300}
              inputMode="url"
              placeholder="https://github.com/… yoki t.me/…"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Belgi va rang</span>
            <div className="flex flex-wrap gap-1">
              {PROMO_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  aria-label={`Belgi ${e}`}
                  aria-pressed={emoji === e}
                  className={cn("h-10 w-10 cursor-pointer rounded-xl text-xl", emoji === e ? "bg-teal-100 ring-2 ring-teal-500 dark:bg-teal-500/20" : "hover:bg-slate-100 dark:hover:bg-slate-800")}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {PROMO_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  aria-label={`Rang ${c.id}`}
                  aria-pressed={color === c.id}
                  className={cn("h-9 w-9 cursor-pointer rounded-full", color === c.id && "ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900")}
                  style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Ko&apos;rinish</span>
            <PromoCard p={{ kind, title, text, link: link ? (/^https?:\/\//i.test(link) ? link : `https://${link}`) : null, emoji, color, author: me.name, group: me.group }} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Muddat:</span>
            {Array.from({ length: PROMO_MAX_DAYS }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={cn(
                  "min-h-[40px] cursor-pointer rounded-xl px-3 text-sm font-semibold",
                  days === d ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                )}
              >
                {d} kun · {promoPrice(d)} 🪙
              </button>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Ustoz tasdiqlagach chiqadi (odobga zid e&apos;lonlar rad etiladi va coin qaytariladi). Bir vaqtda {""}
            ko&apos;pi bilan 3 ta e&apos;lon ko&apos;rinadi — joy bo&apos;lmasa navbatga turadi. Balans: <b>{balance}</b> coin.
          </p>
          <Button className="w-full" isLoading={busy} disabled={title.trim().length < 3 || balance < price} onClick={() => void submit()}>
            {balance < price ? `Coin yetmaydi (${price} kerak)` : `Yuborish · ${price} coin`}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
