"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Flame, Gamepad2, Gem, Heart, Plus, Swords, Users } from "lucide-react";
import Link from "@/components/ui/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { createLiveGameAction, getLiveGameSetupAction, type LiveGameListItem, type LiveGroupOption } from "@/actions/live-game.actions";
import { LIVE_MODES } from "@/lib/live-game/modes";
import type { LiveGameMode, LiveGameSource } from "@/lib/db/models/live-game.model";
import { cn, formatDateTimeUz } from "@/lib/utils";

export const MODE_ICONS: Record<LiveGameMode, typeof Flame> = { classic: Flame, survival: Heart, chest: Gem, team: Swords };
export const MODE_COLORS: Record<LiveGameMode, string> = {
  classic: "from-orange-500 to-rose-600",
  survival: "from-rose-500 to-red-700",
  chest: "from-amber-400 to-yellow-600",
  team: "from-sky-500 to-indigo-600",
};

const STATUS_LABEL = { lobby: "Kutish zali", question: "Savol", reveal: "Natija", finished: "Yakunlangan" } as const;

export function LiveGamesManager({ games }: { games: LiveGameListItem[] }) {
  const [open, setOpen] = useState(false);
  const active = games.filter((g) => g.status !== "finished");
  const past = games.filter((g) => g.status === "finished");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            <Gamepad2 className="h-6 w-6 text-teal-600 dark:text-teal-400" /> Jonli o&apos;yin
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Sinfda proyektorda o&apos;yin oching — o&apos;quvchilar telefondan qo&apos;shiladi va bir vaqtda javob beradi.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="min-h-[48px] gap-2 text-base font-bold">
          <Plus className="h-5 w-5" /> Yangi o&apos;yin
        </Button>
      </div>

      {active.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Hozir ochiq</h2>
          {active.map((g) => (
            <GameRow key={g.id} game={g} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Oxirgi o&apos;yinlar</h2>
        {past.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Hali o&apos;yin o&apos;tkazilmagan. &quot;Yangi o&apos;yin&quot; ni bosing.
          </p>
        ) : (
          past.map((g) => <GameRow key={g.id} game={g} />)
        )}
      </section>

      {open && <CreateLiveGameDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function GameRow({ game }: { game: LiveGameListItem }) {
  const Icon = MODE_ICONS[game.mode];
  const live = game.status !== "finished";
  return (
    <Link
      href={`/mentor/live/${game.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-white p-3 transition-colors hover:border-teal-500/50 dark:bg-surface sm:p-4",
        live ? "border-teal-500/50 ring-1 ring-teal-500/20" : "border-slate-200/80 dark:border-slate-800/80"
      )}
    >
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", MODE_COLORS[game.mode])}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
          {LIVE_MODES[game.mode].title} · {game.groupName}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{formatDateTimeUz(game.createdAt)}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {game.players}
          </span>
          <span>{game.questions} savol</span>
          {game.winner && (
            <span className="inline-flex items-center gap-1">
              <Crown className="h-3.5 w-3.5 text-amber-500" /> {game.winner}
            </span>
          )}
        </span>
      </span>
      <Badge variant={live ? "teal" : "secondary"}>{STATUS_LABEL[game.status]}</Badge>
    </Link>
  );
}

function CreateLiveGameDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [groups, setGroups] = useState<LiveGroupOption[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [mode, setMode] = useState<LiveGameMode>("classic");
  const [source, setSource] = useState<LiveGameSource>("today");
  const [count, setCount] = useState(10);
  const [teams, setTeams] = useState(2);
  const [prizes, setPrizes] = useState([30, 20, 10]);
  const [saving, setSaving] = useState(false);

  // Guruhlar va ulardagi savollar soni oyna ochilganda bir marta olinadi
  useEffect(() => {
    let alive = true;
    void getLiveGameSetupAction().then((res) => {
      if (!alive) return;
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setGroups(res.data.groups);
      const first = res.data.groups.find((g) => g.today > 0) ?? res.data.groups.find((g) => g.all > 0) ?? res.data.groups[0];
      if (first) {
        setGroupId(first.id);
        setSource(first.today > 0 ? "today" : "all");
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const group = groups?.find((g) => g.id === groupId);
  const available = group ? (source === "today" ? group.today : group.all) : 0;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await createLiveGameAction({ groupId, mode, source, count, teams, prizes });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      if (res.data.existing) toast.info("Bu guruhda o'yin allaqachon ochiq — o'sha ochildi");
      router.push(`/mentor/live/${res.data.gameId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Yangi jonli o'yin" maxWidth="xl">
      {!groups ? (
        <p className="py-10 text-center text-sm text-slate-500">Yuklanmoqda…</p>
      ) : (
        <div className="space-y-5">
          <Field label="Guruh">
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} {g.activeGameId ? "· o'yin ochiq" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="O'yin turi">
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(LIVE_MODES) as LiveGameMode[]).map((m) => {
                const Icon = MODE_ICONS[m];
                const on = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={on}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-2xl border-2 p-3 text-left transition-colors",
                      on ? "border-teal-500 bg-teal-500/10" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                    )}
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", MODE_COLORS[m])}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-slate-900 dark:text-slate-100">{LIVE_MODES[m].title}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{LIVE_MODES[m].tagline}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-400">
              {LIVE_MODES[mode].rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Field>

          {mode === "team" && (
            <Field label="Jamoalar soni">
              <Segmented value={teams} options={[2, 3, 4]} onChange={setTeams} />
            </Field>
          )}

          <Field label="Savollar">
            <div className="grid gap-2 sm:grid-cols-2">
              {(["today", "all"] as LiveGameSource[]).map((s) => {
                const n = s === "today" ? group?.today ?? 0 : group?.all ?? 0;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={n === 0}
                    onClick={() => setSource(s)}
                    aria-pressed={source === s}
                    className={cn(
                      "cursor-pointer rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      source === s ? "border-teal-500 bg-teal-500/10" : "border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      {s === "today" ? "Bugungi dars testi" : "Barcha testlardan aralash"}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {n > 0 ? `${n} ta savol bor` : s === "today" ? "Bugungi darsda test yo'q" : "Testlar yo'q"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>Nechta savol:</span>
              <Segmented value={count} options={[5, 10, 15, 20]} onChange={setCount} />
            </div>
            {available > 0 && available < count && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Faqat {available} ta savol bor — hammasi tasodifiy tartibda tushadi.</p>
            )}
          </Field>

          <Field label={mode === "team" ? "Mukofot (g'olib jamoaning har a'zosiga)" : "Mukofot: 1 / 2 / 3-o'rin (coin)"}>
            <div className="flex gap-2">
              {(mode === "team" ? [0] : [0, 1, 2]).map((i) => (
                <input
                  key={i}
                  type="number"
                  min={0}
                  max={500}
                  value={prizes[i]}
                  onChange={(e) => setPrizes((p) => p.map((v, j) => (j === i ? Number(e.target.value) || 0 : v)))}
                  className="w-24 min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-center font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                  aria-label={`${i + 1}-o'rin coin`}
                />
              ))}
            </div>
          </Field>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Bekor qilish
            </Button>
            <Button onClick={submit} isLoading={saving} disabled={!groupId || available === 0} className="gap-2">
              <Gamepad2 className="h-4 w-4" />
              {group?.activeGameId ? "Ochiq o'yinga o'tish" : "O'yinni ochish"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn(
            "min-h-[36px] min-w-[44px] cursor-pointer rounded-lg px-3 text-sm font-bold",
            value === o ? "bg-white text-teal-700 shadow-xs dark:bg-surface dark:text-teal-300" : "text-slate-600 dark:text-slate-400"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
