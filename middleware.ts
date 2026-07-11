import { NextRequest, NextResponse } from "next/server";

/**
 * Edge-compatible admin session verification.
 * Mirrors verifyAdminSession() from lib/admin-auth.ts using Web Crypto API
 * (Buffer / Node crypto are not available in Edge runtime).
 */
async function verifyAdminCookie(token: string): Promise<boolean> {
  const secret = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) return false;

  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return false;

  const payloadB64 = token.slice(0, lastDot);
  const givenHex   = token.slice(lastDot + 1);

  try {
    // base64url → ASCII string (payload is always ASCII: "admin:<epoch>")
    const b64    = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad    = "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = atob(b64 + pad);

    // Compute expected HMAC-SHA256
    const enc    = new TextEncoder();
    const key    = await crypto.subtle.importKey(
      "raw", enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false, ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const expectedHex = Array.from(new Uint8Array(sigBuf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time string comparison (XOR all chars)
    if (expectedHex.length !== givenHex.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      diff |= expectedHex.charCodeAt(i) ^ givenHex.charCodeAt(i);
    }
    if (diff !== 0) return false;

    // Check expiry — payload is "admin:<epoch_seconds>"
    const expires = parseInt(payload.split(":")[1], 10);
    return Number.isFinite(expires) && Math.floor(Date.now() / 1000) < expires;
  } catch {
    return false;
  }
}

const ADMIN_SESSION_COOKIE = "cs_admin_session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let the login page through — avoids redirect loop
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const valid = token ? await verifyAdminCookie(token) : false;

  if (!valid) {
    const loginUrl = new URL("/admin/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
