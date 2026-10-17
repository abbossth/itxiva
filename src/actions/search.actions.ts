"use server";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Quiz } from "@/lib/db/models/quiz.model";
import { Exam } from "@/lib/db/models/exam.model";
import { Quest } from "@/lib/db/models/quest.model";
import { Product } from "@/lib/db/models/product.model";
import { Group } from "@/lib/db/models/group.model";
import { User } from "@/lib/db/models/user.model";
import { requireAuth } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { loadStudentScope, questOpen, questVisibleTo } from "@/lib/gamification/quests";
import { groupShortName } from "@/lib/group-name";
import type { SearchItem } from "@/lib/search";

const MATERIAL_WORDS: Record<string, string> = { youtube: "video youtube", file: "fayl", link: "havola sayt" };

type LessonRow = {
  _id: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId;
  title: string;
  topic?: string;
  description?: string;
  quarter: number;
  order: number;
  isPublished: boolean;
  materials?: { title: string; type: string }[];
  homework?: { isEnabled?: boolean } | null;
};

const LESSON_FIELDS = "groupId title topic description quarter order isPublished materials.title materials.type homework.isEnabled";

/** Dars va uning materiallari qidiruv elementlariga */
function lessonItems(lessons: LessonRow[], opts: { href: (id: string) => string; group?: (id: string) => string | null; quizLessons: Set<string>; mentor: boolean }): SearchItem[] {
  const items: SearchItem[] = [];
  for (const l of lessons) {
    const id = String(l._id);
    const group = opts.group?.(String(l.groupId));
    const tags = [
      l.homework?.isEnabled ? "Vazifa" : null,
      opts.quizLessons.has(id) ? "Test" : null,
      opts.mentor && !l.isPublished ? "Qoralama" : null,
    ].filter(Boolean);
    const place = [group, `${l.quarter}-chorak`, `${l.order}-dars`].filter(Boolean).join(" · ");
    items.push({
      id: `lesson:${id}`,
      kind: "lesson",
      title: l.title,
      subtitle: [place, ...tags].join(" · "),
      href: opts.href(id),
      keywords: [l.topic, (l.description ?? "").slice(0, 240), tags.length ? "vazifa test quiz" : ""].filter(Boolean).join(" "),
    });
    (l.materials ?? []).forEach((m, i) => {
      items.push({
        id: `material:${id}:${i}`,
        kind: "material",
        title: m.title,
        subtitle: [group, l.title].filter(Boolean).join(" · "),
        href: opts.href(id),
        keywords: `material ${MATERIAL_WORDS[m.type] ?? ""}`,
      });
    });
  }
  return items;
}

const productItem = (p: { _id: unknown; title: string; description?: string; category?: string; price: number }, href: string): SearchItem => ({
  id: `product:${String(p._id)}`,
  kind: "product",
  title: p.title,
  subtitle: `${p.price} coin`,
  href,
  keywords: `dokon mahsulot ${p.category ?? ""} ${(p.description ?? "").slice(0, 160)}`,
});

/**
 * Qidiruv palitrasi uchun foydalanuvchi ko'ra oladigan hamma narsa (bir so'rovda, brauzerda filtrlanadi).
 * O'quvchi: o'z guruhining nashr etilgan darslari va materiallari, imtihonlari, ochiq topshiriqlar, do'kon.
 * Mentor: hamma darslar, imtihonlar, topshiriqlar, mahsulotlar, guruhlar va o'quvchilar.
 */
export async function getSearchIndex(): Promise<SearchItem[]> {
  const session = await requireAuth();
  await connectToDatabase();
  const { gamification } = await getAppSettings();
  return session.role === "mentor" ? mentorIndex(gamification.enabled) : studentIndex(session.userId, gamification.enabled);
}

