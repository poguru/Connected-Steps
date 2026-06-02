"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface Transaction {
  type:       "membership" | "run";
  label:      string;
  date:       string;
  amount:     number;
  payment_id: string;
  status:     string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function PaymentHistoryPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    let email = "";
    try {
      const u = JSON.parse(localStorage.getItem("cs_user") ?? "{}");
      email = u.email ?? "";
    } catch { /* ignore */ }

    if (!email) { router.replace("/auth?tab=signin&redirect=/payments"); return; }

    fetch(`/api/user/payments?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => setTransactions(d.transactions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,28,45,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(56,189,248,0.08)", height: "64px", display: "flex", alignItems: "center", padding: "0 2rem", gap: "0.75rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <span style={{ color: "#444", fontSize: "0.8rem" }}>/</span>
        <span style={{ fontSize: "0.85rem", color: "var(--cs-muted)" }}>Payment History</span>
        <Link href="/dashboard" style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none", padding: "6px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}>← Dashboard</Link>
      </header>

      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "3rem 1.5rem" }}>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.4rem" }}>Payment History</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "2rem" }}>All your membership and event payments.</p>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--cs-muted)", fontSize: "0.875rem" }}>Loading…</div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🧾</div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>No payments yet</div>
            <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Your membership and event payments will appear here.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {transactions.map((t, i) => (
              <div key={i} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1.1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>

                {/* Icon */}
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: t.type === "membership" ? "rgba(255,122,0,0.12)" : "rgba(56,189,248,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>
                  {t.type === "membership" ? "🏃" : "🎽"}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "3px" }}>{t.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cs-muted)" }}>{fmtDate(t.date)}</div>
                  <div style={{ fontSize: "10px", color: "#555", marginTop: "2px", fontFamily: "monospace" }}>{t.payment_id}</div>
                </div>

                {/* Amount + status */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)" }}>{fmtAmount(t.amount)}</div>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(74,222,128,0.1)", color: "#4ade80" }}>
                    {t.status.toUpperCase()}
                  </span>
                </div>

              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: "11px", color: "#444", marginTop: "2rem", textAlign: "center" }}>
          For billing queries, reach us at{" "}
          <a href="mailto:connected.steps2106@gmail.com" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>connected.steps2106@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
