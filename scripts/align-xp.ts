import mongoose from "mongoose";
import { connectToDatabase } from "../src/lib/db/connect";
import { alignXpToCoins } from "../src/lib/gamification/backfill";
import { AppSettings } from "../src/lib/db/models/app-settings.model";
import { parseGamification } from "../src/lib/gamification/config";

// O'quvchilarning XP sini oldingi reyting ko'rsatkichiga (totalCoins) tenglashtiradi — reytingdagi o'rinlar saqlanadi.
// Har o'quvchiga bir marta qo'llanadi (idempotent).
//   Ko'rib chiqish:  npx tsx --env-file=.env.local scripts/align-xp.ts --dry-run
//   Yozish:          npx tsx --env-file=.env.local scripts/align-xp.ts
// Production'da ishga tushirishdan oldin bazaning zaxira nusxasini oling.

if (!process.env.MONGODB_URI) {
  console.error("XATO: MONGODB_URI muhit o'zgaruvchisi topilmadi");
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await connectToDatabase();
  const settings = await AppSettings.findOne({ key: "global" }).lean();
  const { levelThresholds } = parseGamification(settings?.gamification);

  const result = await alignXpToCoins({ dryRun, levelThresholds });
  console.log(`${dryRun ? "[DRY-RUN] " : ""}O'quvchilar: ${result.students}, o'zgaradiganlar: ${result.changes.length}`);
  console.table(
    result.changes.map((c) => ({ "O'quvchi": c.fullName, "XP": `${c.xpFrom} → ${c.xpTo}`, "Daraja": `${c.levelFrom} → ${c.levelTo}` }))
  );
  console.log(dryRun ? "Hech narsa yozilmadi. Yozish uchun --dry-run'siz ishga tushiring." : "Saqlandi.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
