"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ROLE_DEFAULT_MODULE } from "@/lib/ops-auth";
import type { OpsRole } from "@/lib/ops-auth";

// /ops/[slug] — redirects to the volunteer's assigned module, or to login
export default function OpsRootPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router   = useRouter();

  useEffect(() => {
    fetch("/api/ops/auth")
      .then(r => r.ok ? r.json() : null)
      .then((d: { role?: string } | null) => {
        if (!d?.role) { router.replace(`/ops/${slug}/login`); return; }
        const module = ROLE_DEFAULT_MODULE[d.role as OpsRole] ?? "dashboard";
        router.replace(`/ops/${slug}/${module}`);
      })
      .catch(() => router.replace(`/ops/${slug}/login`));
  }, [slug, router]);

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#e8620a", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
