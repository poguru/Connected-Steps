import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
