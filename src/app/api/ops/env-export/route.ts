import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// VAQTINCHALIK (Vercel → VPS ko'chishi uchun, ish tugashi bilan o'chiriladi).
// Vercel "Sensitive" kalitlarni CLI orqali bermaydi; ular faqat shu yerda, ishlab turgan saytda mavjud.
// Himoya ikki qavat:
//  1) so'rov faqat VPS'dagi maxfiy token bilan qabul qilinadi (kodda faqat uning SHA-256 xeshi turadi);
//  2) javob faqat VPS'ning ochiq kaliti bilan shifrlanadi (RSA-OAEP-256 + AES-256-GCM) — ochish kaliti faqat VPS'da.
export const dynamic = "force-dynamic";

const TOKEN_SHA256 = "6b2bcd71e9ae56aff3af730f20a66eafb50047843fed76fda5e0c992e011650d";

const VPS_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAoeIdNg/dmCWbJCcb6N1X
SoqQGQiq6+YokVbA4CshwNDCh26MNjk2e85X1Th6SSgHPMV+NYTlh/T1aTs++sbG
EWg5CTS+msl20QWmPgNf8PyEeg+Fl2JpT+ueOb6pcnIB5trNPqcV84cESbBnN/ja
VR7GmOMjj7DL6AZBZHDlueO0BLuC6jhYDaWhRVEjMx2axllzqke/OWwYY4jnKpz5
rFlTpVeWiYg2GJMSuQAxG2WQWjcRawQGBq95tNbuHVq8ohCP//MCtlBQ/KLvNu1Y
crsVrWbCR3vFBydXW4UEDucrgTnTMdA2yByX0esYuqpN73PIOJxsnu2yvVmRxImp
4NOyhkXBBIHNkbNCi4DwupS27F1qQpB1ErdxqeLxKJG1kaHx3wLnEmjaWuXZUw+E
ssTQBOSCX029/8uMwTKWfU0bEAiekQ46ErY0pyRiyStP9qlf29xlKMHYvZPhCkM3
4CheDdpjXaeXivUG/0UTo4uxkIXl5FdbYbnmVUdQvV9w1+sj7X11/OuACrQwmB5s
IO/0U64uRUfivSVOkvy7BfglhC6yfb9TjB5OPHlUyutxMDMH2h9T3pXS7k99NU6G
CNuWJpJNlKF2Y6WBMbd6ieIeFUwGjPOFPeTxY+k2dxz2tSfCOGoXh5jTw9ztbzQd
eR/Ca9eHeD8SBpGftftycecCAwEAAQ==
-----END PUBLIC KEY-----`;

const KEYS = [
  "MONGODB_URI",
  "JWT_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_WEBHOOK_SECRET",
  "CRON_SECRET",
  "ARENA_SECRET",
];

function tokenOk(req: NextRequest): boolean {
  const got = crypto.createHash("sha256").update(req.headers.get("x-export-token") ?? "").digest();
  return crypto.timingSafeEqual(got, Buffer.from(TOKEN_SHA256, "hex"));
}

export function POST(req: NextRequest) {
  if (!tokenOk(req)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const env: Record<string, string> = {};
  for (const k of KEYS) env[k] = process.env[k] ?? "";
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(env), "utf8"), cipher.final()]);
  const key = crypto.publicEncrypt(
    { key: VPS_PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    aesKey,
  );
  return NextResponse.json(
    {
      key: key.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
