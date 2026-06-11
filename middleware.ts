/**
 * Next.js Edge Middleware — admin password rate limiting.
 *
 * Runs before every /api/admin/** handler. Intercepts requests that
 * carry the x-admin-password header and enforces a 5-failure / 15-minute
 * window per IP address.
 *
 * Token-based requests (x-coach-token / cs_coach_session cookie) carry
 * no password header and pass through immediately — no overhead.
 *
 * Successful password requests are never counted as failures, so
 * legitimate admins are not affected.
 */

import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited, recordFailure, MAX_FAILURES } from "@/lib/rate-limit";

export function middleware(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");

  // No password header → coach-token or cookie auth; skip entirely.
  if (!pw) return NextResponse.next();

  const ip  = getClientIp(req);
  const key = `adminpw:${ip}`;

  // Already over the limit — block before the route handler runs.
  if (isRateLimited(key)) {
    console.warn(
      `[rate-limit] BLOCKED IP=${ip} path=${req.nextUrl.pathname} — exceeded ${MAX_FAILURES} failed admin-password attempts`,
    );
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  // Wrong password — record the failure, then let the route handler
  // produce its normal 401 so the existing UX is unchanged.
  if (pw !== process.env.ADMIN_PASSWORD) {
    const count = recordFailure(key);
    console.warn(
      `[rate-limit] FAILED admin-password IP=${ip} path=${req.nextUrl.pathname} attempt=${count}/${MAX_FAILURES}`,
    );
    return NextResponse.next();
  }

  // Correct password — pass through without recording a failure.
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
