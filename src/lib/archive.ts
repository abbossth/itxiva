import mongoose from "mongoose";
import { Archive, ArchivedDoc, ArchiveKind, IArchive } from "@/lib/db/models/archive.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Exam } from "@/lib/db/models/exam.model";
import { Product } from "@/lib/db/models/product.model";
import { Quiz } from "@/lib/db/models/quiz.model";
import { StudentProfile } from "@/lib/db/models/student-profile.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { AttendanceRecord } from "@/lib/db/models/attendance-record.model";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { ExamSubmission } from "@/lib/db/models/exam-submission.model";
import { Order } from "@/lib/db/models/order.model";
import { deleteSessionWithCoins, findSessionOnDay, reapplySessionCoins } from "@/lib/attendance/core";
import { toDateKey } from "@/lib/schedule";
import { formatDateUz } from "@/lib/utils";

// Arxivga olish va tiklash. Yozuvlar haydovchi darajasida (sxemasiz) ko'chiriladi: yashirin maydonlar
// (parol xeshi, shifrlangan hujjat raqamlari) va asl `_id`lar o'zgarishsiz saqlanadi.

type Doc = Record<string, unknown> & { _id: mongoose.Types.ObjectId };
type Id = string | mongoose.Types.ObjectId;

const C = {
  users: () => User.collection.collectionName,
  groups: () => Group.collection.collectionName,
  lessons: () => Lesson.collection.collectionName,
  exams: () => Exam.collection.collectionName,
  products: () => Product.collection.collectionName,
  quizzes: () => Quiz.collection.collectionName,
  profiles: () => StudentProfile.collection.collectionName,
  ledger: () => CoinLedger.collection.collectionName,
  sessions: () => AttendanceSession.collection.collectionName,
  records: () => AttendanceRecord.collection.collectionName,
  homework: () => HomeworkSubmission.collection.collectionName,
  quizSubs: () => QuizSubmission.collection.collectionName,
  examSubs: () => ExamSubmission.collection.collectionName,
  orders: () => Order.collection.collectionName,
};

interface Plan {
  root: () => string;
  /** Obyekt bilan birga arxivga ketadigan yozuvlar: to'plam va obyektga ishora qiluvchi maydon */
  parts: Array<{ coll: () => string; field: string }>;
}

const PLANS: Record<ArchiveKind, Plan> = {
  student: {
    root: C.users,
    parts: [C.profiles, C.ledger, C.records, C.homework, C.quizSubs, C.examSubs, C.orders].map((coll) => ({ coll, field: "studentId" })),
  },
  group: { root: C.groups, parts: [] },
  lesson: {
    root: C.lessons,
    parts: [C.homework, C.quizzes, C.quizSubs].map((coll) => ({ coll, field: "lessonId" })),
  },
  exam: { root: C.exams, parts: [{ coll: C.examSubs, field: "examId" }] },
  product: { root: C.products, parts: [] },
  attendance: { root: C.sessions, parts: [{ coll: C.records, field: "sessionId" }] },
};

/** Bog'liq yozuv yana nimalarga tayanadi: tiklanayotganda o'sha narsa ham mavjud bo'lishi kerak */
const parentRefs = (): Record<string, Array<{ field: string; coll: string }>> => ({
  [C.profiles()]: [{ field: "studentId", coll: C.users() }],
  [C.ledger()]: [{ field: "studentId", coll: C.users() }],
  [C.orders()]: [{ field: "studentId", coll: C.users() }],
  [C.records()]: [
    { field: "studentId", coll: C.users() },
    { field: "sessionId", coll: C.sessions() },
  ],
  [C.homework()]: [
    { field: "studentId", coll: C.users() },
    { field: "lessonId", coll: C.lessons() },
  ],
  [C.quizSubs()]: [
    { field: "studentId", coll: C.users() },
    { field: "lessonId", coll: C.lessons() },
  ],
  [C.quizzes()]: [{ field: "lessonId", coll: C.lessons() }],
  [C.examSubs()]: [
    { field: "studentId", coll: C.users() },
    { field: "examId", coll: C.exams() },
  ],
});

