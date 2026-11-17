import { connectToDatabase } from "@/lib/db/connect";
import { AppSettings } from "@/lib/db/models/app-settings.model";
import { Group } from "@/lib/db/models/group.model";
import { groupShortName } from "@/lib/group-name";
import { replanLessonsFromAnchor } from "@/lib/lesson-plan";
import { EVEN_DAYS, ODD_DAYS, isValidSchedule, toDateKey } from "@/lib/schedule";

// Bir martalik tuzatish: 1-chorak dars sanalari orqada qolib ketgan edi. Mentor aytgan holat (2026-11-17):
// 8.10 (juft) 17-noyabr 16-dars, 8.2 (toq) 18-noyabr 15-dars, 9.2 (toq) 18-noyabr 15-dars,
// 9.3 (juft) 17-noyabr 14-dars, 11.1 (juft) 17-noyabr 11-dars. Qolgan darslar shu kunlardan jadval bo'yicha
// oldinga va orqaga taqsimlanadi (8-dekabr — dam olish), vazifa muddatlari kamida bir hafta.
// 5 daqiqalik cron chaqiradi; bajarilgach `appliedFixes` ga yoziladi va qayta ishlamaydi.

const FIX_ID = "2026-11-17-q1-lesson-dates";
/** Kechikib ishga tushsa mentorning keyingi o'zgarishlarini bosib ketmasligi uchun */
const VALID_UNTIL_KEY = "2026-11-21";

const ANCHORS = [
  { group: "8.10", days: EVEN_DAYS, order: 16, date: "2026-11-17" },
  { group: "8.2", days: ODD_DAYS, order: 15, date: "2026-11-18" },
  { group: "9.2", days: ODD_DAYS, order: 15, date: "2026-11-18" },
  { group: "9.3", days: EVEN_DAYS, order: 14, date: "2026-11-17" },
  { group: "11.1", days: EVEN_DAYS, order: 11, date: "2026-11-17" },
];
const QUARTER = 1;

export async function applyLessonDateFixes(now: Date = new Date()) {
  if (toDateKey(now) > VALID_UNTIL_KEY) return null;
  await connectToDatabase();
  const settings = await AppSettings.findOne({ key: "global" }).select("appliedFixes").lean();
  if (settings?.appliedFixes?.includes(FIX_ID)) return null;

  const groups = await Group.find({ isActive: true }).select("name shortName schedule").lean();
  const report: Record<string, unknown> = {};
  for (const anchor of ANCHORS) {
    const matches = groups.filter((g) => groupShortName(g) === anchor.group);
    if (matches.length !== 1) {
      report[anchor.group] = matches.length === 0 ? "guruh topilmadi" : "bir nechta guruh";
      continue;
    }
    const group = matches[0];
    if (!isValidSchedule(group.schedule)) {
      report[anchor.group] = "jadval kiritilmagan";
      continue;
    }
    const schedule = { ...group.schedule, days: [...anchor.days] };
    if (group.schedule.days.join() !== schedule.days.join()) {
      await Group.updateOne({ _id: group._id }, { $set: { "schedule.days": schedule.days } });
    }
    report[anchor.group] =
      (await replanLessonsFromAnchor({
        groupId: group._id,
        quarter: QUARTER,
        anchor: { order: anchor.order },
        anchorKey: anchor.date,
        includePast: true,
        schedule,
        now,
      })) ?? "dars topilmadi";
  }

  await AppSettings.updateOne({ key: "global" }, { $addToSet: { appliedFixes: FIX_ID } }, { upsert: true });
  console.log("Lesson date fix applied:", JSON.stringify(report));
  return report;
}
