import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// QR davomat havolasi (/a/<token>): tizimga kirmagan o'quvchi login sahifasiga
// tokenni yo'qotmasdan yo'naltiriladi. (Dashboard layout'i yo'lni bilmagani uchun
// `next` parametrini o'zi qo'sha olmaydi.) Sessiyaning haqiqiyligi sahifada tekshiriladi.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("itxiva_session")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/a/:token",
};
