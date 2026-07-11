import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy",        value: "camera=(self), microphone=(), geolocation=()" },
  { key: "X-XSS-Protection",          value: "1; mode=block" },

  // ── Content-Security-Policy (Report-Only mode) ────────────────────────────
  // In report-only mode this header NEVER blocks requests — it only sends
  // violation reports to the console (no report-uri configured yet).
  // This lets us observe what a strict CSP would block before enforcing it.
  //
  // Rollback: delete this entry — zero functional impact.
  // Promote to enforcement: change key to "Content-Security-Policy".
  //
  // Why these directives:
  //   script-src 'unsafe-inline' 'unsafe-eval' — Next.js App Router requires
  //     both for hydration and dynamic imports.
  //   connect-src — covers Supabase PostgREST, Upstash Redis REST, Razorpay,
  //     Meta WhatsApp Cloud API (all go through our server-side routes).
  //   img-src data: — Next.js <Image> uses data: URIs for blur placeholder.
  {
    key:   "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.razorpay.com https://*.upstash.io",
      "frame-src https://api.razorpay.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
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
