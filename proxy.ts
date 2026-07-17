import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Cookie names ──────────────────────────────────────────────────────────────

const ADMIN_SESSION_COOKIE = "cs_admin_session";
const COACH_SESSION_COOKIE = "cs_coach_session";
const USER_SESSION_COOKIE  = "cs_user_session";   // httpOnly (new sessions)
const USER_LEGACY_COOKIE   = "cs_auth";            // client-set (pre-migration)

// ── Route tables ──────────────────────────────────────────────────────────────

// Any authenticated user (regular, coach, or admin) may access these pages.
const USER_PREFIXES: string[] = [
  "/dashboard", "/profile", "/notifications", "/achievements",
  "/referrals", "/membership", "/messages", "/my-questions",
  "/feed", "/community", "/leaderboard", "/food-analyzer",
  "/payments",  // user transaction history
];

// Only coaches AND admins may access these pages.
// Login page is excluded so unauthenticated coaches can reach it.
const COACH_PREFIXES: string[] = ["/coach"];
const COACH_PUBLIC: string[]   = ["/coach/login"];

// Only admins may access these pages.
// /admin/login is excluded so unauthenticated admins can reach it.
const ADMIN_PREFIXES: string[] = ["/admin", "/analytics"];
const ADMIN_PUBLIC: string[]   = ["/admin/login"];

const corsOptions = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

// ── Edge-compatible token validators ─────────────────────────────────────────
// The Node.js `crypto` module is unavailable in the Edge runtime, so we use
// Web Crypto API (available in all modern runtimes including Vercel Edge).

/**
 * Fast expiry check from the embedded timestamp in a 3-part user token.
 * Does NOT verify the HMAC — the full check happens in each API route handler.
 * Returns false immediately for malformed or expired tokens.
 */
function isUserTokenApparentlyValid(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const exp = parseInt(parts[1], 10);
  return Number.isFinite(exp) && Math.floor(Date.now() / 1000) < exp;
}

