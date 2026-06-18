"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MembershipCard from "@/components/ui/MembershipCard";

interface AppUser { email: string; firstName: string; lastName: string; }

export default function MembershipPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("cs_user");
    if (!raw) { router.replace("/auth?redirect=/membership"); return; }
    try { setUser(JSON.parse(raw)); }
    catch { router.replace("/auth?redirect=/membership"); }
  }, [router]);

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(10,10,10,0.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 1.25rem", height: 56, display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/profile" style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1, textDecoration: "none", display: "flex", alignItems: "center" }}>←</Link>
        <span style={{ fontSize: "0.9rem", fontWeight: 700 }}>Membership</span>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "1.25rem 1.25rem 6rem" }}>
        <MembershipCard
          email={user.email}
          name={`${user.firstName} ${user.lastName}`.trim()}
        />
      </div>
    </div>
  );
}
