"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface Reg {
  id: string; registration_code: string; user_email: string; user_name: string;
  phone: string | null; blood_group: string | null; coupon_code: string | null;
  coupon_discount: number; original_price: number; final_price: number;
  payment_status: string; razorpay_payment_id: string | null; status: string;
  created_at: string;
  events: { id: string; title: string; start_date: string; location: string } | null;
}
interface Summary { total: number; paid: number; free: number; pending: number; revenue: number }

const S: Record<string, React.CSSProperties> = {
  card: { background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "1.25rem" },
  input: { padding: "9px 13px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" },
};

function payBadge(s: string) {
  const c = s === "paid" ? "#4ade80" : s === "free" ? "#60a5fa" : s === "pending" ? "#eab308" : "#888";
  return <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: 999, background: `${c}18`, border: `1px solid ${c}30`, color: c, fontWeight: 700 }}>{s.toUpperCase()}</span>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminRegistrationsPage() {
  const [password, setPassword] = useState("");
  const [authed,   setAuthed]   = useState(false);
  const [authErr,  setAuthErr]  = useState("");

  const [regs,    setRegs]    = useState<Reg[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState<"all" | "paid" | "free" | "pending">("all");

  const headers = { "Content-Type": "application/json" };

  async function load() {
    setLoading(true); setAuthErr("");
    try {
      const res = await fetch("/api/admin/events/registrations");
      const json = await res.json();
      if (!res.ok) { setAuthErr(json.error ?? "Failed to load"); return; }
      setRegs(json.registrations ?? []);
      setSummary(json.summary ?? null);
    } catch { setAuthErr("Network error."); }
    finally { setLoading(false); }
  }

  async function login(e: React.SyntheticEvent) {
    e.preventDefault(); setLoading(true); setAuthErr("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setAuthErr("Incorrect password."); return; }
      setAuthed(true);
    } catch { setAuthErr("Network error."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { if (authed) load(); }, [authed]); // eslint-disable-line

  async function cancel(id: string) {
    if (!confirm("Cancel this registration?")) return;
    const res = await fetch("/api/admin/events/registrations", { method: "PATCH", headers, body: JSON.stringify({ id, status: "cancelled" }) });
    if (res.ok) setRegs(r => r.map(x => x.id === id ? { ...x, status: "cancelled" } : x));
  }

  function exportCSV() {
    const rows = [
      ["Code", "Name", "Email", "Phone", "Event", "Date", "Location", "Price", "Discount", "Final", "Payment", "Status", "Registered"].join(","),
      ...regs.map(r => [
        r.registration_code, r.user_name, r.user_email, r.phone ?? "",
        r.events?.title ?? "", r.events?.start_date ?? "", r.events?.location ?? "",
        r.original_price, r.coupon_discount, r.final_price,
        r.payment_status, r.status,
        new Date(r.created_at).toLocaleDateString("en-IN"),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows);
    a.download = `cs-registrations-${Date.now()}.csv`;
    a.click();
  }

  const filtered = regs
    .filter(r => filter === "all" || r.payment_status === filter)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.user_name.toLowerCase().includes(q)
        || r.user_email.toLowerCase().includes(q)
        || r.registration_code.toLowerCase().includes(q)
        || r.events?.title?.toLowerCase().includes(q);
    });

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", marginBottom: "2.5rem", justifyContent: "center" }}>
          <Image src="/logo.png" alt="" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>Admin · Registrations</span>
        </Link>
        <div style={S.card}>
          <form onSubmit={login}>
            <label style={{ display: "block", fontSize: "11px", color: "#888", marginBottom: "5px" }}>Password</label>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthErr(""); }} autoFocus style={{ ...S.input, width: "100%", marginBottom: "1rem", boxSizing: "border-box" }} />
            {authErr && <div style={{ color: "#f09595", fontSize: "0.8rem", marginBottom: "0.75rem" }}>{authErr}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Checking…" : "Access Dashboard"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/admin" style={{ textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ fontWeight: 600 }}>Admin</span>
        <span style={{ color: "#444" }}>/</span>
        <Link href="/admin/events" style={{ color: "#888", textDecoration: "none", fontSize: "0.85rem" }}>Events</Link>
        <span style={{ color: "#444" }}>/</span>
        <span style={{ color: "#888", fontSize: "0.85rem" }}>Registrations</span>
        <button onClick={exportCSV} style={{ marginLeft: "auto", padding: "6px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>
          Export CSV
        </button>
      </header>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Summary cards */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: "0.875rem", marginBottom: "2rem" }}>
            {[
              { label: "Total", value: summary.total, color: "#fff" },
              { label: "Paid", value: summary.paid, color: "#4ade80" },
              { label: "Free", value: summary.free, color: "#60a5fa" },
              { label: "Pending", value: summary.pending, color: "#eab308" },
              { label: "Revenue", value: `₹${summary.revenue.toLocaleString("en-IN")}`, color: "#e8620a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...S.card, textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, code, event…"
            style={{ ...S.input, flex: "1 1 240px" }} />
          <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.04)", borderRadius: "7px", padding: "3px" }}>
            {(["all","paid","free","pending"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: "5px 14px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, background: filter === f ? "#e8620a" : "transparent", color: filter === f ? "#fff" : "#888", fontFamily: "inherit" }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  {["Code", "Participant", "Event", "Date", "Price", "Payment", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#555" }}>No registrations found.</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontFamily: "monospace", color: "#e8620a", fontSize: "0.78rem" }}>{r.registration_code}</span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600, color: "#fff" }}>{r.user_name}</div>
                      <div style={{ color: "#666", fontSize: "0.75rem" }}>{r.user_email}</div>
                      {r.phone && <div style={{ color: "#555", fontSize: "0.72rem" }}>{r.phone}</div>}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#ccc" }}>{r.events?.title ?? "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#888", whiteSpace: "nowrap" }}>{r.events?.start_date ? fmtDate(r.events.start_date) : "—"}</td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#fff" }}>₹{r.final_price}</div>
                      {r.coupon_discount > 0 && <div style={{ color: "#4ade80", fontSize: "0.72rem" }}>−₹{r.coupon_discount} ({r.coupon_code})</div>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>{payBadge(r.payment_status)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: 999, background: r.status === "confirmed" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)", color: r.status === "confirmed" ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {r.status !== "cancelled" && (
                        <button onClick={() => cancel(r.id)}
                          style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid rgba(239,68,68,0.3)", background: "transparent", color: "#f09595", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: "0.75rem", fontSize: "11px", color: "#555" }}>
          {filtered.length} of {regs.length} registrations
        </div>
      </div>
    </div>
  );
}