/** HMAC-SHA256 via Web Crypto for use in Edge functions. */
async function edgeHmacHex(secret: string, message: string): Promise<string> {
  const enc    = new TextEncoder();
  const key    = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time hex string comparison to resist timing attacks. */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Decode a base64url string to a UTF-8 string. */
function fromBase64url(b64url: string): string {
  const b64  = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad  = "=".repeat((4 - (b64.length % 4)) % 4);
  const buf  = Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
  return new TextDecoder().decode(buf);
}

/**
 * Verify cs_admin_session cookie.
 * Token format: base64url("admin:<exp_epoch>").hex(hmac("admin:<exp_epoch>"))
 */
async function verifyAdminCookie(token: string): Promise<boolean> {
  const secret = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return false;
  try {
    const payload     = fromBase64url(token.slice(0, lastDot));
    const givenHex    = token.slice(lastDot + 1);
    const expectedHex = await edgeHmacHex(secret, payload);
    if (!hexEqual(expectedHex, givenHex)) return false;
    const expires = parseInt(payload.split(":")[1], 10);
    return Number.isFinite(expires) && Math.floor(Date.now() / 1000) < expires;
  } catch {
    return false;
  }
}

/**
 * Verify cs_coach_session cookie.
 * Token format: base64url(email).hex(hmac(email))  — no expiry in token;
 * expiry is enforced by the cookie's own maxAge (30 days).
 */
async function verifyCoachCookie(token: string): Promise<boolean> {
  const secret = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return false;
  try {
    const email       = fromBase64url(token.slice(0, dotIdx)).toLowerCase();
    const givenHex    = token.slice(dotIdx + 1);
    const expectedHex = await edgeHmacHex(secret, email);
    return hexEqual(expectedHex, givenHex);
  } catch {
    return false;
  }
}

// ── Session presence helpers (no crypto — cheap checks) ──────────────────────

/** Returns true when any recognisable user/coach/admin session exists. */
function hasAnySession(request: NextRequest): boolean {
  return !!(
    request.cookies.get(USER_SESSION_COOKIE)?.value ||
    request.cookies.get(USER_LEGACY_COOKIE)?.value  ||
    request.cookies.get(COACH_SESSION_COOKIE)?.value ||
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  );
}

// ── Redirect helpers ──────────────────────────────────────────────────────────

function redirectTo(base: string, request: NextRequest, extra?: string): NextResponse {
  const url = new URL(base, request.url);
  url.searchParams.set("redirect", request.nextUrl.pathname);
  if (extra) url.searchParams.set("reason", extra);
  return NextResponse.redirect(url);
}

function redirectUnauthorized(request: NextRequest): NextResponse {
  const url = new URL("/unauthorized", request.url);
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// ── Main middleware ───────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Admin-only routes (/admin/*, /analytics/*, /payments/*) ─────────────
  const isAdminPath = ADMIN_PREFIXES.some(p => pathname.startsWith(p));
  const isAdminPublicPath = ADMIN_PUBLIC.some(p => pathname === p || pathname.startsWith(p + "/"));

  if (isAdminPath && !isAdminPublicPath) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const valid = token ? await verifyAdminCookie(token) : false;

    if (!valid) {
      // Redirect to admin login if not authenticated at all, or to /unauthorized
      // if they have a user/coach session (wrong role, not unauthenticated).
      const hasSession = hasAnySession(request);
      if (hasSession) return redirectUnauthorized(request);
      // /analytics/* and /payments/* can't use /admin/login directly, so
      // send all unauthenticated admin-route visitors to /admin/login.
      return redirectTo("/admin/login", request);
    }
    return NextResponse.next();
  }

  // ── Coach-only routes (/coach/* except /coach/login) ─────────────────────
  const isCoachPath = COACH_PREFIXES.some(p => pathname.startsWith(p));
  const isCoachPublicPath = COACH_PUBLIC.some(p => pathname === p || pathname.startsWith(p + "/"));

  if (isCoachPath && !isCoachPublicPath) {
    const coachToken = request.cookies.get(COACH_SESSION_COOKIE)?.value;
    const adminToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

    // Admin can always access coach pages (for support / impersonation).
    const adminValid = adminToken ? await verifyAdminCookie(adminToken) : false;
    if (adminValid) return NextResponse.next();

    const coachValid = coachToken ? await verifyCoachCookie(coachToken) : false;
    if (coachValid) return NextResponse.next();

    // Coach/admin session missing: determine if they're a regular user or unknown.
    const hasUserSession = !!(
      request.cookies.get(USER_SESSION_COOKIE)?.value ||
      request.cookies.get(USER_LEGACY_COOKIE)?.value
    );
    if (hasUserSession) return redirectUnauthorized(request);
    return redirectTo("/coach/login", request);
  }

  // ── User-accessible routes (/dashboard, /feed, /profile, etc.) ───────────
  // Any authenticated user (regular, coach, or admin) is allowed.
  if (USER_PREFIXES.some(p => pathname.startsWith(p))) {
    const userToken    = request.cookies.get(USER_SESSION_COOKIE)?.value
                      ?? request.cookies.get(USER_LEGACY_COOKIE)?.value;
    const coachCookie  = request.cookies.get(COACH_SESSION_COOKIE)?.value;
    const adminCookie  = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

    // Fast path: user session present and not obviously expired
    if (userToken && isUserTokenApparentlyValid(userToken)) {
      // Falls through to cookie-injection below
    } else if (coachCookie || adminCookie) {
      // Coach or admin — allowed on user routes (just pass through)
    } else {
      // No recognisable session
      return redirectTo("/auth", request);
    }
  }

  // ── CORS preflight ────────────────────────────────────────────────────────
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

  // ── Inject cs_user_session cookie as x-user-token request header ─────────
  // Lets all 60+ API route handlers (which read x-user-token) work without
  // changes. Middleware-injected value takes precedence over client-sent header,
  // preventing header forgery when a valid session cookie is present.
  const sessionToken   = request.cookies.get(USER_SESSION_COOKIE)?.value;
  const requestHeaders = new Headers(request.headers);
  if (sessionToken) {
    requestHeaders.set("x-user-token", sessionToken);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (isLocalhost) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    Object.entries(corsOptions).forEach(([k, v]) => response.headers.set(k, v));
  }

  // ── Security headers ──────────────────────────────────────────────────────
  response.headers.set("X-Frame-Options",        "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options",  "nosniff");
  response.headers.set("Referrer-Policy",         "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection",        "1; mode=block");
  response.headers.set("Permissions-Policy",      "camera=(self), microphone=(), geolocation=(), payment=(self)");
  // Mirror of ENFORCED_CSP in next.config.ts — keep the two in sync.
  // next.config.ts covers public/unmatched routes; middleware covers matched routes.
  const cspValue = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com https://checkout-static-next.razorpay.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://lh3.googleusercontent.com https://cdn.razorpay.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com",
    "frame-src https://checkout.razorpay.com https://api.razorpay.com",
    "frame-ancestors 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
  response.headers.set("Content-Security-Policy", cspValue);

  return response;
}

export const config = {
  matcher: [
    // Admin-only pages
    "/admin/:path*",
    "/analytics/:path*",
    // Coach-only pages
    "/coach/:path*",
    // Authenticated user pages
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
    "/payments/:path*",
    // All API routes (for CORS, rate limiting, and cookie injection)
    "/api/:path*",
  ],
};
