"use client";

import { useState } from "react";
import Link from "next/link";

interface DiagnosisReport {
  searched_with:          Record<string, string>;
  timestamp:              string;
  database: {
    found:         boolean;
    count:         number;
    error?:        string | null;
    registrations: Array<{
      registration_code:    string;
      user_email:           string;
      user_name:            string;
      phone?:               string;
      status:               string;
      payment_status:       string;
      amount?:              number;
      razorpay_order_id?:   string | null;
      razorpay_payment_id?: string | null;
      event?:               string;
      event_id?:            string;
      created_at:           string;
      qr_generated_at?:     string | null;
      email_sent_at?:       string | null;
      email_status?:        string | null;
      email_ses_message_id?:string | null;
    }>;
  };
  razorpay: {
    payment_found: boolean;
    order_found:   boolean;
    error?:        string | null;
    payment?:      {
      id:         string;
      status:     string;
      amount_inr: number;
      method:     string;
      captured:   boolean;
      order_id?:  string | null;
      email?:     string;
      contact?:   string;
      created_at?:string | null;
      utr?:       string | null;
    } | null;
    order?:        {
      id:          string;
      status:      string;
      amount_inr:  number;
      amount_paid: number;
      receipt?:    string | null;
      created_at?: string | null;
    } | null;
  };
  diagnosis: {
    status:          string;
    action_required: string;
    can_auto_recover:boolean;
    steps:           string[];
  };
  auto_reconcile_available?: boolean;
  auto_reconcile_hint?:      string;
}

