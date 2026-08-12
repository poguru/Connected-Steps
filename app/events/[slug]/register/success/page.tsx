"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Participant {
  id: string; first_name: string; last_name: string | null;
  email: string | null; distance_category: string | null;
  tshirt_size: string | null; qr_token: string | null;
  checked_in_at: string | null;
}

interface Registration {
  registration_code: string; payment_status: string; status: string;
  user_name: string; final_price: number; created_at: string;
  participant_count: number;
  participants: Participant[];
  events: {
    id: string; title: string; event_type: string; start_date: string;
    start_time: string | null; location: string; share_slug: string | null;
  } | null;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function icsLink(title: string, date: string, time: string | null, location: string): string {
  const start = date.replace(/-/g, "") + (time ? `T${time.replace(":", "")}00` : "");
  const end   = date.replace(/-/g, "") + (time ? `T${(parseInt(time.split(":")[0]) + 2).toString().padStart(2,"0")}${time.split(":")[1]}00` : "");
  const ics   = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `LOCATION:${location}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\n");
  return `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`;
}

export default function SuccessPage() {
  const params      = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const code        = searchParams.get("code") ?? "";
  const isPaid      = !!searchParams.get("paid");
  const slug        = params.slug;

  const [reg, setReg]       = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]  = useState(false);

  useEffect(() => {
    if (!code) { setLoading(false); return; }
    const token = localStorage.getItem("cs_user_token") ?? "";
    fetch("/api/events/my-registrations", { headers: { "x-user-token": token } })
      .then(r => r.json())
      .then(d => {
        const found = (d.registrations ?? []).find((r: Registration) => r.registration_code === code);
        setReg(found ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [code]);

  function copyCode() {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const ev = reg?.events;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>

      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center" }}>
        <Link href="/" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Connected Steps</Link>
      </nav>

      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "3rem 1.5rem 5rem", textAlign: "center" }}>

        {/* Success icon */}
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(74,222,128,0.1)", border: "2px solid rgba(74,222,128,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem", fontSize: "2rem" }}>
          ✅
        </div>

        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>
          {isPaid ? "Payment Successful!" : "You're Registered!"}
        </h1>
        <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", marginBottom: "2rem", lineHeight: 1.6 }}>
          {isPaid
            ? "Your payment has been confirmed and registration is complete."
            : "Your registration is confirmed. See you at the event!"}
        </p>

        {/* Registration card */}
        {loading ? (
          <div style={{ height: 160, borderRadius: 14, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s infinite" }} />
        ) : (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.75rem", textAlign: "left" }}>

            {/* Registration ID */}
            <div style={{ marginBottom: "1.25rem", textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Registration ID</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "#e8620a", letterSpacing: "0.06em", fontFamily: "monospace" }}>{code}</span>
                <button onClick={copyCode} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "4px 10px", color: copied ? "#4ade80" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {ev && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                <SRow label="Event">{ev.title}</SRow>
                <SRow label="Date">{fmtDate(ev.start_date)}{ev.start_time ? ` · ${fmtTime(ev.start_time)}` : ""}</SRow>
                <SRow label="Venue">{ev.location}</SRow>
                {reg && <SRow label="Payment">{reg.payment_status === "paid" ? `₹${reg.final_price} Paid ✓` : reg.payment_status === "free" ? "Free Entry" : reg.payment_status}</SRow>}
              </div>
            )}
          </div>
        )}

        {/* Participants list — shown when there are 2+ participants (i.e., friend booking) */}
        {!loading && reg && (reg.participants?.length ?? 0) > 1 && (
          <div style={{ marginBottom: "1.75rem", textAlign: "left" }}>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.875rem", textAlign: "center" }}>
              Registered Participants ({reg.participants.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {reg.participants.map((p, i) => {
                const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
                const qrUrl = p.qr_token
                  ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/events/qr/${encodeURIComponent(p.qr_token)}`
                  : null;
                return (
                  <div key={p.id ?? i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                    {qrUrl && (
                      <img src={qrUrl} alt={`QR for ${name}`}
                        style={{ width: 72, height: 72, borderRadius: 8, background: "#fff", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", marginBottom: "3px" }}>{name}</div>
                      {p.distance_category && (
                        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>{p.distance_category}</div>
                      )}
                      {p.tshirt_size && (
                        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>T-Shirt: {p.tshirt_size}</div>
                      )}
                      {p.checked_in_at && (
                        <div style={{ fontSize: "0.72rem", color: "#4ade80", marginTop: "2px" }}>✓ Checked in</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>

          {ev && (
            <a
              href={icsLink(ev.title, ev.start_date, ev.start_time, ev.location)}
              download={`${ev.share_slug ?? ev.id}.ics`}
              style={{ display: "block", padding: "12px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, textAlign: "center" }}>
              📅 Add to Calendar
            </a>
          )}

          {ev && (
            <button
              onClick={() => {
                const url  = `${window.location.origin}/events/${ev.share_slug ?? ev.id}`;
                const text = `I just registered for ${ev.title} on ${fmtDate(ev.start_date)} at ${ev.location}! Join me at Connected Steps: ${url}`;
                if (navigator.share) {
                  navigator.share({ title: ev.title, text, url }).catch(() => {});
                } else {
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
                }
              }}
              style={{ padding: "12px", borderRadius: "10px", background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", color: "#25D366", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              📤 Share Event
            </button>
          )}

          <Link href="/dashboard/events"
            style={{ display: "block", padding: "12px", borderRadius: "10px", background: "linear-gradient(135deg,#e8620a,#f07c2a)", color: "#fff", textDecoration: "none", fontSize: "0.875rem", fontWeight: 700, textAlign: "center" }}>
            View My Registrations →
          </Link>

          <Link href="/events"
            style={{ display: "block", fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", textDecoration: "none", textAlign: "center", padding: "0.5rem" }}>
            Browse more events
          </Link>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }`}</style>
    </div>
  );
}

function SRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.8)", fontWeight: 500, textAlign: "right" }}>{children}</span>
    </div>
  );
}
