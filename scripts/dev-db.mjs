// Lokal ishlab chiqish uchun MongoDB (mongodb-memory-server orqali).
// Ma'lumotlar .mongo-data/ papkasida saqlanadi va qayta ishga tushirilganda yo'qolmaydi.
// Ishga tushirish: npm run db
import { MongoMemoryServer } from "mongodb-memory-server";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.DEV_DB_PORT || 27017);
const dbPath = resolve(process.cwd(), ".mongo-data");
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { port: PORT, dbPath, storageEngine: "wiredTiger", dbName: "itxiva" },
});

console.log(`MongoDB ishga tushdi: ${mongod.getUri()}itxiva`);
console.log("To'xtatish uchun Ctrl+C bosing.");

const shutdown = async () => {
  await mongod.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
