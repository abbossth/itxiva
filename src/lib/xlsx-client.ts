// Brauzerda Excel o'qish/yozish. exceljs katta kutubxona bo'lgani uchun faqat kerak bo'lganda yuklanadi.
// Fayl serverga yuborilmaydi: JSHSHIR va pasport ma'lumotlari mentor kompyuteridan chiqmaydi.

export interface ParsedStudentRow {
  fullName: string;
  groupName: string;
  grade?: number;
  scheduleText: string;
}

export interface ParsedSheet {
  name: string;
  rows: ParsedStudentRow[];
  groupCount: number;
}

const GROUP_CODE_RE = /^[A-Z]{2,5}-?\d{2}[A-Z]\d{4}$/i;
const TIME_RANGE_RE = /\d{1,2}[:.;]\d{2}\s*[-–—]\s*\d{1,2}[:.;]\d{2}/;
const NAME_HEADER_RE = /^(fish|fio|f\.i\.sh\.?|f\.i\.o\.?)$/i;

// exceljs bo'sh merge qilingan kataklarda `.text` chaqirilganda xato beradi
function cellText(cell: { text: string }): string {
  try {
    return (cell.text ?? "").toString().trim();
  } catch {
    return "";
  }
}

async function loadExcelJS() {
  const mod = await import("exceljs");
  return (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
}

export async function readStudentSheets(file: File): Promise<ParsedSheet[]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheets: ParsedSheet[] = [];
  workbook.eachSheet((sheet) => {
    let nameCol = 0;
    let gradeCol = 0;
    let headerRow = 0;
    // Sarlavha qatori: "FISH" yoki "FIO" ustuni bor qator
    for (let r = 1; r <= Math.min(sheet.rowCount, 10) && !nameCol; r++) {
      sheet.getRow(r).eachCell((cell, col) => {
        const text = cellText(cell);
        if (!nameCol && NAME_HEADER_RE.test(text)) {
          nameCol = col;
          headerRow = r;
        }
      });
    }
    if (!nameCol) return;
    sheet.getRow(headerRow).eachCell((cell, col) => {
      if (/^sinf$/i.test(cellText(cell))) gradeCol = col;
    });

    const rows: ParsedStudentRow[] = [];
    const groups = new Set<string>();
    let currentGroup = "";
    let currentSchedule = "";

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      let rowGroup = "";
      let rowSchedule = "";
      row.eachCell((cell, col) => {
        if (col <= nameCol) return;
        const text = cellText(cell);
        if (!rowGroup && GROUP_CODE_RE.test(text)) rowGroup = text.toUpperCase();
        // Birinchi (chapdagi) vaqt oralig'i — IT mentor jadvali; keyingisi ingliz tili
        else if (!rowSchedule && TIME_RANGE_RE.test(text)) rowSchedule = text;
      });
      if (rowGroup && rowGroup !== currentGroup) {
        currentGroup = rowGroup;
        currentSchedule = rowSchedule;
      } else if (rowSchedule && !currentSchedule) {
        currentSchedule = rowSchedule;
      }

      const fullName = cellText(row.getCell(nameCol)).replace(/\s+/g, " ");
      if (fullName.length < 3 || !/\p{L}/u.test(fullName) || !currentGroup) continue;

      const grade = gradeCol ? Number(cellText(row.getCell(gradeCol))) : NaN;
      groups.add(currentGroup);
      rows.push({
        fullName,
        groupName: currentGroup,
        grade: Number.isFinite(grade) ? grade : undefined,
        scheduleText: currentSchedule,
      });
    }

    if (rows.length > 0) sheets.push({ name: sheet.name, rows, groupCount: groups.size });
  });

  return sheets;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadXlsx({
  filename,
  sheetName,
  columns,
  rows,
}: {
  filename: string;
  sheetName: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, string | number | null>[];
}) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 24 }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
}