async function studentIndex(userId: string, gamificationOn: boolean): Promise<SearchItem[]> {
  const scope = await loadStudentScope(userId);
  if (!scope?.groupId) return [];
  const now = new Date();

  const [lessons, exams, quests, products] = await Promise.all([
    Lesson.find({ groupId: scope.groupId, isPublished: true }).select(LESSON_FIELDS).sort({ quarter: -1, order: -1 }).lean<LessonRow[]>(),
    Exam.find({ groupIds: scope.groupId, isPublished: true }).select("title description quarter startTime endTime").sort({ startTime: -1 }).lean(),
    gamificationOn ? Quest.find({ status: "published", isActive: true }).select("title description audience status isActive startsAt endsAt").lean() : [],
    Product.find({ isActive: true }).select("title description category price").lean(),
  ]);
  const quizzes = await Quiz.find({ lessonId: { $in: lessons.map((l) => l._id) }, isPublished: true }).select("lessonId").lean();

  return [
    ...lessonItems(lessons, { href: (id) => `/lessons/${id}`, quizLessons: new Set(quizzes.map((q) => String(q.lessonId))), mentor: false }),
    ...exams.map((e): SearchItem => {
      const active = new Date(e.startTime) <= now && new Date(e.endTime) >= now;
      const upcoming = new Date(e.startTime) > now;
      return {
        id: `exam:${String(e._id)}`,
        kind: "exam",
        title: e.title,
        subtitle: [`${e.quarter}-chorak`, active ? "Hozir ochiq" : upcoming ? "Kutilmoqda" : "Tugagan"].join(" · "),
        href: active ? `/exams/${String(e._id)}` : "/exams",
        keywords: `imtihon ${(e.description ?? "").slice(0, 160)}`,
      };
    }),
    ...quests
      .filter((q) => questOpen(q, now) && questVisibleTo(q, scope))
      .map((q): SearchItem => ({
        id: `quest:${String(q._id)}`,
        kind: "quest",
        title: q.title,
        subtitle: "Topshiriq",
        href: `/quests/${String(q._id)}`,
        keywords: `topshiriq ${(q.description ?? "").slice(0, 160)}`,
      })),
    ...products.map((p) => productItem(p, "/shop")),
  ];
}

async function mentorIndex(gamificationOn: boolean): Promise<SearchItem[]> {
  const groups = await Group.find({}).select("name shortName grade isActive").sort({ grade: 1, name: 1 }).lean();
  const activeIds = groups.filter((g) => g.isActive).map((g) => g._id);
  const groupName = new Map(groups.map((g) => [String(g._id), groupShortName(g)]));

  const [lessons, exams, quests, products, students] = await Promise.all([
    Lesson.find({ groupId: { $in: activeIds } }).select(LESSON_FIELDS).sort({ quarter: -1, order: -1 }).lean<LessonRow[]>(),
    Exam.find({}).select("title description quarter groupIds isPublished").sort({ startTime: -1 }).lean(),
    gamificationOn ? Quest.find({ status: { $ne: "archived" }, isSystem: { $ne: true } }).select("title description status").sort({ createdAt: -1 }).lean() : [],
    Product.find({}).select("title description category price isActive").lean(),
    User.find({ role: "student" }).select("fullName login groupId").sort({ fullName: 1 }).lean(),
  ]);
  const quizzes = await Quiz.find({ lessonId: { $in: lessons.map((l) => l._id) } }).select("lessonId").lean();

  return [
    ...students.map((s): SearchItem => ({
      id: `student:${String(s._id)}`,
      kind: "student",
      title: s.fullName,
      subtitle: [s.groupId ? groupName.get(String(s.groupId)) : null, s.login].filter(Boolean).join(" · "),
      href: `/mentor/students/${String(s._id)}`,
      keywords: "oquvchi",
    })),
    ...groups.map((g): SearchItem => ({
      id: `group:${String(g._id)}`,
      kind: "group",
      title: g.name,
      subtitle: [`${g.grade}-sinf`, g.isActive ? null : "Faol emas"].filter(Boolean).join(" · "),
      href: `/mentor/groups/${String(g._id)}`,
      keywords: `guruh ${groupShortName(g)}`,
    })),
    ...lessonItems(lessons, {
      href: (id) => `/mentor/lessons/${id}`,
      group: (id) => groupName.get(id) ?? null,
      quizLessons: new Set(quizzes.map((q) => String(q.lessonId))),
      mentor: true,
    }),
    ...exams.map((e): SearchItem => ({
      id: `exam:${String(e._id)}`,
      kind: "exam",
      title: e.title,
      subtitle: [
        e.groupIds.map((g) => groupName.get(String(g))).filter(Boolean).join(", "),
        `${e.quarter}-chorak`,
        e.isPublished ? null : "Qoralama",
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/mentor/exams/${String(e._id)}`,
      keywords: `imtihon ${(e.description ?? "").slice(0, 160)}`,
    })),
    ...quests.map((q): SearchItem => ({
      id: `quest:${String(q._id)}`,
      kind: "quest",
      title: q.title,
      subtitle: q.status === "draft" ? "Topshiriq · Qoralama" : "Topshiriq",
      href: `/mentor/quests/${String(q._id)}/edit`,
      keywords: `topshiriq ${(q.description ?? "").slice(0, 160)}`,
    })),
    ...products.map((p) => ({ ...productItem(p, "/mentor/shop"), subtitle: `${p.price} coin${p.isActive ? "" : " · Yashirin"}` })),
  ];
}