const oid = (id: Id) => new mongoose.Types.ObjectId(String(id));
const raw = (name: string) => mongoose.connection.collection(name);
const isDuplicate = (err: unknown) => (err as { code?: number })?.code === 11000;

async function describe(kind: ArchiveKind, root: Doc): Promise<{ title: string; subtitle: string; groupId: mongoose.Types.ObjectId | null }> {
  const groupId = kind === "group" ? null : ((root.groupId as mongoose.Types.ObjectId | null | undefined) ?? null);
  const group = groupId ? await Group.findById(groupId).select("name").lean() : null;
  const groupName = group?.name ?? "";
  const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ");
  switch (kind) {
    case "student":
      return { title: String(root.fullName), subtitle: join(`@${root.login}`, groupName), groupId };
    case "group":
      return { title: String(root.name), subtitle: join(`${root.grade}-sinf`, String(root.academicYear ?? "")), groupId: null };
    case "lesson":
      return { title: String(root.title), subtitle: join(groupName, `${root.quarter}-chorak`), groupId };
    case "exam":
      return { title: String(root.title), subtitle: `${root.quarter}-chorak imtihoni`, groupId: null };
    case "product":
      return { title: String(root.title), subtitle: `${root.price} coin`, groupId: null };
    case "attendance":
      return { title: `Davomat — ${formatDateUz(root.date as Date)}`, subtitle: groupName, groupId };
  }
}

/**
 * Obyektni va unga bog'liq yozuvlarni arxivga ko'chiradi. Topilmasa `null`.
 * Davomat arxivlanganda u bergan coinlar qaytarib olinadi (jarimalar qaytariladi) — tiklanganda qayta beriladi.
 */
export async function archiveEntity(kind: ArchiveKind, id: Id, actorId: Id): Promise<{ archive: IArchive; root: Doc } | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  const plan = PLANS[kind];
  const rootId = oid(id);
  const root = (await raw(plan.root()).findOne({ _id: rootId })) as Doc | null;
  if (!root) return null;
  if (kind === "student" && root.role !== "student") return null;

  const items: Array<{ coll: string; doc: Doc }> = [{ coll: plan.root(), doc: root }];
  for (const part of plan.parts) {
    const docs = (await raw(part.coll()).find({ [part.field]: rootId }).toArray()) as Doc[];
    for (const doc of docs) items.push({ coll: part.coll(), doc });
  }

  const counts: Record<string, number> = {};
  for (const item of items.slice(1)) counts[item.coll] = (counts[item.coll] ?? 0) + 1;

  // Avval nusxa yoziladi, keyin asl yozuvlar o'chiriladi: o'rtada uzilsa ham hech narsa yo'qolmaydi
  const archive = await Archive.create({ kind, entityId: rootId, ...(await describe(kind, root)), deletedBy: oid(actorId), counts });
  await ArchivedDoc.collection.insertMany(items.map((item) => ({ archiveId: archive._id, coll: item.coll, doc: item.doc, moved: false })));

  if (kind === "attendance") {
    await deleteSessionWithCoins(rootId);
  } else {
    for (const part of plan.parts) await raw(part.coll()).deleteMany({ [part.field]: rootId });
    await raw(plan.root()).deleteOne({ _id: rootId });
  }
  return { archive, root };
}

export type ArchiveResult = { success: true; message: string } | { success: false; message: string };

/** Band bo'lmagan qiymatni topadi: "ali" → "ali_2", "ali_3" … */
async function freeValue(coll: string, field: string, base: string, variant: (n: number) => string): Promise<string> {
  let candidate = base;
  for (let n = 2; await raw(coll).findOne({ [field]: candidate }, { projection: { _id: 1 } }); n++) candidate = variant(n);
  return candidate;
}

