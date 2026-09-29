import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Coarse gate for PAGES only: redirect visitors without a session cookie to /signin.
// This is a presence check (no DB hit, edge-safe); real per-request authorization
// happens in each API route via resolveActorUserId. API routes are excluded from the
// matcher so the token-authenticated Klaviyo agent (no cookie) is never redirected.
export function middleware(req: NextRequest) {
  const hasSession = getSessionCookie(req);
  if (!hasSession) {
    return NextResponse.redirect(new URL("/signin", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|signin|_next/static|_next/image|favicon.ico|logo.png|icon.png|apple-icon.png).*)"],
};
