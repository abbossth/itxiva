import { NextResponse } from "next/server";

// Hozir ishlayotgan versiya (brauzerdagi sahifa eskirganini bilishi uchun)
export const dynamic = "force-dynamic";

export function GET() {
  const build = process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return NextResponse.json({ build }, { headers: { "Cache-Control": "no-store" } });
}