/** Arxivdagi obyektni bog'liq yozuvlari bilan asl joyiga qaytaradi */
export async function restoreArchive(archiveId: Id): Promise<ArchiveResult> {
  if (!mongoose.isValidObjectId(archiveId)) return { success: false, message: "Arxiv yozuvi topilmadi" };
  const archive = await Archive.findById(archiveId);
  if (!archive) return { success: false, message: "Arxiv yozuvi topilmadi" };

  const plan = PLANS[archive.kind];
  const rootColl = plan.root();
  const stored = (await ArchivedDoc.collection.find({ archiveId: archive._id }).toArray()) as unknown as Array<{
    _id: mongoose.Types.ObjectId;
    coll: string;
    doc: Doc;
    moved?: boolean;
  }>;
  const root = stored.find((s) => s.coll === rootColl && String(s.doc._id) === String(archive.entityId))?.doc;
  if (!root) return { success: false, message: "Arxivdagi ma'lumot buzilgan — tiklab bo'lmadi" };

  const notes: string[] = [];
  const groupId = archive.kind === "group" ? null : (root.groupId as mongoose.Types.ObjectId | null | undefined);
  if (groupId && archive.kind !== "exam" && !(await Group.exists({ _id: groupId }))) {
    return { success: false, message: "Bu yozuvning guruhi o'chirilgan. Avval guruhni arxivdan tiklang" };
  }

  if (archive.kind === "student") {
    const login = await freeValue(rootColl, "login", String(root.login), (n) => `${root.login}_${n}`);
    if (login !== root.login) {
      notes.push(`Eski login band bo'lgani uchun yangi login berildi: ${login}`);
      root.login = login;
    }
    const chatId = (root.telegram as { chatId?: string | null } | null | undefined)?.chatId;
    if (chatId && (await raw(rootColl).findOne({ "telegram.chatId": chatId }, { projection: { _id: 1 } }))) {
      root.telegram = { chatId: null, username: null, linkedAt: null };
      notes.push("Telegram boshqa hisobga ulangani uchun qayta ulash kerak");
    }
  } else if (archive.kind === "group") {
    const name = await freeValue(rootColl, "name", String(root.name), (n) => `${root.name} (tiklangan${n > 2 ? ` ${n - 1}` : ""})`);
    if (name !== root.name) {
      notes.push(`Bunday nomli guruh borligi uchun "${name}" nomi bilan tiklandi`);
      root.name = name;
    }
  } else if (archive.kind === "lesson") {
    // Bog'langan nusxalari qolmagan bo'lsa, bog'lanish belgisi ham kerak emas
    if (root.linkId && !(await raw(rootColl).findOne({ linkId: root.linkId }, { projection: { _id: 1 } }))) root.linkId = null;
  } else if (archive.kind === "attendance") {
    const sameDay = await findSessionOnDay(root.groupId as mongoose.Types.ObjectId, toDateKey(root.date as Date));
    if (sameDay && String(sameDay._id) !== String(root._id)) {
      return { success: false, message: "Shu guruhda shu kun uchun boshqa davomat bor. Avval uni o'chiring" };
    }
    if (root.status === "active") {
      root.status = "closed";
      root.endTime = root.endTime ?? new Date();
    }
    if (await raw(rootColl).findOne({ currentToken: root.currentToken }, { projection: { _id: 1 } })) {
      root.currentToken = `${root.currentToken}-${new mongoose.Types.ObjectId().toString()}`;
    }
  }

  if (!(await raw(rootColl).findOne({ _id: root._id }, { projection: { _id: 1 } }))) {
    await raw(rootColl).insertOne(root);
  }

  // Bog'liq yozuvlar: tayanadigan boshqa narsasi (masalan, shu orada arxivlangan o'quvchi yoki dars) mavjud
  // bo'lmasa, yozuv o'sha narsaning arxiviga o'tadi; u ham yo'q bo'lsa — tashlab yuboriladi.
  const refs = parentRefs();
  const dependents = stored.filter((s) => s.doc !== root);
  const wanted = new Map<string, Set<string>>();
  for (const dep of dependents) {
    for (const ref of refs[dep.coll] ?? []) {
      const value = dep.doc[ref.field];
      if (!value) continue;
      if (!wanted.has(ref.coll)) wanted.set(ref.coll, new Set());
      wanted.get(ref.coll)!.add(String(value));
    }
  }
  const alive = new Set<string>();
  for (const [coll, ids] of wanted) {
    const found = await raw(coll)
      .find({ _id: { $in: [...ids].map(oid) } }, { projection: { _id: 1 } })
      .toArray();
    for (const f of found) alive.add(`${coll}:${f._id}`);
  }

  const toInsert = new Map<string, Doc[]>();
  const creditedStudents: mongoose.Types.ObjectId[] = [];
  let parked = 0;
  for (const dep of dependents) {
    const missing = (refs[dep.coll] ?? []).find((ref) => dep.doc[ref.field] && !alive.has(`${ref.coll}:${dep.doc[ref.field]}`));
    if (missing) {
      const owner = await Archive.findOne({ entityId: dep.doc[missing.field] as mongoose.Types.ObjectId, _id: { $ne: archive._id } }).select("_id").lean();
      if (owner) {
        await ArchivedDoc.collection.updateOne({ _id: dep._id }, { $set: { archiveId: owner._id, moved: true } });
        parked++;
      }
      continue;
    }
    if (!toInsert.has(dep.coll)) toInsert.set(dep.coll, []);
    toInsert.get(dep.coll)!.push(dep.doc);
    // Boshqa arxivdan kelgan yozuvning coini egasining hisobida turibdi — qayta berilmaydi
    if (archive.kind === "attendance" && !dep.moved && dep.doc.studentId) creditedStudents.push(dep.doc.studentId as mongoose.Types.ObjectId);
  }
  for (const [coll, docs] of toInsert) {
    try {
      await raw(coll).insertMany(docs, { ordered: false });
    } catch (err) {
      // Oldingi urinishda qisman tiklangan yozuvlar takror qo'shilmaydi
      if (!isDuplicate(err)) throw err;
    }
  }

  if (archive.kind === "student" && root.groupId) {
    await Group.updateOne({ _id: root.groupId }, { studentCount: await User.countDocuments({ groupId: root.groupId, role: "student" }) });
  }
  if (archive.kind === "attendance" && creditedStudents.length > 0) {
    await reapplySessionCoins(root._id, creditedStudents);
  }
  if (parked > 0) notes.push(`${parked} ta yozuv arxivda qoldi — ular tegishli bo'lgan narsa ham arxivda`);

  await ArchivedDoc.collection.deleteMany({ archiveId: archive._id });
  await Archive.deleteOne({ _id: archive._id });
  return { success: true, message: [`"${archive.title}" tiklandi`, ...notes].join(". ") };
}

