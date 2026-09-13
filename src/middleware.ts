import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "sp_auth";

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Cron route authenticates via its own bearer header; skip the cookie gate.
  if (pathname.startsWith("/api/cron")) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next(); // no gate configured

  if (req.cookies.get(COOKIE)?.value === password) return NextResponse.next();

  if (searchParams.get("pw") === password) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("pw");
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, password, { httpOnly: true, sameSite: "lax", path: "/" });
    return res;
  }

  return new NextResponse("Unauthorized. Append ?pw=YOUR_PASSWORD to the URL.", { status: 401 });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
