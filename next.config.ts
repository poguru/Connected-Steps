import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "X-Frame-Options",              value: "DENY" },
  { key: "Referrer-Policy",              value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security",    value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy",           value: "camera=(self), microphone=(), geolocation=()" },
  { key: "X-XSS-Protection",            value: "1; mode=block" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase storage (project URL varies — match any project)
      { protocol: "https", hostname: "*.supabase.co",  pathname: "/storage/v1/object/**" },
      { protocol: "https", hostname: "*.supabase.in",  pathname: "/storage/v1/object/**" },
      // Google user photos (OAuth profile pictures)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
