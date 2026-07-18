"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardData {
  reg: {
    id: string; registration_code: string; lead_email: string;
    participant_count: number; base_price: number; discount_amount: number;
    final_price: number; payment_status: string; qr_token: string | null;
    it_run_categories: {
      id: string; slug: string; name: string; distance_km: number;
      category_type: string; color: string; includes_timing: boolean; includes_medal: boolean;
    } | null;
    it_run_events: {
      title: string; event_date: string; report_time: string | null;
      flag_off_time: string | null; venue_name: string | null; city: string | null;
    } | null;
  };
  participants: Participant[];
  bibSlots: BibSlot[];
}

interface Participant {
  id: string; participant_type: string; first_name: string; last_name: string;
  email: string | null; mobile: string; company_name: string | null;
  tshirt_size: string | null; bib_number: string | null; wave: string | null;
  verification_status: string;
  it_run_bib_bookings: Array<{ id: string; status: string; it_run_bib_slots: BibSlot | null }>;
  it_run_bib_collections: Array<{ id: string; collected_at: string }>;
  it_run_checkins: Array<{ id: string; checked_in_at: string }>;
}

interface BibSlot {
  id: string; location_name: string; location_address: string | null;
  slot_date: string; start_time: string; end_time: string;
  capacity: number; booked_count: number;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  page:  { background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" } as React.CSSProperties,
  card:  { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 } as React.CSSProperties,
  label: { fontSize: 10, color: "#888", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 4 },
  value: { fontSize: 14, color: "#fff", fontWeight: 600 },
  btn:   { padding: "11px 20px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none", fontFamily: "inherit" } as React.CSSProperties,
};

const ACCENT = "#e8620a";

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    paid:              { label: "Payment Confirmed", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    free:              { label: "Registration Confirmed", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    pending:           { label: "Payment Pending", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    failed:            { label: "Payment Failed", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
    verified:          { label: "Verified", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    rejected:          { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
    need_clarification:{ label: "Clarification Needed", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    pending_verification:{ label: "Verification Pending", color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
  };
  const s = map[status] ?? { label: status, color: "#888", bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

// ── QR Code display ────────────────────────────────────────────────────────────

function QRDisplay({ code, token }: { code: string; token: string | null }) {
  const qrData = token ?? code;
  const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=200x200&bgcolor=0a0a0a&color=ffffff&margin=10`;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ display: "inline-block", background: "#0a0a0a", border: "2px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 12 }}>
        <img src={qrUrl} alt="QR Code" width={180} height={180} style={{ display: "block", borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Scan at BIB collection + race day</div>
    </div>
  );
}

// ── BIB Slot Booking ──────────────────────────────────────────────────────────

function BibSlotBooker({ participantId, slots, existingBooking, onBooked }: {
  participantId: string;
  slots: BibSlot[];
  existingBooking: { id: string; status: string; it_run_bib_slots: BibSlot | null } | null;
  onBooked: () => void;
}) {
  const [selected,  setSelected]  = useState<string>("");
  const [booking,   setBooking]   = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState(false);

  if (existingBooking?.status === "confirmed" && existingBooking.it_run_bib_slots) {
    const slot = existingBooking.it_run_bib_slots;
    const date = new Date(slot.slot_date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    return (
      <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, color: "#10b981", fontWeight: 700, marginBottom: 6 }}>BIB Collection Slot Booked</div>
        <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{slot.location_name}</div>
        <div style={{ fontSize: 13, color: "#ccc" }}>{date} | {slot.start_time} - {slot.end_time}</div>
        {slot.location_address && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{slot.location_address}</div>}
      </div>
    );
  }

  async function book() {
    if (!selected) return;
    setBooking(true);
    setError("");
    try {
      const res  = await fetch("/api/it-run/bib-booking", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ participantId, slotId: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Booking failed"); return; }
      setSuccess(true);
      setTimeout(onBooked, 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  if (success) {
    return (
      <div style={{ textAlign: "center", padding: 20, color: "#10b981", fontWeight: 700 }}>
        Slot booked successfully! Confirmation sent to your email.
      </div>
    );
  }

  const grouped = slots.reduce<Record<string, BibSlot[]>>((acc, slot) => {
    const date = slot.slot_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Select a convenient time to collect your race BIB and T-shirt.</div>
      {Object.entries(grouped).map(([date, daySlots]) => {
        const d = new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
        return (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{d}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {daySlots.map(slot => {
                const full     = slot.booked_count >= slot.capacity;
                const selected_ = selected === slot.id;
                return (
                  <button key={slot.id} disabled={full}
                    onClick={() => setSelected(slot.id)}
                    style={{
                      background:   selected_ ? "rgba(232,98,10,0.1)" : "rgba(255,255,255,0.03)",
                      border:       `1px solid ${selected_ ? ACCENT : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 10, padding: "12px 16px",
                      cursor:       full ? "not-allowed" : "pointer",
                      opacity:      full ? 0.5 : 1,
                      textAlign:    "left", width: "100%",
                      fontFamily:   "inherit",
                      display:      "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                    <div>
                      <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{slot.location_name}</div>
                      <div style={{ fontSize: 12, color: "#ccc" }}>{slot.start_time} - {slot.end_time}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {full ? (
                        <span style={{ fontSize: 11, color: "#ef4444" }}>Full</span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#888" }}>{slot.capacity - slot.booked_count} left</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{error}</div>}
      <button
        onClick={book}
        disabled={!selected || booking}
        style={{ ...S.btn, background: ACCENT, color: "#fff", opacity: (!selected || booking) ? 0.5 : 1, width: "100%" }}>
        {booking ? "Booking..." : "Confirm Slot"}
      </button>
    </div>
  );
}

// ── Main Dashboard Page ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { code }               = useParams<{ code: string }>();
  const [data,    setData]     = useState<DashboardData | null>(null);
  const [loading, setLoading]  = useState(true);
  const [error,   setError]    = useState("");

  function load() {
    setLoading(true);
    fetch(`/api/it-run/dashboard/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [code]);

  if (loading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#888" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>...</div>
        Loading your dashboard
      </div>
    </div>
  );

  if (error || !data) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#f87171", marginBottom: 16 }}>{error || "Registration not found"}</div>
        <Link href="/it-run" style={{ color: ACCENT, textDecoration: "none", fontSize: 13 }}>Back to event page</Link>
      </div>
    </div>
  );

  const { reg, participants, bibSlots } = data;
  const ev   = reg.it_run_events;
  const cat  = reg.it_run_categories;
  const paid = reg.payment_status === "paid" || reg.payment_status === "free";
  const eventDate = ev?.event_date ? new Date(ev.event_date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", height: 60, display: "flex", alignItems: "center", padding: "0 clamp(1rem,4vw,2rem)", gap: 12 }}>
        <Link href="/it-run" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={26} height={26} style={{ borderRadius: "50%" }} />
          <span style={{ fontSize: 12, color: "#888" }}>The IT Run Sprint-2</span>
        </Link>
        <span style={{ color: "#555" }}>/</span>
        <span style={{ fontSize: 12, color: "#fff" }}>Participant Dashboard</span>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "clamp(1.5rem,4vw,2.5rem) clamp(1rem,4vw,2rem)" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "clamp(20px,3vw,28px)", fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
            Participant Dashboard
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#888" }}>Registration Code: <strong style={{ color: "#fff", letterSpacing: "0.05em" }}>{reg.registration_code}</strong></span>
            <StatusBadge status={reg.payment_status} />
          </div>
        </div>

        {/* Payment required warning */}
        {!paid && (
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "#f59e0b", fontSize: 20 }}>!</span>
            <div>
              <div style={{ fontSize: 14, color: "#f59e0b", fontWeight: 700 }}>Payment Required</div>
              <div style={{ fontSize: 13, color: "#ccc" }}>Your registration is saved but not confirmed. Complete payment to secure your spot.</div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 }}>

          {/* Event Info */}
          <div style={S.card}>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Event Details</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={S.label}>Category</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: cat?.color ?? ACCENT }}>{cat?.name ?? "-"}</div>
              </div>
              <div>
                <div style={S.label}>Event Date</div>
                <div style={S.value}>{eventDate || "-"}</div>
              </div>
              <div>
                <div style={S.label}>Report Time</div>
                <div style={S.value}>{ev?.report_time ?? "-"}</div>
              </div>
              <div>
                <div style={S.label}>Venue</div>
                <div style={S.value}>{ev?.venue_name ?? "-"}</div>
              </div>
              {reg.final_price > 0 && (
                <div>
                  <div style={S.label}>Amount Paid</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#10b981" }}>Rs. {reg.final_price.toLocaleString("en-IN")}</div>
                </div>
              )}
            </div>
          </div>

          {/* QR Code */}
          {paid && (
            <div style={{ ...S.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Your QR Code</div>
              <QRDisplay code={reg.registration_code} token={reg.qr_token} />
              <div style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
                Show this QR at BIB collection and race-day check-in
              </div>
            </div>
          )}

        </div>

        {/* Participants */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
            Participant{participants.length > 1 ? "s" : ""} ({participants.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
            {participants.map((p) => {
              const hasBib      = !!p.bib_number;
              const isCollected = p.it_run_bib_collections.length > 0;
              const isCheckedIn = p.it_run_checkins.length > 0;
              const booking     = p.it_run_bib_bookings[0] ?? null;

              return (
                <div key={p.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                        {p.first_name} {p.last_name}
                      </div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{p.company_name ?? "IT Professional"}</div>
                    </div>
                    {hasBib && (
                      <div style={{ background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em" }}>BIB</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: "#e8620a" }}>{p.bib_number}</div>
                        {p.wave && <div style={{ fontSize: 10, color: "#888" }}>Wave {p.wave}</div>}
                      </div>
                    )}
                  </div>

                  {/* Status chips */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    <StatusBadge status={p.verification_status === "pending" ? "pending_verification" : p.verification_status} />
                    {isCollected && <StatusBadge status="verified" />}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {[
                      ["T-Shirt", p.tshirt_size ?? "-"],
                      ["Mobile",  p.mobile],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div style={S.label}>{l}</div>
                        <div style={S.value}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Journey steps */}
                  <div style={{ display: "flex", gap: 0, marginBottom: paid ? 16 : 0 }}>
                    {[
                      { label: "Registered",   done: true },
                      { label: "Payment",       done: paid },
                      { label: "ID Verified",   done: p.verification_status === "verified" },
                      { label: "BIB Collected", done: isCollected },
                      { label: "Checked In",    done: isCheckedIn },
                    ].map((step, i) => (
                      <div key={step.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{
                          width:  10, height: 10, borderRadius: "50%",
                          background: step.done ? "#10b981" : "rgba(255,255,255,0.1)",
                          border:    `1px solid ${step.done ? "#10b981" : "rgba(255,255,255,0.15)"}`,
                          position:  "relative",
                        }}>
                          {i < 4 && <div style={{ position: "absolute", top: 4, left: 10, width: "calc(100% + 10px)", height: 1, background: step.done ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.06)" }} />}
                        </div>
                        <span style={{ fontSize: 8, color: step.done ? "#10b981" : "#555", textAlign: "center", lineHeight: 1.2 }}>{step.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* BIB slot booking */}
                  {paid && !isCollected && bibSlots.length > 0 && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                      <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, marginBottom: 12 }}>BIB Collection Slot</div>
                      <BibSlotBooker
                        participantId={p.id}
                        slots={bibSlots}
                        existingBooking={booking}
                        onBooked={load}
                      />
                    </div>
                  )}

                  {isCollected && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 4 }}>
                      <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>
                        BIB Collected on {new Date(p.it_run_bib_collections[0].collected_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                  )}

                  {isCheckedIn && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#60a5fa" }}>
                      Checked in at {new Date(p.it_run_checkins[0].checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick links */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 24 }}>
          <Link href="/it-run" style={{ ...S.card, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, transition: "border-color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(232,98,10,0.3)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}>
            <div style={{ fontSize: 20 }}>&#127939;</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Event Info</div>
            <div style={{ fontSize: 11, color: "#888" }}>Schedule, venue, FAQs</div>
          </Link>
          <a href={`mailto:info@connectedsteps.in?subject=IT Run Sprint-2 Query - ${reg.registration_code}`}
            style={{ ...S.card, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, transition: "border-color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(232,98,10,0.3)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}>
            <div style={{ fontSize: 20 }}>&#128231;</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Contact Support</div>
            <div style={{ fontSize: 11, color: "#888" }}>Email our team</div>
          </a>
        </div>

        <div style={{ marginTop: 32, textAlign: "center", fontSize: 12, color: "#555" }}>
          Registration Code: {reg.registration_code} &nbsp;|&nbsp; Event: The IT Run Sprint-2 &nbsp;|&nbsp; August 17, 2026
        </div>
      </div>
    </div>
  );
}
