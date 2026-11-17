"use client";

import { useState } from "react";
import { IdCard, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  applyDocumentImportAction,
  previewDocumentImportAction,
  type DocumentPreviewRow,
} from "@/actions/document-import.actions";
import { maskValue, parseDocumentText, type ParsedDocuments } from "@/lib/document-import";
import { cn } from "@/lib/utils";

const SKIP = "skip";

/**
 * Ro'yxatdan (Google Sheets / Excel / PDF'dan nusxa olingan matn) o'quvchilarning JSHSHIR va guvohnoma (pasport)
 * raqamlarini profiliga yozish. Matn brauzerda ajratiladi; o'quvchilar ism bo'yicha topiladi va ko'rib chiqilgach saqlanadi.
 */
export function DocumentImportSection() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedDocuments | null>(null);
  const [rows, setRows] = useState<DocumentPreviewRow[] | null>(null);
  // Qator -> bog'lanadigan o'quvchi ID'si yoki "skip"
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const check = async () => {
    setError(null);
    setRows(null);
    setSavedCount(null);
    const result = parseDocumentText(text);
    setParsed(result);
    if (result.rows.length === 0) {
      setError("Matndan birorta ham o'quvchi topilmadi. Har qatorda FISH, 14 xonali JSHSHIR va seriya-raqam bo'lishi kerak");
      return;
    }
    try {
      setChecking(true);
      const res = await previewDocumentImportAction(
        result.rows.map((r) => ({ fullName: r.fullName, pinfl: r.pinflValid ? r.pinfl : "", docNumber: r.docNumber, docKind: r.docKind }))
      );
      if (!res.success || !res.rows) {
        setError(res.message || "Tekshirib bo'lmadi");
        return;
      }
      setRows(res.rows);
      setChoices(
        Object.fromEntries(
          res.rows.map((r) => [r.index, r.status === "matched" && r.change !== "same" ? r.match!.userId : SKIP])
        )
      );
    } catch {
      setError("Tekshirib bo'lmadi");
    } finally {
      setChecking(false);
    }
  };

  const selected = rows?.filter((r) => choices[r.index] && choices[r.index] !== SKIP) ?? [];

  const save = async () => {
    if (!parsed || selected.length === 0) return;
    try {
      setSaving(true);
      const res = await applyDocumentImportAction(
        selected.map((r) => {
          const p = parsed.rows[r.index];
          return {
            userId: choices[r.index],
            fullName: p.fullName,
            pinfl: p.pinflValid ? p.pinfl : "",
            docNumber: p.docNumber,
            docKind: p.docKind,
          };
        })
      );
      if (res.success) {
        toast.success(res.message);
        setSavedCount(res.updated ?? 0);
        setRows(null);
        setText("");
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  const counts = rows
    ? {
        matched: rows.filter((r) => r.status === "matched").length,
        ambiguous: rows.filter((r) => r.status === "ambiguous").length,
        unmatched: rows.filter((r) => r.status === "unmatched").length,
      }
    : null;

  return (
    <section
      aria-labelledby="doc-import-heading"
      className="p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 space-y-4"
    >
      <div className="space-y-1">
        <h2 id="doc-import-heading" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
          <IdCard className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Hujjat raqamlari: JSHSHIR va guvohnoma
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Google Sheets yoki Excel varag&apos;ini to&apos;liq belgilab (Cmd/Ctrl + A, C) shu yerga joylashtiring. Har qatordan
          FISH, JSHSHIR va seriya-raqam olinadi, o&apos;quvchi ism bo&apos;yicha topiladi. Raqamlar shifrlangan holda saqlanadi
          va o&apos;quvchi ularni o&apos;z profilida ko&apos;radi.
        </p>
      </div>

      <Textarea
        aria-label="O'quvchilar ro'yxati matni"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"1\tFAMILIYA ISM OTASINING ISMI\t60402127210021\tI-HR 0630583\tXiva shahri\t8"}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={check} isLoading={checking} disabled={!text.trim()}>
          Tekshirish
        </Button>
        {savedCount !== null && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            {savedCount} ta o&apos;quvchi profili yangilandi
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 text-xs sm:text-sm rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {parsed && parsed.conflicts.length > 0 && (
        <div className="p-3 text-xs sm:text-sm rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 space-y-1">
          <p className="font-semibold">Ro&apos;yxatda bir o&apos;quvchi uchun ikki xil JSHSHIR — ular saqlanmaydi, qo&apos;lda tekshiring:</p>
          <ul className="list-disc pl-5">
            {parsed.conflicts.map((c) => (
              <li key={c.fullName}>
                {c.fullName}: {c.values.map(maskValue).join(" / ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows && counts && parsed && (
        <div className="space-y-3 page-enter">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="success">Topildi: {counts.matched}</Badge>
            {counts.ambiguous > 0 && <Badge variant="warning">Tanlash kerak: {counts.ambiguous}</Badge>}
            {counts.unmatched > 0 && <Badge variant="secondary">Bazada yo&apos;q: {counts.unmatched}</Badge>}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Ro&apos;yxatda</th>
                  <th className="px-3 py-2 text-left font-semibold">O&apos;quvchi</th>
                  <th className="px-3 py-2 text-left font-semibold">JSHSHIR</th>
                  <th className="px-3 py-2 text-left font-semibold">Hujjat</th>
                  <th className="px-3 py-2 text-left font-semibold">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {rows.map((r) => {
                  const p = parsed.rows[r.index];
                  const options = r.match ? [r.match, ...r.candidates] : r.candidates;
                  const skipped = choices[r.index] === SKIP;
                  return (
                    <tr key={r.index} className={cn(skipped && "opacity-60")}>
                      <td className="px-3 py-2 align-top">{r.fullName}</td>
                      <td className="px-3 py-2 align-top min-w-[200px]">
                        {options.length > 0 ? (
                          <Select
                            aria-label={`${r.fullName} — o'quvchi`}
                            value={choices[r.index] ?? SKIP}
                            onChange={(e) => setChoices((prev) => ({ ...prev, [r.index]: e.target.value }))}
                            className="min-h-[36px] py-1 text-xs"
                          >
                            <option value={SKIP}>O&apos;tkazib yuborish</option>
                            {options.map((c) => (
                              <option key={c.userId} value={c.userId}>
                                {c.fullName}
                                {c.groupName ? ` · ${c.groupName}` : ""}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Bazada topilmadi</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs">
                        {p.pinflValid ? maskValue(p.pinfl) : <span className="text-rose-600 dark:text-rose-400">noto&apos;g&apos;ri</span>}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs whitespace-nowrap">
                        {p.docNumber}
                        {p.docKind === "passport" && <span className="ml-1 font-sans text-slate-500">(pasport)</span>}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {r.status === "unmatched" ? null : r.change === "new" ? (
                          <Badge variant="success">Yangi</Badge>
                        ) : r.change === "same" ? (
                          <Badge variant="secondary">O&apos;zgarmaydi</Badge>
                        ) : (
                          <Badge variant="warning" title={`Hozir: ${[r.current.pinfl, r.current.docNumber].filter(Boolean).join(" · ")}`}>
                            Almashadi
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} isLoading={saving} disabled={selected.length === 0}>
              Saqlash ({selected.length})
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
