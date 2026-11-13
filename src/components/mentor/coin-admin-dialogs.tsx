"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Sparkles, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { editCoinEntryAction, grantCoinsAction } from "@/actions/coin-admin.actions";
import { cn } from "@/lib/utils";

// Mentor oynalari: o'quvchiga coin/XP berish va xato yozilgan coin/XP ni tuzatish (o'zgartirish yoki bekor qilish).

const PRESETS = [5, 10, 20, 50, 100];
const REASONS = ["Darsda faol qatnashgani uchun", "Musobaqa g'olibi", "Xato yechilgan coin qaytarildi", "Qo'shimcha topshiriq"];

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export function GrantCoinsDialog({
  students,
  open,
  onOpenChange,
  onDone,
}: {
  students: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Muvaffaqiyatdan keyin (ro'yxatni yangilash uchun): har o'quvchi uchun coin va XP o'zgarishi */
  onDone?: (r: { coin: number; xp: number; ids: string[] }) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<"give" | "take">("give");
  const [amount, setAmount] = useState("10");
  const [xpMode, setXpMode] = useState<"same" | "custom" | "none">("same");
  const [xpValue, setXpValue] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // Oyna ochilganda bitta kalit: ikki marta bosilsa ham bir marta yoziladi
  const [requestId, setRequestId] = useState(newRequestId);

  const n = Math.max(0, Math.round(Number(amount) || 0));
  const coin = mode === "give" ? n : -n;
  const xp = mode === "take" ? 0 : xpMode === "same" ? n : xpMode === "none" ? 0 : Math.max(0, Math.round(Number(xpValue) || 0));
  const valid = (coin !== 0 || xp !== 0) && reason.trim().length >= 3;

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setRequestId(newRequestId());
      setReason("");
    }
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await grantCoinsAction({ studentIds: students.map((s) => s.id), coin, xp, reason, requestId });
      if (res.success) {
        toast.success(res.message ?? "Saqlandi");
        onDone?.({ coin, xp, ids: res.data.appliedIds });
        close(false);
        router.refresh();
      } else toast.error(res.message);
    } catch {
      toast.error("Internet aloqasi uzildi — qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  const who = students.length === 1 ? students[0].name : `${students.length} ta o'quvchi`;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md p-4 sm:p-6">
        <DialogHeader className="mb-4 space-y-1">
          <DialogTitle>Coin berish</DialogTitle>
          <DialogDescription>{who}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ["give", "Berish"],
                ["take", "Olib qo'yish"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={cn(
                  "min-h-[40px] cursor-pointer rounded-lg text-sm font-bold",
                  mode === id ? (id === "give" ? "bg-white text-emerald-700 shadow-xs dark:bg-surface dark:text-emerald-300" : "bg-white text-rose-700 shadow-xs dark:bg-surface dark:text-rose-300") : "text-slate-600 dark:text-slate-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="Coin miqdori" htmlFor="grant-amount">
            <Input id="grant-amount" type="number" inputMode="numeric" min={0} max={5000} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(String(p))}
                  className={cn(
                    "min-h-[36px] cursor-pointer rounded-lg px-3 text-xs font-bold",
                    n === p ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                  )}
                >
                  {mode === "give" ? "+" : "−"}
                  {p}
                </button>
              ))}
            </div>
          </Field>

          {mode === "give" && (
            <Field label="XP (tajriba, daraja uchun)">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["same", "Coin bilan teng"],
                    ["custom", "Boshqa miqdor"],
                    ["none", "XP bermaslik"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={xpMode === id}
                    onClick={() => setXpMode(id)}
                    className={cn(
                      "min-h-[36px] cursor-pointer rounded-lg px-3 text-xs font-bold",
                      xpMode === id ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {xpMode === "custom" && (
                <Input type="number" inputMode="numeric" min={0} max={5000} value={xpValue} onChange={(e) => setXpValue(e.target.value)} aria-label="XP miqdori" className="mt-1.5" />
              )}
            </Field>
          )}
          {mode === "take" && <p className="text-xs text-slate-500 dark:text-slate-400">Balansdan olinadi (balans yetmasa — o&apos;tkazib yuboriladi). XP o&apos;zgarmaydi.</p>}

          <Field label="Sabab (o'quvchi ham ko'radi)" htmlFor="grant-reason" required>
            <Input id="grant-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: darsda faol qatnashgani uchun" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className="min-h-[32px] cursor-pointer rounded-lg bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                  {r}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter className="pt-4">
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            Bekor qilish
          </Button>
          <Button variant={mode === "give" ? "primary" : "danger"} onClick={submit} disabled={!valid} isLoading={busy} className="gap-1.5">
            <Coins className="h-4 w-4" />
            {mode === "give" ? `${coin ? `+${coin} coin` : ""}${coin && xp ? " · " : ""}${xp ? `+${xp} XP` : ""}` || "Berish" : `${coin} coin`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface EditableEntry {
  id: string;
  amount: number;
  xp: number;
  description: string;
}

export function EditCoinEntryDialog({ entry, onOpenChange }: { entry: EditableEntry | null; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [coin, setCoin] = useState("");
  const [xp, setXp] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // Yangi yozuv ochilganda — uning qiymatlari bilan
  if (entry && shownFor !== entry.id) {
    setShownFor(entry.id);
    setCoin(String(entry.amount));
    setXp(String(entry.xp));
    setReason("");
  }

  const save = async (voiding: boolean) => {
    if (!entry || busy) return;
    const c = voiding ? 0 : Math.round(Number(coin) || 0);
    const x = voiding ? 0 : Math.max(0, Math.round(Number(xp) || 0));
    setBusy(true);
    try {
      const res = await editCoinEntryAction({ entryId: entry.id, coin: c, xp: x, reason: reason.trim() || (voiding ? "Xato yozilgan" : "") });
      if (res.success) {
        toast.success(res.message ?? "Saqlandi");
        onOpenChange(false);
        router.refresh();
      } else toast.error(res.message);
    } catch {
      toast.error("Internet aloqasi uzildi — qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-6">
        <DialogHeader className="mb-4 space-y-1">
          <DialogTitle>Coin yozuvini tuzatish</DialogTitle>
          <DialogDescription className="break-words">{entry?.description}</DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Coin" htmlFor="edit-coin" hint={`Hozir: ${entry.amount > 0 ? "+" : ""}${entry.amount}`}>
                <Input id="edit-coin" type="number" inputMode="numeric" min={-5000} max={5000} value={coin} onChange={(e) => setCoin(e.target.value)} />
              </Field>
              <Field label="XP" htmlFor="edit-xp" hint={`Hozir: ${entry.xp}`}>
                <Input id="edit-xp" type="number" inputMode="numeric" min={0} max={5000} value={xp} onChange={(e) => setXp(e.target.value)} />
              </Field>
            </div>
            <Field label="Sabab" htmlFor="edit-reason" required>
              <Input id="edit-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: jarima xato yozilgan" />
            </Field>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Farq o&apos;quvchi balansi va XP siga qo&apos;shiladi yoki ayiriladi. Yozuv tarixda qoladi (tuzatilgan deb belgilanadi), tizim uni qayta yozmaydi.
            </p>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2 pt-4">
          <Button variant="danger" onClick={() => save(true)} disabled={busy || !entry || (entry.amount === 0 && entry.xp === 0)} className="mr-auto gap-1.5">
            <Undo2 className="h-4 w-4" /> To&apos;liq bekor qilish
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Yopish
          </Button>
          <Button onClick={() => save(false)} disabled={busy || reason.trim().length < 3} isLoading={busy} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
