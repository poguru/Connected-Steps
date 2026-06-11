import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp, isRateLimited, recordFailure, MAX_FAILURES } from "@/lib/rate-limit";

const corsOptions = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (request.method === "OPTIONS") {
    return NextResponse.json({}, {
      headers: {
        ...(isLocalhost && { "Access-Control-Allow-Origin": origin }),
        ...corsOptions,
      },
    });
  }

  // Admin password rate limiting — runs before the route handler.
  // Token/cookie-based requests carry no x-admin-password and skip this entirely.
  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    const pw = request.headers.get("x-admin-password");
    if (pw) {
      const ip  = getClientIp(request);
      const key = `adminpw:${ip}`;

      if (isRateLimited(key)) {
        console.warn(
          `[rate-limit] BLOCKED IP=${ip} path=${request.nextUrl.pathname} — exceeded ${MAX_FAILURES} failed admin-password attempts`,
        );
        return NextResponse.json(
          { error: "Too many failed attempts. Try again in 15 minutes." },
          { status: 429 },
        );
      }

      if (pw !== process.env.ADMIN_PASSWORD) {
        const count = recordFailure(key);
        console.warn(
          `[rate-limit] FAILED admin-password IP=${ip} path=${request.nextUrl.pathname} attempt=${count}/${MAX_FAILURES}`,
        );
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
  matcher: "/api/:path*",
};
