"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateGamificationSettingsAction } from "@/actions/settings.actions";
import type { CoinEconomy } from "@/actions/economy.actions";
import { cn, formatNumberUz } from "@/lib/utils";
import { ColumnHeader, TableFilterBar, useTableControls, type ColumnDef } from "@/components/ui/table-controls";

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5";

function months(m: number | null): string {
  if (m === null) return "—";
  if (m < 1) return `~${Math.max(1, Math.round(m * 30))} kun`;
  return `~${(Math.round(m * 2) / 2).toString().replace(".", ",")} oy`;
}

const monthsTone = (m: number | null) =>
  m === null || m > 3 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : m > 2 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

/** Arzon, lekin qadrli imtiyozlar (dizayn bo'yicha taklif) */
const PRIVILEGE_IDEAS = [
  { title: "Mentor bilan 15 daqiqa 1:1 kod ko'rib chiqish", price: 80 },
  { title: "Loyihangni darsda proyektorda ko'rsatish", price: 60 },
  { title: "Guruh kanalida «Hafta yulduzi» e'loni", price: 40 },
  { title: "Seriya himoyasi (bir kun o'tkazib yuborish)", price: 30 },
];

const PLAN_COLORS = ["bg-teal-600", "bg-cyan-400", "bg-amber-500", "bg-slate-400"];

