import mongoose from "mongoose";

declare global {
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  } | undefined;
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI muhit o'zgaruvchisi aniqlanmagan (.env faylini tekshiring)");
  }

  if (cached!.conn) {
    return cached!.conn;
  }

  if (!cached!.promise) {
    // VPS: 2 ta doimiy server nusxasi. Har biriga 30 ta ulanish (jami 60, Atlas M0 chegarasi 500):
    // savol paytida 100 ta javob birdan kelganda so'rovlar ulanish kutib navbatda turmaydi.
    // minPoolSize — bir nechta ulanish doim tayyor (birinchi so'rovda TLS ulanishini kutmaslik uchun)
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: Number(process.env.MONGODB_POOL_SIZE) || 30,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    };

    cached!.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached!.conn = await cached!.promise;
  } catch (e) {
    cached!.promise = null;
    throw e;
  }

  return cached!.conn;
}

export const connectDB = connectToDatabase;

