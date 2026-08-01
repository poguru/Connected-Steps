"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button, Alert, Badge as DSBadge, Spinner } from "@/components/ui/ds";

import { APP_URL } from "@/lib/config";
// ── Types ─────────────────────────────────────────────────────────────────────

interface Registration {
  id:                         string;
  registration_code:          string;
  user_email:                 string;
  user_name:                  string;
  phone:                      string | null;
  gender:                     string | null;
  date_of_birth:              string | null;
  blood_group:                string | null;
  emergency_contact:          string | null;
  special_notes:              string | null;
  distance_category:          string | null;
  race_id:                    string | null;
  is_early_bird:              boolean;
  price_differential:         number;
  category_change_log:        CategoryChangeEntry[];
  category_changed_at:        string | null;
  category_changed_by:        string | null;
  custom_fields:              Record<string, string>;
  coupon_code:                string | null;
  coupon_discount:            number;
  original_price:             number;
  final_price:                number;
  payment_status:             string;
  razorpay_payment_id:        string | null;
  status:                     string;
  created_at:                 string;
  qr_token:                   string | null;
  qr_generated_at:            string | null;
  checked_in_at:              string | null;
  confirmation_email_sent_at: string | null;
  email_status:               string | null;
  email_ses_message_id:       string | null;
  breakfast_availed:          boolean;
  breakfast_availed_at:       string | null;
  breakfast_verified_by:      string | null;
  tshirt_size:                string | null;
  tshirt_issued:              boolean;
  tshirt_issued_at:           string | null;
  tshirt_issued_by:           string | null;
  bib_number:                 string | null;
  bib_collected_at:           string | null;
  bib_collected_by:           string | null;
  events: {
    id:                   string;
    title:                string;
    start_date:           string;
    start_time:           string | null;
    location:             string;
    organizer:            string | null;
    distance_categories:  string[] | null;
  } | null;
}

interface CategoryChangeEntry {
  from:         string | null;
  to:           string;
  from_price:   number;
  to_price:     number;
  differential: number;
  changed_at:   string;
  changed_by:   string;
}

interface EventParticipant {
  id:                    string;
  status:                string;
  first_name:            string;
  last_name:             string | null;
  tshirt_size:           string | null;
  checked_in_at:         string | null;
  checked_in_by:         string | null;
  tshirt_issued:         boolean;
  tshirt_issued_at:      string | null;
  tshirt_issued_by:      string | null;
  breakfast_availed:     boolean;
  breakfast_availed_at:  string | null;
  breakfast_availed_by:  string | null;
  medal_issued:          boolean;
  medal_issued_at:       string | null;
  medal_issued_by:       string | null;
  bib_collected_at:      string | null;
  bib_collected_by:      string | null;
}

interface Invoice {
  invoice_number: string;
  invoice_status: string;
  storage_path:   string | null;
  email_sent:     boolean;
  created_at:     string;
}

