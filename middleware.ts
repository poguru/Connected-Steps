import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Security headers applied to every response.
// QR image endpoint is excluded (served as image/svg+xml, needs loose CSP).
export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Prevent click-jacking
  res.headers.set("X-Frame-Options", "SAMEORIGIN");

  // Prevent MIME-type sniffing
  res.headers.set("X-Content-Type-Options", "nosniff");

  // Control referrer leakage
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Restrict browser feature access
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(self)");

  // Legacy XSS protection header (belt-and-suspenders)
  res.headers.set("X-XSS-Protection", "1; mode=block");

  // Content-Security-Policy
  // - 'unsafe-inline' for styles: Next.js injects inline styles/scripts
  // - 'unsafe-eval' for scripts: Next.js dev mode + some libraries require it
  // - checkout.razorpay.com: payment iframe
  // - *.supabase.co: database + storage + realtime
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://checkout.razorpay.com https://resend.com",
    "frame-src https://checkout.razorpay.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);

  return res;
}

export const config = {
  // Apply to all routes except Next.js internals and static assets
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp).*)",
  ],
};
