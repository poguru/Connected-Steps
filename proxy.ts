import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp, isRateLimited, recordFailure, MAX_FAILURES } from "@/lib/rate-limit";

const corsOptions = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Auth-protected user-facing routes (cookie gate — token verification is in each API route)
const PROTECTED_PREFIXES = [
  "/dashboard", "/profile", "/notifications", "/achievements",
  "/referrals", "/membership", "/messages", "/my-questions",
  "/feed", "/community", "/leaderboard", "/food-analyzer",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── User route auth gate ───────────────────────────────────────────────────
  if (PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) {
    const token = request.cookies.get("cs_auth")?.value;
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── API: CORS + admin rate limiting ───────────────────────────────────────
  const origin      = request.headers.get("origin") ?? "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (request.method === "OPTIONS") {
    return NextResponse.json({}, {
      headers: {
        ...(isLocalhost && { "Access-Control-Allow-Origin": origin }),
        ...corsOptions,
      },
    });
  }

  if (pathname.startsWith("/api/admin/")) {
    const pw = request.headers.get("x-admin-password");
    if (pw) {
      const ip  = getClientIp(request);
      const key = `adminpw:${ip}`;

      if (await isRateLimited(key)) {
        console.warn(`[rate-limit] BLOCKED IP=${ip} path=${pathname} — exceeded ${MAX_FAILURES} failed admin-password attempts`);
        return NextResponse.json(
          { error: "Too many failed attempts. Try again in 15 minutes." },
          { status: 429 },
        );
      }

      if (pw !== process.env.ADMIN_PASSWORD) {
        const count = await recordFailure(key);
        console.warn(`[rate-limit] FAILED admin-password IP=${ip} path=${pathname} attempt=${count}/${MAX_FAILURES}`);
      }
    }
  }

  const response = NextResponse.next();
  if (isLocalhost) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    Object.entries(corsOptions).forEach(([k, v]) => response.headers.set(k, v));
  }
  return response;
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
    "/food-analyzer/:path*",
    "/api/:path*",
  ],
};
