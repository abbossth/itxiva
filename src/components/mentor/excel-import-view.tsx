"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Upload,
  ShieldCheck,
  CalendarClock,
  Users,
  CheckCircle2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  previewExcelImportAction,
  applyExcelImportAction,
  ImportPreview,
  ImportApplyResult,
  ImportDecisionInput,
} from "@/actions/import.actions";
import { readStudentSheets, downloadXlsx, ParsedSheet } from "@/lib/xlsx-client";

const PREFERRED_SHEET = "oxirgisi toliq";

// Har bir qator uchun tanlov: "create" (yangi), "skip" (o'tkazib yuborish) yoki bog'lanadigan o'quvchi ID'si
type Choice = string;

export function ExcelImportView() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [result, setResult] = useState<ImportApplyResult | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeSheet = sheets.find((s) => s.name === sheetName);

  const loadPreview = async (sheet: ParsedSheet) => {
    setPreview(null);
    setErrorMsg(null);
    setIsReading(true);
    try {
      const res = await previewExcelImportAction(sheet.rows);
      if (!res.success || !res.data) {
        setErrorMsg(res.message || "Ko'rib chiqishda xatolik");
        return;
      }
      setPreview(res.data);
      const initial: Record<number, Choice> = {};
      for (const row of res.data.rows) {
        // Shubhali qatorlarda mentor o'zi tanlaydi; sukut bo'yicha hech narsa yozilmaydi
        initial[row.index] = row.match ? row.match.userId : row.status === "new" ? "create" : "skip";
      }
      setChoices(initial);
    } catch {
      setErrorMsg("Server bilan bog'lanib bo'lmadi");
    } finally {
      setIsReading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setPreview(null);
    setErrorMsg(null);
    setFileName(file.name);
    setIsReading(true);
    try {
      const parsed = await readStudentSheets(file);
      if (parsed.length === 0) {
        setSheets([]);
        setErrorMsg("Faylda \"FISH\" ustuni va guruh kodi (masalan XSH-25I0802) bor varaq topilmadi");
        return;
      }
      setSheets(parsed);
      const preferred = parsed.find((s) => s.name.trim().toLowerCase() === PREFERRED_SHEET) ?? parsed[0];
      setSheetName(preferred.name);
      await loadPreview(preferred);
    } catch {
      setErrorMsg("Faylni o'qib bo'lmadi. .xlsx formatidagi fayl yuklang");
    } finally {
      setIsReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSheetChange = (name: string) => {
    setSheetName(name);
    const sheet = sheets.find((s) => s.name === name);
    if (sheet) loadPreview(sheet);
  };

  const counts = useMemo(() => {
    const c = { link: 0, move: 0, create: 0, skip: 0 };
    if (!preview) return c;
    for (const row of preview.rows) {
      const choice = choices[row.index];
      if (choice === "create") c.create++;
      else if (choice === "skip") c.skip++;
      else {
        c.link++;
        const target = row.match?.userId === choice ? row.match : row.candidates.find((x) => x.userId === choice);
        if (target && target.groupName !== row.groupName) c.move++;
      }
    }
    return c;
  }, [preview, choices]);

  const duplicateLink = useMemo(() => {
    const ids = Object.values(choices).filter((c) => c !== "create" && c !== "skip");
    return new Set(ids).size !== ids.length;
  }, [choices]);

  const handleApply = async () => {
    if (!preview || !activeSheet) return;
    const decisions: ImportDecisionInput[] = preview.rows.map((row) => {
      const source = activeSheet.rows[row.index];
      const choice = choices[row.index];
      return {
        ...source,
        action: choice === "create" || choice === "skip" ? choice : "link",
        userId: choice === "create" || choice === "skip" ? undefined : choice,
      };
    });
    try {
      setIsApplying(true);
      const res = await applyExcelImportAction(decisions);
      if (res.success && res.data) {
        setResult(res.data);
        setPreview(null);
        toast.success("Import muvaffaqiyatli yakunlandi");
      } else {
        toast.error(res.message || "Importda xatolik");
      }
    } catch {
      toast.error("Importni bajarib bo'lmadi");
    } finally {
      setIsApplying(false);
    }
  };

  const downloadCredentials = () => {
    if (!result) return;
    downloadXlsx({
      filename: "yangi_oquvchilar_login_parol.xlsx",
      sheetName: "Yangi o'quvchilar",
      columns: [
        { header: "#", key: "n", width: 5 },
        { header: "FIO", key: "fullName", width: 38 },
        { header: "Guruh", key: "groupName", width: 16 },
        { header: "Login", key: "login", width: 26 },
        { header: "Parol", key: "password", width: 14 },
      ],
      rows: result.created.map((c, i) => ({ n: i + 1, ...c })),
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader
        icon={FileSpreadsheet}
        title="Excel import"
        subtitle="O'quvchilar ro'yxati, guruhlar va dars jadvalini Excel fayldan yuklash"
        backHref="/mentor/groups"
        backLabel="Guruhlarga qaytish"
      />

      <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-start gap-3 text-xs sm:text-sm text-teal-900 dark:text-teal-200">
        <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
        <span>
          Bazada bor o&apos;quvchilarning <strong>login va paroli o&apos;zgarmaydi</strong> — faqat guruhi yangilanadi. Fayl
          brauzeringizda o&apos;qiladi: JSHSHIR va pasport ma&apos;lumotlari serverga yuborilmaydi.
        </span>
      </div>

      {/* 1. Fayl tanlash */}
      <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFile} className="hidden" id="excel-file" />
          <Button
            variant="primary"
            onClick={() => fileRef.current?.click()}
            isLoading={isReading && !preview}
            className="gap-2 shrink-0"
          >
            <Upload className="w-4 h-4" />
            Excel fayl tanlash
          </Button>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {fileName || "Hali fayl tanlanmagan (.xlsx)"}
          </span>
        </div>

        {sheets.length > 1 && (
          <div className="max-w-sm space-y-1.5">
            <label htmlFor="import-sheet" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Varaq
            </label>
            <Select id="import-sheet" value={sheetName} onChange={(e) => handleSheetChange(e.target.value)}>
              {sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} — {s.rows.length} o&apos;quvchi, {s.groupCount} guruh
                </option>
              ))}
            </Select>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 text-xs sm:text-sm rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}
      </div>

      {isReading && !preview && fileName && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-slate-200/80 dark:bg-slate-800/80 shimmer-effect" />
          ))}
        </div>
      )}

      {/* 2. Ko'rib chiqish */}
      {preview && (
        <div className="space-y-6 page-enter">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preview.groups.map((g) => (
              <div
                key={g.name}
                className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100">{g.name}</span>
                  <Badge variant={g.exists ? "secondary" : "success"}>{g.exists ? "Mavjud" : "Yangi guruh"}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Users className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  {g.rowCount} o&apos;quvchi · {g.grade}-sinf
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <CalendarClock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className={g.schedule ? "font-semibold" : "text-amber-600 dark:text-amber-400"}>
                    {g.scheduleLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="success">{counts.link - counts.move} ta o&apos;zgarishsiz</Badge>
            <Badge variant="teal">{counts.move} ta guruhi o&apos;zgaradi</Badge>
            <Badge variant="gold">{counts.create} ta yangi</Badge>
            {counts.skip > 0 && <Badge variant="warning">{counts.skip} ta o&apos;tkazib yuboriladi</Badge>}
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800">
            {preview.rows.map((row) => {
              const choice = choices[row.index];
              const options = row.match ? [row.match] : row.candidates;
              return (
                <div key={row.index} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {row.index + 1}. {row.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {row.groupName}
                      {row.match && row.status === "move" && (
                        <span className="text-teal-700 dark:text-teal-300 font-semibold">
                          {" "}
                          ← {row.match.groupName || "guruhsiz"} dan ko&apos;chadi
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="sm:w-72 shrink-0">
                    <Select
                      aria-label={`${row.fullName} uchun amal`}
                      value={choice}
                      hasError={row.status === "ambiguous" && choice === "skip"}
                      onChange={(e) => setChoices({ ...choices, [row.index]: e.target.value })}
                    >
                      {options.map((c) => (
                        <option key={c.userId} value={c.userId}>
                          Bazada: {c.fullName} (@{c.login})
                        </option>
                      ))}
                      <option value="create">Yangi o&apos;quvchi yaratish</option>
                      <option value="skip">O&apos;tkazib yuborish</option>
                    </Select>
                    {row.status === "ambiguous" && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                        O&apos;xshash ism topildi — shu o&apos;quvchimi yoki yangimi, tanlang
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {preview.untouched.length > 0 && (
            <details className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 text-xs text-slate-600 dark:text-slate-300">
              <summary className="cursor-pointer font-semibold min-h-[28px]">
                Excel&apos;da yo&apos;q, bazada bor {preview.untouched.length} ta o&apos;quvchi (ularga tegilmaydi)
              </summary>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {preview.untouched.map((u) => (
                  <li key={u.userId} className="truncate">
                    {u.fullName} <span className="text-slate-500 dark:text-slate-400">@{u.login} · {u.groupName || "guruhsiz"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            {duplicateLink && (
              <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                Bitta o&apos;quvchi ikki qatorga bog&apos;langan
              </span>
            )}
            <Button
              variant="primary"
              onClick={handleApply}
              isLoading={isApplying}
              disabled={duplicateLink || counts.link + counts.create === 0}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Tasdiqlash va import qilish
            </Button>
          </div>
        </div>
      )}

      {/* 3. Natija */}
      {result && (
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-emerald-500/30 space-y-4 page-enter">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            Import yakunlandi
          </div>
          <ul className="text-sm text-slate-700 dark:text-slate-200 space-y-1">
            <li>Yangi guruhlar: <strong>{result.groupsCreated}</strong>, jadvali yangilangan: <strong>{result.groupsUpdated}</strong></li>
            <li>Guruhi o&apos;zgargan o&apos;quvchilar: <strong>{result.moved}</strong>, o&apos;zgarishsiz: <strong>{result.unchanged}</strong></li>
            <li>Yangi yaratilgan o&apos;quvchilar: <strong>{result.created.length}</strong></li>
          </ul>

          {result.created.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center gap-3 text-xs text-amber-800 dark:text-amber-300">
              <span className="flex-1">
                Yangi o&apos;quvchilarning vaqtinchalik parollarini yuklab oling. Keyinchalik ularni guruh sahifasidan ham
                (o&apos;quvchi parolini o&apos;zgartirmaguncha) olishingiz mumkin.
              </span>
              <Button variant="gold" size="sm" onClick={downloadCredentials} className="gap-1.5 shrink-0">
                <Download className="w-4 h-4" />
                Login-parollar (.xlsx)
              </Button>
            </div>
          )}

          <Link
            href="/mentor/groups"
            className="inline-flex items-center text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline min-h-[44px]"
          >
            Guruhlarni ko&apos;rish →
          </Link>
        </div>
      )}
    </div>
  );
}
