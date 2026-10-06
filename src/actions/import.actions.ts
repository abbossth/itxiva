"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { hashPassword, generateRandomPassword } from "@/lib/auth/password";
import { encryptTempPassword } from "@/lib/auth/temp-password";
import { slugifyLogin } from "@/lib/utils";
import { parseScheduleText, formatSchedule, GroupSchedule } from "@/lib/schedule";
import { nameKey, fuzzyKey, levenshtein, nameTokens, toDisplayName } from "@/lib/name-match";

const rowSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  groupName: z.string().trim().min(2).max(20),
  grade: z.coerce.number().int().optional(),
  scheduleText: z.string().max(300).optional().default(""),
});
const rowsSchema = z.array(rowSchema).min(1).max(1000);

export type ImportRowInput = z.input<typeof rowSchema>;

export interface ImportCandidate {
  userId: string;
  fullName: string;
  login: string;
  groupName: string | null;
}

export interface ImportPreviewRow {
  index: number;
  fullName: string;
  groupName: string;
  /** matched: bazada bor va guruhi to'g'ri; move: bazada bor, guruhi o'zgaradi; new: yangi; ambiguous: o'xshash ism topildi */
  status: "matched" | "move" | "new" | "ambiguous";
  match: ImportCandidate | null;
  candidates: ImportCandidate[];
}

export interface ImportPreviewGroup {
  name: string;
  grade: number;
  schedule: GroupSchedule | null;
  scheduleLabel: string;
  exists: boolean;
  rowCount: number;
}

export interface ImportPreview {
  groups: ImportPreviewGroup[];
  rows: ImportPreviewRow[];
  /** Bazada bor, lekin Excel'da uchramagan o'quvchilar — ularga tegilmaydi */
  untouched: ImportCandidate[];
}

const ALLOWED_GRADES = [8, 9, 10, 11];

function buildGroups(rows: z.output<typeof rowsSchema>) {
  const groups = new Map<string, { name: string; grade: number; schedule: GroupSchedule | null; rowCount: number }>();
  for (const row of rows) {
    const existing = groups.get(row.groupName);
    const schedule = parseScheduleText(row.scheduleText);
    if (existing) {
      existing.rowCount++;
      if (!existing.schedule && schedule) existing.schedule = schedule;
    } else {
      // Sinf Excel'da ko'rsatilmagan bo'lsa guruh kodidan olinadi: XSH-25I0802 -> 08
      const fromCode = Number(row.groupName.match(/(\d{2})\d{2}$/)?.[1]);
      const grade = ALLOWED_GRADES.includes(row.grade ?? 0)
        ? (row.grade as number)
        : ALLOWED_GRADES.includes(fromCode)
        ? fromCode
        : 8;
      groups.set(row.groupName, { name: row.groupName, grade, schedule, rowCount: 1 });
    }
  }
  return [...groups.values()];
}

/**
 * Excel qatorlarini bazadagi o'quvchilar bilan solishtiradi. Hech narsa yozmaydi.
 */
export async function previewExcelImportAction(
  rawRows: ImportRowInput[]
): Promise<{ success: boolean; message?: string; data?: ImportPreview }> {
  await requireMentor();
  const parsed = rowsSchema.safeParse(rawRows);
  if (!parsed.success) {
    return { success: false, message: "Fayldan o'quvchilar ro'yxatini o'qib bo'lmadi" };
  }
  await connectToDatabase();

  const [students, dbGroups] = await Promise.all([
    User.find({ role: "student" }).select("fullName login groupId").lean(),
    Group.find({}).select("name").lean(),
  ]);
  const groupNameById = new Map(dbGroups.map((g) => [g._id.toString(), g.name]));
  const existingGroupNames = new Set(dbGroups.map((g) => g.name));

  const candidates = students.map((s) => ({
    userId: s._id.toString(),
    fullName: s.fullName,
    login: s.login,
    groupName: s.groupId ? groupNameById.get(s.groupId.toString()) ?? null : null,
    key: nameKey(s.fullName),
    fuzzy: fuzzyKey(s.fullName),
    tokens: nameTokens(s.fullName),
  }));
  const strip = ({ userId, fullName, login, groupName }: (typeof candidates)[number]): ImportCandidate => ({
    userId,
    fullName,
    login,
    groupName,
  });

  const usedUserIds = new Set<string>();
  const rows: ImportPreviewRow[] = parsed.data.map((row, index) => {
    const key = nameKey(row.fullName);
    const fuzzy = fuzzyKey(row.fullName);
    const tokens = nameTokens(row.fullName);

    const exact = candidates.filter(
      (c) =>
        !usedUserIds.has(c.userId) &&
        (c.key === key ||
          // Bazada otasining ismi bilan yoki boshqa tartibda yozilgan bo'lishi mumkin
          (c.tokens.length >= 2 && tokens.length >= 2 && c.tokens.slice(0, 2).every((t) => tokens.includes(t))))
    );
    // Bir xil ism-familiyali bir nechta o'quvchi bo'lsa, shu guruhdagisi afzal
    const best = exact.length > 1 ? exact.filter((c) => c.groupName === row.groupName) : exact;

    const base = { index, fullName: toDisplayName(row.fullName), groupName: row.groupName };
    if (best.length === 1) {
      usedUserIds.add(best[0].userId);
      return {
        ...base,
        status: best[0].groupName === row.groupName ? "matched" : "move",
        match: strip(best[0]),
        candidates: [],
      };
    }

    const similar = (exact.length > 1 ? exact : candidates)
      .filter((c) => !usedUserIds.has(c.userId) && (exact.length > 1 || levenshtein(c.fuzzy, fuzzy) <= 2))
      .slice(0, 5)
      .map(strip);
    return { ...base, status: similar.length > 0 ? "ambiguous" : "new", match: null, candidates: similar };
  });

  // Shubhali qatorlarga taklif qilingan o'quvchilar ham "tegilmaydi" ro'yxatida ko'rinadi (mentor bog'lamaguncha)
  const untouched = candidates.filter((c) => !usedUserIds.has(c.userId)).map(strip);

  const groups: ImportPreviewGroup[] = buildGroups(parsed.data).map((g) => ({
    ...g,
    scheduleLabel: formatSchedule(g.schedule),
    exists: existingGroupNames.has(g.name),
  }));

  return { success: true, data: { groups, rows, untouched } };
}

const decisionSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  groupName: z.string().trim().min(2).max(20),
  grade: z.coerce.number().int().optional(),
  scheduleText: z.string().max(300).optional().default(""),
  action: z.enum(["link", "create", "skip"]),
  userId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export type ImportDecisionInput = z.input<typeof decisionSchema>;

export interface ImportApplyResult {
  groupsCreated: number;
  groupsUpdated: number;
  moved: number;
  unchanged: number;
  created: { fullName: string; login: string; password: string; groupName: string }[];
}

/**
 * Tasdiqlangan importni bazaga yozadi.
 * MUHIM: mavjud o'quvchilarda faqat `groupId` o'zgaradi — passwordHash, login va mustChangePassword
 * maydonlariga bu funksiya hech qachon yozmaydi.
 */
export async function applyExcelImportAction(
  rawDecisions: ImportDecisionInput[]
): Promise<{ success: boolean; message?: string; data?: ImportApplyResult }> {
  const mentor = await requireMentor();
  const parsed = z.array(decisionSchema).min(1).max(1000).safeParse(rawDecisions);
  if (!parsed.success) {
    return { success: false, message: "Import ma'lumotlari noto'g'ri" };
  }
  const decisions = parsed.data.filter((d) => d.action !== "skip");
  if (decisions.length === 0) {
    return { success: false, message: "Import qilinadigan qator tanlanmadi" };
  }
  const linkIds = decisions.filter((d) => d.action === "link").map((d) => d.userId);
  if (linkIds.some((id) => !id) || new Set(linkIds).size !== linkIds.length) {
    return { success: false, message: "Bitta o'quvchi ikki qatorga bog'langan — tanlovni tekshiring" };
  }

  await connectToDatabase();

  // 1. Guruhlar: nom bo'yicha topiladi yoki yaratiladi, jadvali yangilanadi
  const result: ImportApplyResult = { groupsCreated: 0, groupsUpdated: 0, moved: 0, unchanged: 0, created: [] };
  const groupIdByName = new Map<string, string>();
  for (const g of buildGroups(decisions)) {
    const existing = await Group.findOne({ name: g.name });
    if (existing) {
      if (g.schedule && formatSchedule(existing.schedule) !== formatSchedule(g.schedule)) {
        existing.schedule = g.schedule;
        await existing.save();
        result.groupsUpdated++;
      }
      groupIdByName.set(g.name, existing._id.toString());
    } else {
      const createdGroup = await Group.create({
        name: g.name,
        grade: g.grade,
        academicYear: "2026-2027",
        isActive: true,
        schedule: g.schedule,
      });
      result.groupsCreated++;
      groupIdByName.set(g.name, createdGroup._id.toString());
    }
  }

  // 2. Mavjud o'quvchilar: faqat guruhi o'zgaradi
  const touchedGroupIds = new Set<string>(groupIdByName.values());
  for (const d of decisions.filter((x) => x.action === "link")) {
    const groupId = groupIdByName.get(d.groupName)!;
    const user = await User.findOne({ _id: d.userId, role: "student" }).select("groupId").lean();
    if (!user) continue;
    if (user.groupId?.toString() === groupId) {
      result.unchanged++;
      continue;
    }
    if (user.groupId) touchedGroupIds.add(user.groupId.toString());
    await User.updateOne({ _id: d.userId, role: "student" }, { $set: { groupId } });
    result.moved++;
  }

  // 3. Yangi o'quvchilar: login va bir martalik parol yaratiladi
  const plannedLogins = new Set<string>();
  const toInsert = [];
  for (const d of decisions.filter((x) => x.action === "create")) {
    const fullName = toDisplayName(d.fullName);
    const baseLogin = slugifyLogin(fullName.split(" ").slice(0, 2).join(" ")) || `student_${Date.now()}`;
    let login = baseLogin;
    let counter = 1;
    while (plannedLogins.has(login) || (await User.exists({ login }))) {
      counter++;
      login = `${baseLogin}_${counter}`;
    }
    plannedLogins.add(login);

    const password = generateRandomPassword(8);
    toInsert.push({
      fullName,
      login,
      passwordHash: await hashPassword(password),
      tempPasswordEnc: encryptTempPassword(password),
      role: "student" as const,
      groupId: groupIdByName.get(d.groupName)!,
      mustChangePassword: true,
    });
    result.created.push({ fullName, login, password, groupName: d.groupName });
  }
  if (toInsert.length > 0) {
    await User.insertMany(toInsert);
  }

  // 4. O'quvchilar sonini qayta hisoblash
  for (const groupId of touchedGroupIds) {
    const studentCount = await User.countDocuments({ groupId, role: "student" });
    await Group.updateOne({ _id: groupId }, { $set: { studentCount } });
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: "EXCEL_IMPORT",
    details: {
      groups: [...groupIdByName.keys()],
      groupsCreated: result.groupsCreated,
      groupsUpdated: result.groupsUpdated,
      moved: result.moved,
      unchanged: result.unchanged,
      created: result.created.map((c) => c.login),
    },
  });

  revalidatePath("/mentor/groups");
  return { success: true, data: result };
}