/** Arxivdagi obyektni butunlay o'chiradi — qaytarib bo'lmaydi */
export async function purgeArchive(archiveId: Id): Promise<ArchiveResult> {
  if (!mongoose.isValidObjectId(archiveId)) return { success: false, message: "Arxiv yozuvi topilmadi" };
  const archive = await Archive.findById(archiveId);
  if (!archive) return { success: false, message: "Arxiv yozuvi topilmadi" };

  if (archive.kind === "group") {
    const students = await Archive.countDocuments({ kind: "student", groupId: archive.entityId });
    if (students > 0) {
      return {
        success: false,
        message: `Arxivda shu guruhning ${students} ta o'quvchisi bor. Avval ularni tiklang yoki butunlay o'chiring`,
      };
    }
  }

  await ArchivedDoc.collection.deleteMany({ archiveId: archive._id });
  await Archive.deleteOne({ _id: archive._id });
  return { success: true, message: `"${archive.title}" butunlay o'chirildi` };
}

const COUNT_LABELS = (): Record<string, string> => ({
  [C.records()]: "davomat yozuvi",
  [C.homework()]: "vazifa javobi",
  [C.quizSubs()]: "test javobi",
  [C.examSubs()]: "imtihon urinishi",
  [C.ledger()]: "coin yozuvi",
  [C.orders()]: "buyurtma",
  [C.quizzes()]: "test",
  [C.profiles()]: "shaxsiy ma'lumot",
});

/** "12 ta davomat yozuvi, 3 ta vazifa javobi" */
export function describeArchiveCounts(counts: Record<string, number> | null | undefined): string {
  const labels = COUNT_LABELS();
  return Object.entries(counts ?? {})
    .filter(([coll, n]) => n > 0 && labels[coll])
    .map(([coll, n]) => (coll === C.profiles() ? labels[coll] : `${n} ta ${labels[coll]}`))
    .join(", ");
}