const S = {
  card:   { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" } as React.CSSProperties,
  input:  { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const } as React.CSSProperties,
  label:  { display: "block", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 5 } as React.CSSProperties,
  btn:    (primary = true): React.CSSProperties => ({ padding: "9px 20px", background: primary ? "#e8620a" : "rgba(255,255,255,0.06)", border: primary ? "none" : "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: primary ? "#fff" : "#aaa", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }),
};

const STATUS_COLOR: Record<string, string> = {
  COMPLETE:              "#4ade80",
  EMAIL_MISSING:         "#fbbf24",
  WEBHOOK_MISSED:        "#f87171",
  ORPHAN_PAYMENT:        "#f87171",
  PAYMENT_MISSING_IN_GATEWAY: "#fbbf24",
  NOT_FOUND:             "#f87171",
  PARTIAL:               "#fbbf24",
  unknown:               "#888",
};

export default function PaymentReconcilePage() {
  const [form, setForm] = useState({ payment_id: "", order_id: "", registration_code: "", email: "", phone: "", utr: "" });
  const [loading,        setLoading]        = useState(false);
  const [report,         setReport]         = useState<DiagnosisReport | null>(null);
  const [error,          setError]          = useState("");
  const [reconciling,    setReconciling]    = useState(false);
  const [reconcileResult,setReconcileResult]= useState<string>("");

  async function investigate() {
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
    if (Object.keys(payload).length === 0) { setError("Enter at least one identifier"); return; }
    setLoading(true); setError(""); setReport(null); setReconcileResult("");
    try {
      const res  = await fetch("/api/admin/payment-investigate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Investigation failed"); return; }
      setReport(data as DiagnosisReport);
    } catch { setError("Network error"); }
    finally   { setLoading(false); }
  }

  async function forceReconcile(registrationCode: string, paymentId: string, orderId?: string | null) {
    if (!confirm(`Confirm ₹${report?.razorpay.payment?.amount_inr ?? "?"} payment for registration ${registrationCode}?\n\nThis will mark the registration as PAID and send the confirmation email + QR code.`)) return;
    setReconciling(true); setReconcileResult("");
    try {
      const res  = await fetch("/api/admin/payment-force-reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ registration_code: registrationCode, payment_id: paymentId, order_id: orderId }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setReconcileResult(`✅ ${data.message}`);
        void investigate(); // refresh
      } else {
        setReconcileResult(`❌ ${data.error ?? "Failed"}`);
      }
    } catch { setReconcileResult("❌ Network error"); }
    finally   { setReconciling(false); }
  }

  const diag    = report?.diagnosis;
  const diagCol = diag ? (STATUS_COLOR[diag.status] ?? "#888") : "#888";
  const dbReg   = report?.database.registrations[0] ?? null;
  const rzpPay  = report?.razorpay.payment ?? null;

  return (
    <div style={{ padding: "1.75rem 2rem 4rem", maxWidth: 860, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin" style={{ fontSize: 12, color: "#555", textDecoration: "none" }}>← Admin</Link>
        <h1 style={{ margin: "8px 0 4px", fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>Payment Investigation</h1>
        <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
          Trace any payment — from Razorpay order creation through to registration confirmation and email delivery.
        </p>
      </div>

      {/* Search form */}
      <div style={{ ...S.card, marginBottom: 20, border: "1px solid rgba(232,98,10,0.2)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>
          Search by any identifier
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={S.label}>Razorpay Payment ID (pay_xxx)</label>
            <input style={S.input} value={form.payment_id} onChange={e => setForm(f => ({ ...f, payment_id: e.target.value }))} placeholder="pay_XXXXXXXXXX" />
          </div>
          <div>
            <label style={S.label}>Razorpay Order ID (order_xxx)</label>
            <input style={S.input} value={form.order_id} onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))} placeholder="order_XXXXXXXXXX" />
          </div>
          <div>
            <label style={S.label}>Registration Code</label>
            <input style={S.input} value={form.registration_code} onChange={e => setForm(f => ({ ...f, registration_code: e.target.value }))} placeholder="CS-EVT-XXXXXX" />
          </div>
          <div>
            <label style={S.label}>User Email</label>
            <input style={S.input} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" type="email" />
          </div>
          <div>
            <label style={S.label}>Phone Number</label>
            <input style={S.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" />
          </div>
          <div>
            <label style={S.label}>UPI Transaction ID / UTR / RRN</label>
            <input style={S.input} value={form.utr} onChange={e => setForm(f => ({ ...f, utr: e.target.value }))} placeholder="T26062212035140030813 or 591942146801" />
          </div>
        </div>
        {error && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(248,113,113,0.08)", borderRadius: 7, fontSize: 12, color: "#f87171" }}>{error}</div>}
        <div style={{ marginTop: 14 }}>
          <button onClick={investigate} disabled={loading} style={S.btn()}>
            {loading ? "Investigating…" : "🔍 Investigate Payment"}
          </button>
        </div>
      </div>

      {/* Diagnosis */}
      {diag && (
        <div style={{ ...S.card, marginBottom: 16, border: `1px solid ${diagCol}25`, background: `${diagCol}08` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>{diag.status === "COMPLETE" ? "✅" : diag.can_auto_recover ? "⚠️" : "❌"}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: diagCol }}>{diag.status.replace(/_/g, " ")}</span>
          </div>
          <div style={{ fontSize: 13, color: "#ccc", marginBottom: diag.steps.length ? 12 : 0 }}>{diag.action_required}</div>
          {diag.steps.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {diag.steps.map((s, i) => <li key={i} style={{ fontSize: 12, color: "#888" }}>{s}</li>)}
            </ol>
          )}

          {/* Auto-reconcile */}
          {report?.auto_reconcile_available && rzpPay && dbReg && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 12, color: "#fbbf24", marginBottom: 8 }}>
                ⚡ Auto-reconcile available — Razorpay shows payment captured but registration is not confirmed.
              </div>
              {reconcileResult && (
                <div style={{ marginBottom: 8, fontSize: 12, color: reconcileResult.startsWith("✅") ? "#4ade80" : "#f87171" }}>{reconcileResult}</div>
              )}
              <button onClick={() => forceReconcile(dbReg.registration_code, rzpPay.id, rzpPay.order_id)} disabled={reconciling}
                style={{ ...S.btn(), background: "#16a34a", fontSize: 12, padding: "7px 16px" }}>
                {reconciling ? "Reconciling…" : `✅ Confirm & Send QR to ${dbReg.user_email}`}
              </button>
            </div>
          )}
        </div>
      )}

      {report && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

          {/* Database */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: report.database.found ? "#4ade80" : "#f87171", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>
              {report.database.found ? "✅" : "❌"} Our Database ({report.database.count} found)
            </div>
            {dbReg ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Code",        dbReg.registration_code],
                  ["Name",        dbReg.user_name],
                  ["Email",       dbReg.user_email],
                  ["Status",      dbReg.status],
                  ["Payment",     dbReg.payment_status],
                  ["Amount",      dbReg.amount ? `₹${dbReg.amount}` : "—"],
                  ["Order ID",    dbReg.razorpay_order_id || "—"],
                  ["Payment ID",  dbReg.razorpay_payment_id || "—"],
                  ["Email sent",  dbReg.email_status ?? "—"],
                  ["QR gen'd",    dbReg.qr_generated_at ? "Yes" : "No"],
                  ["Event",       dbReg.event ?? "—"],
                  ["Registered",  new Date(dbReg.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "#555", width: 90, flexShrink: 0 }}>{label}</span>
                    <span style={{ color: "#ccc", wordBreak: "break-all" }}>{val}</span>
                  </div>
                ))}
                {dbReg.event_id && (
                  <Link href={`/admin/events/${dbReg.event_id}/registrations`}
                    style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", marginTop: 4 }}>
                    → View in Registrations
                  </Link>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#555" }}>No registration found for these identifiers.</div>
            )}
          </div>

          {/* Razorpay */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: report.razorpay.payment_found ? "#4ade80" : "#f87171", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>
              {report.razorpay.payment_found ? "✅" : "❌"} Razorpay
            </div>
            {report.razorpay.error && (
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>API Error: {report.razorpay.error}</div>
            )}
            {rzpPay ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Payment ID",  rzpPay.id],
                  ["Status",      rzpPay.status.toUpperCase()],
                  ["Amount",      `₹${rzpPay.amount_inr}`],
                  ["Method",      rzpPay.method],
                  ["Captured",    rzpPay.captured ? "Yes" : "No"],
                  ["Order ID",    rzpPay.order_id || "—"],
                  ["Email",       rzpPay.email || "—"],
                  ["Phone",       rzpPay.contact || "—"],
                  ["UTR / RRN",   rzpPay.utr || "—"],
                  ["Created",     rzpPay.created_at ? new Date(rzpPay.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "#555", width: 90, flexShrink: 0 }}>{label}</span>
                    <span style={{ color: val === "CAPTURED" ? "#4ade80" : val === "FAILED" ? "#f87171" : "#ccc", wordBreak: "break-all" }}>{val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#555" }}>
                {report.razorpay.error ? "Could not connect to Razorpay API." : "No payment found in Razorpay for these identifiers."}
                {!report.razorpay.error && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#444", lineHeight: 1.6 }}>
                    This may mean:
                    <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                      <li>User paid to wrong UPI ID</li>
                      <li>Payment was rejected/expired before Razorpay recorded it</li>
                      <li>The UTR is from a different payment</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ ...S.card, marginTop: 20, border: "1px solid rgba(96,165,250,0.15)", background: "rgba(96,165,250,0.04)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>
          How to use this tool
        </div>
        <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
          <strong style={{ color: "#aaa" }}>For the current PhonePe case:</strong><br/>
          1. Enter the <strong>UPI Transaction ID</strong> (T26062212035140030813) in the UTR field<br/>
          2. Also enter the user's <strong>email</strong> for DB lookup<br/>
          3. Click Investigate — the tool searches both our DB and Razorpay<br/>
          4. If payment is found in Razorpay but not confirmed here → click "Confirm &amp; Send QR"<br/>
          5. If payment is NOT found in Razorpay → it may have gone to a wrong/expired UPI ID<br/><br/>
          <strong style={{ color: "#aaa" }}>UTR / RRN lookup works for recent payments (last 30 days).</strong><br/>
          For older payments, use the Razorpay dashboard directly and then paste the payment_id here.
        </div>
      </div>
    </div>
  );
}
