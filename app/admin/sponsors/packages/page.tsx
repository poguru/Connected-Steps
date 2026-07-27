"use client";

import { useState, useEffect, useCallback } from "react";

interface SponsorPackage {
  id: string;
  name: string;
  description: string | null;
  price_paise: number;
  price_rupees: number;
  deliverables: Array<{ item: string; qty?: number }>;
  is_active: boolean;
  display_order: number;
}

interface Agreement {
  id: string;
  sponsor_name: string;
  contact_email: string | null;
  agreed_rupees: number;
  received_rupees: number;
  outstanding_rupees: number;
  payment_status: string;
  agreement_date: string | null;
  due_date: string | null;
  events?: { title: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "#f59e0b",
  partial:   "#3b82f6",
  paid:      "#22c55e",
  overdue:   "#ef4444",
  cancelled: "#6b7280",
};

function fmt(r: number) {
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function SponsorPackagesPage() {
  const [tab,       setTab]       = useState<"packages" | "agreements">("packages");
  const [packages,  setPackages]  = useState<SponsorPackage[]>([]);
  const [agreements,setAgreements]= useState<Agreement[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [pkgForm, setPkgForm] = useState({
    organization_id: "00000000-0000-0000-0000-000000000001",
    name: "", description: "", price_rupees: "",
  });

  const [agreeForm, setAgreeForm] = useState({
    organization_id: "00000000-0000-0000-0000-000000000001",
    sponsor_name: "", contact_name: "", contact_email: "", contact_phone: "",
    agreed_amount_rupees: "", package_id: "", agreement_date: "", due_date: "", notes: "",
    recorded_by: "",
  });

  const loadPackages = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/sponsors/packages");
    if (res.ok) setPackages((await res.json()).packages ?? []);
    setLoading(false);
  }, []);

  const loadAgreements = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/sponsors/agreements");
    if (res.ok) setAgreements((await res.json()).agreements ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "packages") void loadPackages();
    else void loadAgreements();
  }, [tab, loadPackages, loadAgreements]);

  async function savePkg() {
    if (!pkgForm.name) { alert("Package name required"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/sponsors/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pkgForm, price_rupees: parseFloat(pkgForm.price_rupees || "0") }),
    });
    setSaving(false);
    if (res.ok) { setShowForm(false); void loadPackages(); }
    else alert("Failed to save");
  }

  async function saveAgreement() {
    if (!agreeForm.sponsor_name || !agreeForm.agreed_amount_rupees || !agreeForm.recorded_by) {
      alert("Sponsor name, amount, and recorded_by are required");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/sponsors/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...agreeForm, agreed_amount_rupees: parseFloat(agreeForm.agreed_amount_rupees) }),
    });
    setSaving(false);
    if (res.ok) { setShowForm(false); void loadAgreements(); }
    else alert("Failed to save");
  }

  async function updateAgreementStatus(id: string, payment_status: string, amount_received_rupees?: number) {
    await fetch("/api/admin/sponsors/agreements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, payment_status, amount_received_rupees, recorded_by: "admin" }),
    });
    void loadAgreements();
  }

  const inputStyle: React.CSSProperties = {
    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", width: "100%", outline: "none",
  };

  const tabBtn = (t: "packages" | "agreements", label: string) => (
    <button onClick={() => setTab(t)} style={{
      background: tab === t ? "rgba(232,98,10,0.12)" : "none",
      border: `1px solid ${tab === t ? "#e8620a" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 6, color: tab === t ? "#e8620a" : "#666",
      fontSize: 13, fontWeight: 600, padding: "6px 16px", cursor: "pointer", fontFamily: "inherit",
    }}>{label}</button>
  );

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Sponsor Finance</h1>
          <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Packages, agreements & payment tracking</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tabBtn("packages",   "Packages")}
          {tabBtn("agreements", "Agreements")}
          <button onClick={() => setShowForm(s => !s)} style={{
            background: "#e8620a", border: "none", borderRadius: 8, color: "#fff",
            fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit",
          }}>+ Add {tab === "packages" ? "Package" : "Agreement"}</button>
        </div>
      </div>

      {/* Forms */}
      {showForm && tab === "packages" && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>New Sponsorship Package</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { key: "name",         label: "Package Name *", type: "text" },
              { key: "price_rupees", label: "Price (₹)",      type: "number" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} value={String(pkgForm[f.key as keyof typeof pkgForm])}
                  onChange={e => setPkgForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Description</label>
              <textarea value={pkgForm.description} onChange={e => setPkgForm(p => ({ ...p, description: e.target.value }))}
                style={{ ...inputStyle, height: 60, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={savePkg} disabled={saving} style={{
              background: "#e8620a", border: "none", borderRadius: 6, color: "#fff",
              fontSize: 13, fontWeight: 600, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1,
            }}>{saving ? "Saving…" : "Create Package"}</button>
            <button onClick={() => setShowForm(false)} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#555",
              fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {showForm && tab === "agreements" && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>New Sponsor Agreement</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { key: "sponsor_name",          label: "Sponsor Name *",   type: "text" },
              { key: "contact_name",          label: "Contact Name",     type: "text" },
              { key: "contact_email",         label: "Contact Email",    type: "email" },
              { key: "contact_phone",         label: "Contact Phone",    type: "tel" },
              { key: "agreed_amount_rupees",  label: "Agreed Amount (₹) *",type: "number" },
              { key: "agreement_date",        label: "Agreement Date",   type: "date" },
              { key: "due_date",              label: "Payment Due Date", type: "date" },
              { key: "recorded_by",           label: "Recorded by (email) *",type: "email" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} value={String(agreeForm[f.key as keyof typeof agreeForm])}
                  onChange={e => setAgreeForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Package (optional)</label>
              <select value={agreeForm.package_id} onChange={e => setAgreeForm(p => ({ ...p, package_id: e.target.value }))} style={inputStyle}>
                <option value="">No package</option>
                {packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name} — {fmt(pkg.price_rupees)}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Notes</label>
              <textarea value={agreeForm.notes} onChange={e => setAgreeForm(p => ({ ...p, notes: e.target.value }))}
                style={{ ...inputStyle, height: 60, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={saveAgreement} disabled={saving} style={{
              background: "#e8620a", border: "none", borderRadius: 6, color: "#fff",
              fontSize: 13, fontWeight: 600, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1,
            }}>{saving ? "Saving…" : "Create Agreement"}</button>
            <button onClick={() => setShowForm(false)} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#555",
              fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>Loading…</div>
      ) : tab === "packages" ? (
        packages.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No packages defined yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {packages.map(pkg => (
              <div key={pkg.id} style={{
                background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 18,
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{pkg.name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#e8620a", marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>{fmt(pkg.price_rupees)}</div>
                {pkg.description && <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>{pkg.description}</p>}
                {pkg.deliverables?.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px" }}>
                    {pkg.deliverables.map((d, i) => (
                      <li key={i} style={{ fontSize: 11, color: "#555", padding: "2px 0", display: "flex", gap: 6 }}>
                        <span style={{ color: "#e8620a" }}>✓</span> {d.item}{d.qty ? ` ×${d.qty}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, color: pkg.is_active ? "#22c55e" : "#ef4444", border: `1px solid ${pkg.is_active ? "#22c55e" : "#ef4444"}` }}>
                  {pkg.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        agreements.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No sponsor agreements yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Sponsor","Agreed","Received","Outstanding","Status","Due Date","Action"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agreements.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ color: "#ccc", fontWeight: 500 }}>{a.sponsor_name}</div>
                      {a.contact_email && <div style={{ fontSize: 11, color: "#555" }}>{a.contact_email}</div>}
                      {a.events?.title && <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{a.events.title}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#ccc" }}>{fmt(a.agreed_rupees)}</td>
                    <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#22c55e" }}>{fmt(a.received_rupees)}</td>
                    <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: a.outstanding_rupees > 0 ? "#f59e0b" : "#22c55e" }}>{fmt(a.outstanding_rupees)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, color: STATUS_COLORS[a.payment_status] ?? "#888", border: `1px solid ${STATUS_COLORS[a.payment_status] ?? "#888"}` }}>
                        {a.payment_status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#555", fontSize: 11 }}>{a.due_date ?? "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {a.payment_status !== "paid" && a.payment_status !== "cancelled" && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <button onClick={() => {
                            const amt = prompt(`Amount received (₹), out of ${fmt(a.agreed_rupees)}:`);
                            if (amt) updateAgreementStatus(a.id, parseFloat(amt) >= a.agreed_rupees ? "paid" : "partial", parseFloat(amt));
                          }} style={{
                            background: "none", border: "1px solid #22c55e", borderRadius: 4, color: "#22c55e",
                            fontSize: 11, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit",
                          }}>Record Payment</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
