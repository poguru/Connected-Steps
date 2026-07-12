import type { NextConfig } from "next";

// Single source of truth for the enforced CSP.
// Keep this in sync with the mirror copy in proxy.ts (middleware).
// Why each directive:
//   script-src 'unsafe-inline' 'unsafe-eval' — Next.js App Router hydration requires both.
//   img-src supabase domains — user photos, event images; lh3.googleusercontent.com — Google OAuth
//     profile pictures; cdn.razorpay.com — Razorpay checkout UI logo.
//   connect-src — Supabase REST/Realtime (co + in suffixes), Razorpay client SDK.
//     ZeptoMail, Meta WhatsApp, Upstash are server-side only and must NOT appear here.
//   frame-src — Razorpay checkout renders its payment form in an iframe from both domains.
//   upgrade-insecure-requests — auto-upgrade any stray HTTP sub-resource to HTTPS.
const ENFORCED_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://lh3.googleusercontent.com https://cdn.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://api.razorpay.com https://checkout.razorpay.com",
  "frame-src https://checkout.razorpay.com https://api.razorpay.com",
  "frame-ancestors 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff" },
  // SAMEORIGIN (not DENY) aligns with CSP frame-ancestors 'self'; DENY would
  // also block legitimate same-origin embedding if ever needed.
  { key: "X-Frame-Options",           value: "SAMEORIGIN" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy",        value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
  { key: "X-XSS-Protection",          value: "1; mode=block" },

  // ── Content-Security-Policy (enforcement) ────────────────────────────────
  // Applied globally by next.config.ts so that public routes (/pricing,
  // /events, etc.) are also protected, not just middleware-matched routes.
  { key: "Content-Security-Policy", value: ENFORCED_CSP },

  // ── Content-Security-Policy-Report-Only (monitoring) ─────────────────────
  // Same policy as enforcement. Browsers report violations to the console
  // even for already-blocked requests, so this surfaces any gaps introduced
  // by future feature work without needing a separate report-uri endpoint.
  { key: "Content-Security-Policy-Report-Only", value: ENFORCED_CSP },
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Supabase storage (project URL varies — match any project)
      { protocol: "https", hostname: "*.supabase.co",  pathname: "/storage/v1/object/**" },
      { protocol: "https", hostname: "*.supabase.in",  pathname: "/storage/v1/object/**" },
      // Supabase image transform endpoint (used by thumbUrl utility)
      { protocol: "https", hostname: "*.supabase.co",  pathname: "/storage/v1/render/**" },
      { protocol: "https", hostname: "*.supabase.in",  pathname: "/storage/v1/render/**" },
      // Google user photos (OAuth profile pictures)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async headers() {
    return [
      {
        source:  "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
