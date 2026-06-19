import { NextRequest, NextResponse } from "next/server";

// Middleware protects user-facing authenticated routes against flash-of-content.
// Security enforcement (token verification) happens in each API route.
// Admin and coach routes (/admin, /coach) have their own session mechanisms and
// are intentionally excluded from this matcher.

export function middleware(req: NextRequest) {
  const token = req.cookies.get("cs_auth")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("redirect", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/notifications/:path*",
    "/achievements/:path*",
    "/referrals/:path*",
    "/membership/:path*",
    "/messages/:path*",
    "/my-questions/:path*",
    "/feed/:path*",
    "/community/:path*",
    "/leaderboard/:path*",
  ],
};