export function CoinEconomyView({ data }: { data: CoinEconomy }) {
  const router = useRouter();
  const { toast } = useToast();
  const [target, setTarget] = useState(data.settings.monthlyCoinTarget);
  const [limits, setLimits] = useState({
    quizDailyCap: data.settings.quizDailyCap,
    mentorBonusMax: data.settings.mentorBonusMax,
    levelUpBonus: data.settings.levelUpBonus,
  });
  const [saving, setSaving] = useState<"plan" | "limits" | null>(null);

  const attendance = data.plan.lessonsPerMonth * data.plan.attendanceCoins;
  const login = data.plan.loginDays * data.plan.loginCoins;
  const daily = data.plan.dailyQuestDays * data.plan.dailyQuestCoins;
  const rest = Math.max(0, target - attendance - login - daily);
  const planRows = [
    { label: "Davomat", hint: `${data.plan.lessonsPerMonth} dars × ${data.plan.attendanceCoins}`, value: attendance },
    { label: "Kunlik kirish", hint: `~${data.plan.loginDays} kun × ${data.plan.loginCoins}`, value: login },
    { label: "Kunlik topshiriqlar", hint: `~${data.plan.dailyQuestDays} kun × ${data.plan.dailyQuestCoins}`, value: daily },
    { label: "Asosiy topshiriq va marralar", hint: "o'rtacha", value: rest },
  ];
  const planTotal = planRows.reduce((s, r) => s + r.value, 0) || 1;
  const maxSource = Math.max(1, ...data.sources.map((s) => s.amount));
  const expensive = data.products.filter((p) => p.kind !== "streak_shield").slice(-1)[0];

  const save = async (kind: "plan" | "limits") => {
    try {
      setSaving(kind);
      const res = await updateGamificationSettingsAction({
        ...data.settings,
        ...(kind === "plan" ? { monthlyCoinTarget: target } : limits),
      });
      if (res.success) {
        toast.success("Saqlandi");
        router.refresh();
      } else toast.error(res.message || "Saqlab bo'lmadi");
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Coin iqtisodiyoti</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Coin qanchalik tez yig&apos;iladi va do&apos;kon narxlari bilan muvozanat</p>
        </div>
        <nav aria-label="Davr" className="inline-flex gap-1 self-start rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-1">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/mentor/reports/economy?days=${d}`}
              aria-current={data.days === d ? "page" : undefined}
              className={cn("min-h-[40px] rounded-xl px-3.5 text-sm font-semibold inline-flex items-center", data.days === d ? "bg-white dark:bg-surface text-slate-900 dark:text-slate-100 shadow-xs" : "text-slate-600 dark:text-slate-400")}
            >
              {d} kun
            </Link>
          ))}
        </nav>
      </div>

      {data.warning && data.cheapest && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 sm:flex-row sm:items-center">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1 text-sm text-rose-900 dark:text-rose-200">
            <div className="font-bold">Do&apos;kon narxlari hozirgi daromadga nisbatan juda yuqori</div>
            O&apos;rtacha o&apos;quvchi 30 kunda <b>~{data.perStudentMonthly} coin</b> oladi. {data.cheapest.title} ({data.cheapest.price}) uchun <b>{months(data.products.find((p) => p.title === data.cheapest!.title)?.monthsNow ?? null)}</b>
            {expensive && expensive.title !== data.cheapest.title && (
              <>
                , {expensive.title} ({expensive.price}) uchun <b>{months(expensive.monthsNow)}</b>
              </>
            )}{" "}
            kerak. Bunday maqsad uzoq bo&apos;lsa, coin rag&apos;batlantirmay qo&apos;yadi.
          </div>
          <a href="#plan" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
            Rejani ko&apos;rish
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Berilgan coin", formatNumberUz(data.given), `oxirgi ${data.days} kun`, ""],
          ["O'quvchi boshiga", `~${data.perStudentMonthly}`, `oyiga · maqsad ~${data.settings.monthlyCoinTarget}`, data.perStudentMonthly < data.settings.monthlyCoinTarget / 2 ? "text-rose-600" : ""],
          ["Do'konda sarflangan", formatNumberUz(data.spent), data.spent ? `oxirgi ${data.days} kun` : "hali buyurtma yo'q", ""],
          ["Eng ko'p yig'gan", formatNumberUz(data.topEarner), data.cheapest ? `eng arzon mahsulot ${data.cheapest.price}` : "do'kon bo'sh", ""],
        ].map(([label, value, hint, tone]) => (
          <div key={label} className={card}>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</div>
            <div className={cn("mt-1 font-mono text-3xl font-black tabular-nums text-slate-900 dark:text-slate-100", tone)}>{value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="sources">
          <h2 id="sources" className="font-bold text-slate-900 dark:text-slate-100">Coin qayerdan keladi</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Oxirgi {data.days} kun · manbalar bo&apos;yicha</p>
          {data.sources.length === 0 ? (
            <p className="text-sm text-slate-500">Bu davrda coin berilmagan.</p>
          ) : (
            <ul className="space-y-3">
              {data.sources.map((s) => (
                <li key={s.type}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{s.label}</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatNumberUz(s.amount)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(2, (s.amount / maxSource) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card} aria-labelledby="reach">
          <h2 id="reach" className="font-bold text-slate-900 dark:text-slate-100">Mahsulotga yetish vaqti</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">O&apos;rtacha o&apos;quvchi necha oyda yig&apos;adi</p>
          {data.products.length === 0 ? (
            <p className="text-sm text-slate-500">Do&apos;konda faol mahsulot yo&apos;q.</p>
          ) : (
            <ProductsTable products={data.products} />
          )}
          <div className="mt-4 rounded-xl bg-teal-500/10 p-3">
            <div className="mb-1.5 text-sm font-bold text-teal-800 dark:text-teal-200">Arzon, lekin qadrli imtiyozlar qo&apos;shing</div>
            <ul className="space-y-1">
              {PRIVILEGE_IDEAS.map((i) => (
                <li key={i.title} className="flex justify-between gap-3 text-sm text-slate-700 dark:text-slate-300">
                  {i.title}
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{i.price}</span>
                </li>
              ))}
            </ul>
            <Link href="/mentor/shop" className="mt-2 inline-block text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline">
              Do&apos;konga imtiyoz qo&apos;shish →
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section id="plan" className={cn(card, "scroll-mt-24 space-y-4")} aria-labelledby="plan-title">
          <div>
            <h2 id="plan-title" className="font-bold text-slate-900 dark:text-slate-100">Maqsadli reja</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Faol o&apos;quvchi bir oyda qancha coin yig&apos;ishi kerak</p>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <label htmlFor="plan-target" className="font-semibold text-slate-800 dark:text-slate-200">
                Oylik maqsad
              </label>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{target} coin</span>
            </div>
            <input id="plan-target" type="range" min={50} max={500} step={10} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-teal-600" />
          </div>
          <div className="flex h-3 overflow-hidden rounded-full">
            {planRows.map((r, i) => (
              <div key={r.label} className={cn(PLAN_COLORS[i], i > 0 && "border-l-2 border-white dark:border-surface")} style={{ width: `${(r.value / planTotal) * 100}%` }} />
            ))}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {planRows.map((r, i) => (
              <li key={r.label} className="flex items-center gap-3 py-2 text-sm">
                <span className={cn("h-3 w-3 rounded", PLAN_COLORS[i])} />
                <span className="flex-1 font-semibold text-slate-800 dark:text-slate-200">{r.label}</span>
                <span className="text-xs text-slate-500">{r.hint}</span>
                <span className="w-10 text-right font-mono font-bold text-slate-900 dark:text-slate-100">{r.value}</span>
              </li>
            ))}
          </ul>
          <Button onClick={() => save("plan")} isLoading={saving === "plan"} disabled={saving !== null || target === data.settings.monthlyCoinTarget} className="w-full">
            Mukofotlarni shu rejaga moslash
          </Button>
        </section>

        <section className={cn(card, "space-y-1")} aria-labelledby="inflation">
          <h2 id="inflation" className="font-bold text-slate-900 dark:text-slate-100">Inflyatsiyadan himoya</h2>
          <p className="pb-2 text-xs text-slate-500 dark:text-slate-400">Coin &quot;arzonlashib&quot; ketmasligi uchun cheklovlar</p>
          {(
            [
              ["quizDailyCap", "Testlardan kuniga ko'pi bilan"],
              ["mentorBonusMax", "Mentor bonusi bir martada ko'pi bilan"],
              ["levelUpBonus", "Yangi darajaga chiqqanda bonus"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 py-2.5">
              <label htmlFor={`lim-${key}`} className="text-sm text-slate-800 dark:text-slate-200">
                {label}
              </label>
              <span className="flex items-center gap-1.5 text-sm text-slate-500">
                <Input
                  id={`lim-${key}`}
                  type="number"
                  min={0}
                  value={limits[key]}
                  onChange={(e) => setLimits((l) => ({ ...l, [key]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                  className="w-20 text-center font-mono"
                />
                coin
              </span>
            </div>
          ))}
          {["Har savolga faqat birinchi to'g'ri javob hisoblanadi", "Do'kon xaridi reytingni tushirmaydi"].map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 py-2.5 text-sm text-slate-800 dark:text-slate-200">
              {t}
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                doim
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Coins className="h-3.5 w-3.5" />
              Qolgan chegaralar —{" "}
              <Link href="/mentor/settings?tab=gamification" className="font-semibold text-teal-700 dark:text-teal-400 hover:underline">
                sozlamalarda
              </Link>
            </span>
            <Button onClick={() => save("limits")} isLoading={saving === "limits"} disabled={saving !== null}>
              Saqlash
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

type ProductRow = CoinEconomy["products"][number];
const PRODUCT_COLUMNS: ColumnDef<ProductRow>[] = [
  { key: "title", label: "Mahsulot", value: (p) => p.title, filter: "text" },
  { key: "price", label: "Narx", value: (p) => p.price },
  { key: "monthsNow", label: "Hozir", value: (p) => p.monthsNow },
  { key: "monthsPlan", label: "Reja bilan", value: (p) => p.monthsPlan },
];

/** Mahsulotlar: o'rtacha o'quvchi necha oyda yig'adi (hozir va reja bilan) — ustun bo'yicha saralash/filtr */
function ProductsTable({ products }: { products: ProductRow[] }) {
  const table = useTableControls(products, PRODUCT_COLUMNS);
  return (
    <>
      <TableFilterBar table={table} className="mb-1" />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="py-1.5 font-bold"><ColumnHeader table={table} column="title">Mahsulot</ColumnHeader></th>
            <th className="py-1.5 text-right font-bold"><ColumnHeader table={table} column="price" align="right">Narx</ColumnHeader></th>
            <th className="py-1.5 text-right font-bold"><ColumnHeader table={table} column="monthsNow" align="right">Hozir</ColumnHeader></th>
            <th className="py-1.5 text-right font-bold"><ColumnHeader table={table} column="monthsPlan" align="right">Reja bilan</ColumnHeader></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {table.rows.map((p) => (
            <tr key={p.title}>
              <td className="py-2 font-semibold text-slate-900 dark:text-slate-100">{p.title}</td>
              <td className="py-2 text-right font-mono font-bold text-amber-700 dark:text-amber-400">{p.price}</td>
              <td className="py-2 text-right">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", monthsTone(p.monthsNow))}>{months(p.monthsNow)}</span>
              </td>
              <td className="py-2 text-right">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", monthsTone(p.monthsPlan))}>{months(p.monthsPlan)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