interface EmailLog {
  id:             string;
  status:         string;
  provider:       string | null;
  sent_at:        string | null;
  error:          string | null;
  ses_message_id: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined, short = false): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric", month: short ? "short" : "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusBadge(s: string) {
  const c = s === "confirmed" ? "green" : s === "cancelled" ? "red" : s === "pending_payment" ? "yellow" : "gray";
  return <DSBadge color={c as "green"|"red"|"yellow"|"gray"}>{s === "pending_payment" ? "Pending Payment" : s.charAt(0).toUpperCase()+s.slice(1)}</DSBadge>;
}
function paymentBadge(s: string) {
  const c = s === "paid" ? "green" : s === "free" ? "blue" : s === "pending" ? "yellow" : "gray";
  return <DSBadge color={c as "green"|"blue"|"yellow"|"gray"}>{s.charAt(0).toUpperCase()+s.slice(1)}</DSBadge>;
}
function emailBadge(s: string | null) {
  const c = s === "sent" ? "green" : s === "failed" ? "red" : "gray";
  return <DSBadge color={c as "green"|"red"|"gray"}>{s === "sent" ? "Sent" : s === "failed" ? "Failed" : "Not sent"}</DSBadge>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ParticipantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const code    = params.code as string;

  const [reg,          setReg]          = useState<Registration | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [invoice,      setInvoice]      = useState<Invoice | null>(null);
  const [emailLogs,    setEmailLogs]    = useState<EmailLog[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [action,       setAction]       = useState("");   // "resending" | "cancelling" | "changing_category" | "regenerating_qr" | ""
  const [toast,        setToast]        = useState("");

  // Category change modal
  const [showCatModal,    setShowCatModal]    = useState(false);
  const [selectedNewCat,  setSelectedNewCat]  = useState("");
  const [catChangeResult, setCatChangeResult] = useState<{ differential: number; new_category: string } | null>(null);

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/registrations/${code}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Not found"); return; }
      setReg(data.registration);
      setParticipants(data.participants ?? []);
      setInvoice(data.invoice ?? null);
      setEmailLogs(data.email_logs ?? []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  async function resendEmail() {
    if (!reg) return;
    setAction("resending");
    try {
      const res = await fetch("/api/admin/events/registrations/resend-qr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg.id }),
      });
      const data = await res.json();
      if (res.ok) { showToast("✅ Confirmation email resent"); await loadData(); }
      else showToast(`❌ ${data.error ?? "Failed"}`);
    } finally { setAction(""); }
  }

  async function cancelRegistration() {
    if (!reg || !confirm(`Cancel registration for ${reg.user_name}? This cannot be undone.`)) return;
    setAction("cancelling");
    try {
      const res = await fetch("/api/admin/events/registrations", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reg.id, status: "cancelled" }),
      });
      if (res.ok) { showToast("Registration cancelled"); await loadData(); }
      else { const d = await res.json(); showToast(`❌ ${d.error}`); }
    } finally { setAction(""); }
  }

  async function regenerateQR() {
    if (!reg || !confirm("Regenerate QR code? The old code will stop working immediately.")) return;
    setAction("regenerating_qr");
    try {
      const res = await fetch(`/api/admin/events/${eventId}/registrations/${code}/regenerate-qr`, {
        method: "POST",
      });
      if (res.ok) { showToast("✅ QR code regenerated"); await loadData(); }
      else { const d = await res.json(); showToast(`❌ ${d.error ?? "Failed"}`); }
    } finally { setAction(""); }
  }

  async function changeCategory() {
    if (!reg || !selectedNewCat) return;
    setAction("changing_category");
    try {
      const res = await fetch(`/api/admin/events/${eventId}/registrations/${code}/category`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_category: selectedNewCat, changed_by: "admin" }),
      });
      const d = await res.json() as { ok?: boolean; differential?: number; new_category?: string; error?: string };
      if (res.ok && d.ok) {
        setCatChangeResult({ differential: d.differential ?? 0, new_category: d.new_category ?? selectedNewCat });
        setShowCatModal(false);
        await loadData();
        showToast(`✅ Category changed to ${d.new_category}`);
      } else {
        showToast(`❌ ${d.error ?? "Failed to change category"}`);
      }
    } finally { setAction(""); }
  }

  const appUrl = APP_URL;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner />
    </div>
  );

  if (error || !reg) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div style={{ textAlign: "center" }}>
        <Alert variant="error" style={{ marginBottom: 12 }}>{error || "Registration not found"}</Alert>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>← Go back</Button>
      </div>
    </div>
  );

  const ev  = reg.events;
  const svc = participants[0] ?? null;  // primary participant — authoritative source for service statuses
  const isCancelled = reg.status === "cancelled";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/registrations`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Registrations</Link>
          <span style={{ color: "#333" }}>/</span>
          <code style={{ fontSize: 13, color: "#e8620a", fontWeight: 700 }}>{reg.registration_code}</code>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {reg.qr_token && (
            <a
              href={`${appUrl}/api/events/qr/${encodeURIComponent(reg.qr_token)}`}
              target="_blank" rel="noopener"
              style={{ padding: "6px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
            >
              Download QR ↗
            </a>
          )}
          <Button size="sm" variant="secondary" loading={action === "regenerating_qr"} disabled={action !== "" || isCancelled} onClick={regenerateQR}>Regenerate QR</Button>
          <Button size="sm" variant="secondary" loading={action === "resending"} disabled={action !== "" || isCancelled} onClick={resendEmail}>Resend Email</Button>
          {!isCancelled && (
            <Button size="sm" variant="danger" loading={action === "cancelling"} disabled={action !== ""} onClick={cancelRegistration}>Cancel Registration</Button>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "1.75rem 2rem" }}>

        {/* Top row: code + status badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div>
            <code style={{ fontSize: 28, fontWeight: 900, color: "#e8620a", letterSpacing: 2 }}>{reg.registration_code}</code>
            <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Registered {fmtDate(reg.created_at)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
            {statusBadge(reg.status)}
            {paymentBadge(reg.payment_status)}
            {emailBadge(reg.email_status)}
            {svc?.checked_in_at && <DSBadge color="blue">Checked In</DSBadge>}
            {svc?.breakfast_availed && <DSBadge color="green">Breakfast ✓</DSBadge>}
            {(svc?.tshirt_size ?? reg.tshirt_size) && <DSBadge color="blue">👕 {svc?.tshirt_size ?? reg.tshirt_size}</DSBadge>}
            {svc?.tshirt_issued && <DSBadge color="green">T-Shirt Issued ✓</DSBadge>}
            {svc?.medal_issued && <DSBadge color="gray">Medal ✓</DSBadge>}
          </div>
        </div>

        {/* ── Activity Timeline ──────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Activity Timeline</div>
          <div style={{ position: "relative", paddingLeft: 28 }}>
            {/* Vertical line */}
            <div style={{ position: "absolute", left: 9, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.06)", borderRadius: 1 }} />

            {((): Array<{ at: string | null | undefined; label: string; detail?: string | null; color: string; icon: string }> => [
              { at: reg.created_at,                   icon: "📝", color: "#e8620a", label: "Registered",             detail: reg.distance_category ? `Distance: ${reg.distance_category}` : undefined },
              { at: reg.payment_status === "paid" ? reg.created_at : null, icon: "💳", color: "#4ade80", label: "Payment Confirmed", detail: reg.final_price > 0 ? `₹${reg.final_price}${reg.razorpay_payment_id ? ` · ${reg.razorpay_payment_id}` : ""}` : undefined },
              { at: reg.payment_status === "free" ? reg.created_at : null, icon: "🎁", color: "#60a5fa", label: "Free Registration",  detail: reg.coupon_code ? `Coupon: ${reg.coupon_code}` : "Complimentary" },
              { at: reg.qr_generated_at,              icon: "🎫", color: "#a78bfa", label: "QR Code Generated",       detail: reg.qr_token?.slice(0, 20) + "…" },
              { at: reg.confirmation_email_sent_at,   icon: reg.email_status === "sent" ? "✅" : "❌", color: reg.email_status === "sent" ? "#4ade80" : "#f87171", label: "Confirmation Email", detail: reg.email_status === "sent" ? (reg.email_ses_message_id ? `SES: ${reg.email_ses_message_id.slice(0, 24)}…` : "Delivered") : "Failed" },
              { at: svc?.bib_collected_at,            icon: "🏷️", color: "#60a5fa", label: "BIB Collected",          detail: svc?.bib_collected_by ? `By: ${svc.bib_collected_by}` : undefined },
              { at: svc?.checked_in_at,               icon: "✅", color: "#4ade80", label: "Checked In",              detail: svc?.checked_in_by ? `By: ${svc.checked_in_by}` : "Race day check-in" },
              { at: svc?.breakfast_availed_at,        icon: "🍽️", color: "#34d399", label: "Breakfast Issued",       detail: svc?.breakfast_availed_by ? `By: ${svc.breakfast_availed_by}` : undefined },
              { at: svc?.tshirt_issued_at,            icon: "👕", color: "#a78bfa", label: "T-Shirt Issued",          detail: svc?.tshirt_issued_by ? `By: ${svc.tshirt_issued_by}` : undefined },
              { at: svc?.medal_issued_at,             icon: "🥇", color: "#fbbf24", label: "Medal Issued",            detail: svc?.medal_issued_by ? `By: ${svc.medal_issued_by}` : undefined },
            ])()
              .filter(e => e.at)
              .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime())
              .map((e, i) => (
                <div key={i} style={{ position: "relative", marginBottom: 14, paddingBottom: 4 }}>
                  {/* Dot */}
                  <div style={{ position: "absolute", left: -22, top: 4, width: 14, height: 14, borderRadius: "50%", background: "#0a0a0a", border: `2px solid ${e.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }} />
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{e.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{e.label}</span>
                        <span style={{ fontSize: 11, color: "#555" }}>
                          {new Date(e.at!).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {e.detail && <div style={{ fontSize: 11, color: "#666", marginTop: 2, fontFamily: "monospace" }}>{e.detail}</div>}
                    </div>
                  </div>
                </div>
              ))}

            {/* Pending items */}
            {((): Array<{ label: string; hint: string }> => [
              ...(!svc?.checked_in_at ? [{ label: "Check-In", hint: "Pending on race day" }] : []),
              ...(!svc?.breakfast_availed && svc?.checked_in_at ? [{ label: "Breakfast", hint: "Not availed" }] : []),
              ...((svc?.tshirt_size ?? reg.tshirt_size) && !svc?.tshirt_issued ? [{ label: "T-Shirt", hint: "Not yet issued" }] : []),
              ...(!svc?.medal_issued && svc?.checked_in_at ? [{ label: "Medal", hint: "Not yet issued" }] : []),
            ])().map((e, i) => (
              <div key={`p${i}`} style={{ position: "relative", marginBottom: 14, opacity: 0.35 }}>
                <div style={{ position: "absolute", left: -22, top: 4, width: 14, height: 14, borderRadius: "50%", background: "#0a0a0a", border: "2px solid rgba(255,255,255,0.15)" }} />
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 14 }}>⏳</span>
                  <div>
                    <span style={{ fontSize: 13, color: "#666" }}>{e.label}</span>
                    <span style={{ fontSize: 11, color: "#444", marginLeft: 8 }}>{e.hint}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Participant */}
            <Section title="Participant">
              <Row label="Name"       value={reg.user_name} large />
              <Row label="Email"      value={reg.user_email} />
              <Row label="Phone"      value={reg.phone} />
              <Row label="Gender"     value={reg.gender} />
              <Row label="DOB"        value={reg.date_of_birth ? new Date(reg.date_of_birth).toLocaleDateString("en-IN") : null} />
              <Row label="Blood Group" value={reg.blood_group} highlight />
              <Row label="Emergency"  value={reg.emergency_contact} />
              {reg.special_notes && <Row label="Notes"  value={reg.special_notes} />}
            </Section>

            {/* Event */}
            <Section title="Event">
              <Row label="Event"    value={ev?.title} large />
              <Row label="Date"     value={ev?.start_date ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null} />
              {ev?.start_time && <Row label="Time"   value={ev.start_time} />}
              <Row label="Venue"    value={ev?.location} />
              {reg.distance_category && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ width: 110, flexShrink: 0, fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>Category</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#e8620a", flex: 1 }}>{reg.distance_category}</span>
                  {reg.is_early_bird && <span style={{ fontSize: 10, background: "rgba(250,204,21,0.12)", color: "#facc15", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>EARLY BIRD</span>}
                  {!isCancelled && (ev?.distance_categories?.length ?? 0) > 1 && (
                    <button
                      onClick={() => { setSelectedNewCat(""); setCatChangeResult(null); setShowCatModal(true); }}
                      style={{ fontSize: 11, color: "#e8620a", background: "none", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                    >
                      Change
                    </button>
                  )}
                </div>
              )}
              {reg.price_differential !== 0 && (
                <div style={{ marginTop: 6, padding: "6px 10px", background: reg.price_differential > 0 ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.08)", border: `1px solid ${reg.price_differential > 0 ? "rgba(251,191,36,0.2)" : "rgba(52,211,153,0.2)"}`, borderRadius: 8, fontSize: 12, color: reg.price_differential > 0 ? "#fbbf24" : "#34d399" }}>
                  {reg.price_differential > 0
                    ? `⚠️ Participant owes ₹${reg.price_differential} more (category upgrade)`
                    : `ℹ️ ₹${Math.abs(reg.price_differential)} refund due (category downgrade)`
                  }
                </div>
              )}
              {reg.category_change_log?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 4 }}>Change History</div>
                  {reg.category_change_log.map((entry, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#666", padding: "2px 0" }}>
                      {new Date(entry.changed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {entry.from ?? "—"} → {entry.to} {entry.differential !== 0 && <span style={{ color: entry.differential > 0 ? "#fbbf24" : "#34d399" }}>({entry.differential > 0 ? "+" : ""}₹{entry.differential})</span>} <span style={{ color: "#444" }}>by {entry.changed_by}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Payment */}
            <Section title="Payment">
              <Row label="Status"    value={reg.payment_status.toUpperCase()} />
              {reg.final_price > 0 && <>
                <Row label="Original"  value={`₹${reg.original_price}`} />
                {reg.coupon_discount > 0 && <Row label="Discount" value={`-₹${reg.coupon_discount} (${reg.coupon_code})`} />}
                <Row label="Paid"      value={`₹${reg.final_price}`} large highlight />
              </>}
              {reg.final_price === 0 && <Row label="Amount" value="Free" />}
              {reg.razorpay_payment_id && <Row label="Payment ID" value={reg.razorpay_payment_id} mono />}
            </Section>

          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* QR Code */}
            <Section title="QR Code">
              {reg.qr_token ? (
                <div style={{ textAlign: "center", padding: "1rem 0" }}>
                  <div style={{ display: "inline-block", background: "#fff", padding: 16, borderRadius: 12, border: "3px solid #e8620a" }}>
                    <Image
                      src={`${appUrl}/api/events/qr/${encodeURIComponent(reg.qr_token)}`}
                      alt="Registration QR Code"
                      width={180} height={180}
                      style={{ display: "block" }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 10 }}>
                    {reg.qr_generated_at ? `Generated ${fmtDate(reg.qr_generated_at, true)}` : "QR generated"}
                  </div>
                  <a
                    href={`${appUrl}/api/events/qr/${encodeURIComponent(reg.qr_token)}`}
                    target="_blank" rel="noopener"
                    style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}
                  >
                    Download Full Size ↗
                  </a>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "2rem", color: "#555", fontSize: 13 }}>
                  No QR generated yet
                  <div style={{ marginTop: 8 }}>
                    <button onClick={resendEmail} style={{ color: "#e8620a", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>
                      Resend to generate →
                    </button>
                  </div>
                </div>
              )}
            </Section>

            {/* Email Status */}
            <Section title="Email Delivery">
              <Row label="Status"   value={reg.email_status ?? "Not sent"} />
              {reg.confirmation_email_sent_at && <Row label="Sent At" value={fmtDate(reg.confirmation_email_sent_at, true)} />}
              {reg.email_ses_message_id && <Row label="SES ID" value={reg.email_ses_message_id} mono />}
            </Section>

            {/* Check-in, Breakfast, T-Shirt, BIB & Medal */}
            <Section title="Race Day">
              <Row label="Check-In"
                   value={svc?.checked_in_at ? `✅ ${fmtDate(svc.checked_in_at, true)}` : "Not checked in"}
                   color={svc?.checked_in_at ? "#4ade80" : "#555"}
              />
              {svc?.checked_in_by && <Row label="Checked in by" value={svc.checked_in_by} />}
              <Row label="Breakfast"
                   value={svc?.breakfast_availed ? `✅ ${fmtDate(svc.breakfast_availed_at, true)}` : "Not availed"}
                   color={svc?.breakfast_availed ? "#4ade80" : "#555"}
              />
              {svc?.breakfast_availed_by && <Row label="Issued by" value={svc.breakfast_availed_by} />}
              {(svc?.tshirt_size ?? reg.tshirt_size) && <>
                <Row label="T-Shirt Size" value={(svc?.tshirt_size ?? reg.tshirt_size)!} highlight />
                <Row label="T-Shirt"
                     value={svc?.tshirt_issued ? `✅ Issued ${fmtDate(svc.tshirt_issued_at, true)}` : "Not issued"}
                     color={svc?.tshirt_issued ? "#4ade80" : "#555"}
                />
                {svc?.tshirt_issued_by && <Row label="Issued by" value={svc.tshirt_issued_by} />}
              </>}
              {reg.bib_number && (
                <Row label="BIB Number" value={reg.bib_number} highlight />
              )}
              {(svc?.bib_collected_at ?? reg.bib_collected_at) && <>
                <Row label="BIB"
                     value={`✅ Collected ${fmtDate(svc?.bib_collected_at ?? reg.bib_collected_at, true)}`}
                     color="#4ade80"
                />
                {(svc?.bib_collected_by ?? reg.bib_collected_by) && <Row label="Collected by" value={(svc?.bib_collected_by ?? reg.bib_collected_by)!} />}
              </>}
              {svc && <Row label="Medal"
                   value={svc.medal_issued ? `✅ Issued ${fmtDate(svc.medal_issued_at, true)}` : "Not issued"}
                   color={svc.medal_issued ? "#4ade80" : "#555"}
              />}
              {svc?.medal_issued_by && <Row label="Issued by" value={svc.medal_issued_by} />}
            </Section>

            {/* Invoice */}
            {invoice && (
              <Section title="Bill of Supply">
                <Row label="Invoice #" value={invoice.invoice_number} highlight />
                <Row label="Status"    value={invoice.invoice_status} />
                <Row label="Email"     value={invoice.email_sent ? "Sent" : "Not sent"} />
                {invoice.storage_path && (
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={`/invoices/${invoice.invoice_number}`}
                      target="_blank" rel="noopener"
                      style={{ fontSize: 13, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}
                    >
                      View Bill of Supply ↗
                    </a>
                  </div>
                )}
              </Section>
            )}

            {/* Email Delivery Logs */}
            {emailLogs.length > 0 && (
              <Section title="Email Delivery Log">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {["Status","Provider","Sent At","Message ID","Error"].map(h => (
                          <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "#555", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {emailLogs.map(log => (
                        <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: log.status === "sent" ? "#4ade80" : log.status === "failed" ? "#f87171" : "#fbbf24" }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px", color: "#888", fontSize: 11 }}>{log.provider ?? "—"}</td>
                          <td style={{ padding: "6px 8px", color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(log.sent_at, true)}</td>
                          <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 10, color: "#555", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.ses_message_id ?? ""}>
                            {log.ses_message_id ?? "—"}
                          </td>
                          <td style={{ padding: "6px 8px", color: "#f87171", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.error ?? ""}>
                            {log.error ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Custom Fields */}
            {Object.keys(reg.custom_fields ?? {}).length > 0 && (
              <Section title="Additional Information">
                {Object.entries(reg.custom_fields).map(([key, value]) => (
                  <Row key={key} label={key.replace(/_/g, " ")} value={value || "—"} />
                ))}
              </Section>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* Category Change Modal */}
      {showCatModal && ev && (
        <div
          onClick={() => setShowCatModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "1.5rem", width: "100%", maxWidth: 420 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Change Category</div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 20 }}>
              Current: <span style={{ color: "#e8620a", fontWeight: 600 }}>{reg.distance_category ?? "—"}</span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "#777", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", display: "block", marginBottom: 6 }}>New Category</label>
              <select
                value={selectedNewCat}
                onChange={e => setSelectedNewCat(e.target.value)}
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", padding: "8px 12px", fontSize: 14, fontFamily: "inherit" }}
              >
                <option value="">— Select —</option>
                {(ev.distance_categories ?? [])
                  .filter(cat => cat !== reg.distance_category)
                  .map(cat => <option key={cat} value={cat}>{cat}</option>)
                }
              </select>
            </div>

            <div style={{ fontSize: 12, color: "#555", marginBottom: 20, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              Note: Price differentials are tracked for your records. Additional collection or refunds must be handled manually.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowCatModal(false)}
                style={{ padding: "8px 18px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <Button
                size="sm"
                loading={action === "changing_category"}
                disabled={!selectedNewCat || action !== ""}
                onClick={changeCategory}
              >
                Confirm Change
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section & Row components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em" }}>
        {title}
      </div>
      <div style={{ padding: "12px 16px" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, large, highlight, mono, color }: {
  label:     string;
  value:     string | null | undefined;
  large?:    boolean;
  highlight?: boolean;
  mono?:     boolean;
  color?:    string;
}) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
      <span style={{ width: 110, flexShrink: 0, fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".05em", paddingTop: 1 }}>{label}</span>
      <span style={{
        fontSize: large ? 15 : 13,
        fontWeight: large ? 700 : highlight ? 600 : 400,
        color: color ?? (highlight ? "#e8620a" : "#ccc"),
        fontFamily: mono ? "monospace" : "inherit",
        wordBreak: "break-all" as const,
      }}>
        {value}
      </span>
    </div>
  );
}
