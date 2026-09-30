"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BibSlot {
  id: string;
  location_name: string;
  location_address: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  available_count: number;
  is_active: boolean;
}

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  participant_type: string;
  current_booking: {
    id: string;
    location_name: string;
    location_address: string | null;
    slot_date: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface PageData {
  registration: {
    id: string;
    registration_code: string;
    category_name: string;
    category_type: string;
    participant_count: number;
    event_title: string;
    event_date: string;
    venue_name: string;
  };
  participants: Participant[];
  slots: BibSlot[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PARTICIPANT_TYPE_LABEL: Record<string, string> = {
  solo:      "",
  parent:    "Parent",
  child:     "Child",
  primary:   "Runner 1",
  secondary: "Runner 2",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatSlotDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function groupByDate(slots: BibSlot[]): { date: string; slots: BibSlot[] }[] {
  const map = new Map<string, BibSlot[]>();
  for (const s of slots) {
    const arr = map.get(s.slot_date) ?? [];
    arr.push(s);
    map.set(s.slot_date, arr);
  }
  return Array.from(map.entries()).map(([date, slots]) => ({ date, slots }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BibCollectionPage() {
  const params = useParams();
  const token  = typeof params?.token === "string" ? params.token : "";

  const [data,          setData]          = useState<PageData | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);

  // Which participant is currently selecting a slot (null = none)
  const [selecting,     setSelecting]     = useState<string | null>(null);
  // Slot id being booked (for loading indicator on button)
  const [bookingSlot,   setBookingSlot]   = useState<string | null>(null);
  const [bookingError,  setBookingError]  = useState<string | null>(null);

  // Fetch registration data
  const fetchData = useCallback(async () => {
    if (!token) { setError("Missing booking link token"); setLoading(false); return; }
    try {
      const res  = await fetch(`/api/events/it-run-sprint-2/bib-collection/${token}`);
      const json = await res.json() as { error?: string } & Partial<PageData>;
      if (!res.ok) { setError(json.error ?? "Invalid or expired link"); setLoading(false); return; }
      setData(json as PageData);
    } catch {
      setError("Failed to load. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const bookSlot = async (participantId: string, slotId: string) => {
    setBookingSlot(slotId);
    setBookingError(null);
    try {
      const res  = await fetch(`/api/events/it-run-sprint-2/bib-collection/${token}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ participantId, slotId }),
      });
      const json = await res.json() as {
        ok?: boolean; already?: boolean; error?: string;
        slot?: { id: string; location_name: string; location_address: string | null; slot_date: string; start_time: string; end_time: string };
      };

      if (!res.ok) { setBookingError(json.error ?? "Booking failed"); return; }

      // Update local state: set participant's current_booking + refresh slot counts
      setData(prev => {
        if (!prev) return prev;
        const slot = prev.slots.find(s => s.id === slotId);
        return {
          ...prev,
          participants: prev.participants.map(p =>
            p.id === participantId
              ? { ...p, current_booking: json.already ? p.current_booking : (slot ? { id: slot.id, location_name: slot.location_name, location_address: slot.location_address, slot_date: slot.slot_date, start_time: slot.start_time, end_time: slot.end_time } : null) }
              : p
          ),
          // Decrement available count for the booked slot (unless already_booked)
          slots: json.already ? prev.slots : prev.slots.map(s =>
            s.id === slotId ? { ...s, available_count: Math.max(0, s.available_count - 1) } : s
          ),
        };
      });

      setSelecting(null);
    } catch {
      setBookingError("Network error — please try again.");
    } finally {
      setBookingSlot(null);
    }
  };

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.centerBox}>
          <div style={styles.spinner} />
          <p style={{ color: "#888", margin: "16px 0 0", fontSize: "14px" }}>Loading your booking page…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", padding: "32px 24px" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>Link not valid</div>
            <p style={{ color: "#888", fontSize: "14px", lineHeight: 1.7, margin: "0 0 20px" }}>
              {error ?? "This booking link is invalid or has expired."}
            </p>
            <p style={{ color: "#666", fontSize: "12px", margin: 0 }}>
              Need help? Email{" "}
              <a href="mailto:info@connectedsteps.in" style={{ color: "#e8620a" }}>
                info@connectedsteps.in
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { registration: reg, participants, slots } = data;
  const slotGroups = groupByDate(slots);
  const allBooked  = participants.every(p => p.current_booking !== null);

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "4px" }}>
            Connected Steps
          </div>
          <div style={{ fontSize: "22px", fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
            BIB Collection Booking
          </div>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
            {reg.event_title} · {formatDate(reg.event_date)}
          </div>
        </div>
      </div>

      <div style={styles.content}>
        {/* ── Registration summary ── */}
        <div style={styles.card}>
          <div style={styles.cardRow}>
            <div>
              <div style={styles.cardLabel}>Registration Code</div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#fff", letterSpacing: "0.08em" }}>
                {reg.registration_code}
              </div>
            </div>
            <div>
              <div style={styles.cardLabel}>Category</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>{reg.category_name}</div>
            </div>
          </div>
        </div>

        {/* ── Status banner ── */}
        {allBooked ? (
          <div style={{ ...styles.banner, borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)" }}>
            <span style={{ color: "#10b981", fontWeight: 700, marginRight: "8px" }}>✓</span>
            <span style={{ color: "#ccc", fontSize: "14px" }}>
              {participants.length === 1
                ? "Your BIB collection slot is booked!"
                : "All participants have booked their BIB collection slots!"}
            </span>
          </div>
        ) : (
          <div style={{ ...styles.banner, borderColor: "rgba(232,98,10,0.3)", background: "rgba(232,98,10,0.06)" }}>
            <span style={{ color: "#e8620a", fontWeight: 700, marginRight: "8px" }}>→</span>
            <span style={{ color: "#ccc", fontSize: "14px" }}>
              {participants.length === 1
                ? "Select a BIB collection slot below."
                : `${participants.filter(p => !p.current_booking).length} of ${participants.length} participants still need to book a slot.`}
            </span>
          </div>
        )}

        {/* ── Participants ── */}
        {participants.map(participant => {
          const label     = PARTICIPANT_TYPE_LABEL[participant.participant_type] ?? "";
          const isSelecting = selecting === participant.id;

          return (
            <div key={participant.id} style={styles.card}>
              {/* Participant header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #222" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                    {participant.first_name} {participant.last_name}
                  </span>
                  {label && (
                    <span style={styles.typeBadge}>{label}</span>
                  )}
                </div>
              </div>

              {/* Booking status or picker */}
              {participant.current_booking ? (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                        <span style={{ color: "#10b981", fontSize: "13px", fontWeight: 700 }}>✓ Slot booked</span>
                      </div>
                      <div style={styles.bookedSlotDetail}>
                        <span style={styles.bookedSlotIcon}>📍</span>
                        <span style={{ color: "#ccc" }}>{participant.current_booking.location_name}</span>
                      </div>
                      {participant.current_booking.location_address && (
                        <div style={{ ...styles.bookedSlotDetail, marginTop: "2px" }}>
                          <span style={styles.bookedSlotIcon}></span>
                          <span style={{ color: "#666", fontSize: "12px" }}>{participant.current_booking.location_address}</span>
                        </div>
                      )}
                      <div style={{ ...styles.bookedSlotDetail, marginTop: "8px" }}>
                        <span style={styles.bookedSlotIcon}>📅</span>
                        <span style={{ color: "#ccc" }}>{formatSlotDate(participant.current_booking.slot_date)}</span>
                      </div>
                      <div style={styles.bookedSlotDetail}>
                        <span style={styles.bookedSlotIcon}>🕐</span>
                        <span style={{ color: "#ccc" }}>{participant.current_booking.start_time} – {participant.current_booking.end_time}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelecting(isSelecting ? null : participant.id)}
                      style={styles.changeBtn}
                    >
                      {isSelecting ? "Cancel" : "Change Slot"}
                    </button>
                  </div>

                  {isSelecting && (
                    <SlotPicker
                      groups={slotGroups}
                      currentSlotId={participant.current_booking.id}
                      bookingSlot={bookingSlot}
                      error={bookingError}
                      onBook={slotId => void bookSlot(participant.id, slotId)}
                    />
                  )}
                </div>
              ) : (
                <div style={{ padding: "16px 20px" }}>
                  <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#888" }}>
                    Choose a BIB collection slot:
                  </p>
                  <SlotPicker
                    groups={slotGroups}
                    currentSlotId={null}
                    bookingSlot={bookingSlot}
                    error={bookingError}
                    onBook={slotId => void bookSlot(participant.id, slotId)}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* ── What to bring ── */}
        <div style={styles.card}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #222" }}>
            <div style={{ fontSize: "11px", color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
              What to bring
            </div>
          </div>
          <div style={{ padding: "14px 20px" }}>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "13px", color: "#888", lineHeight: 2 }}>
              <li>✓ &nbsp;<strong style={{ color: "#ccc" }}>Original company / employee ID card</strong> for physical verification</li>
              <li>✓ &nbsp;Race-day QR code from your confirmation email</li>
            </ul>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: "center", padding: "24px 0 8px", color: "#444", fontSize: "12px" }}>
          <div style={{ fontWeight: 700, marginBottom: "2px" }}>Connected Steps</div>
          <div>{reg.venue_name} &middot; connectedsteps.in</div>
          <div style={{ marginTop: "8px" }}>
            <a href="mailto:info@connectedsteps.in" style={{ color: "#666", textDecoration: "none" }}>
              info@connectedsteps.in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SlotPicker sub-component ──────────────────────────────────────────────────

interface SlotPickerProps {
  groups:       { date: string; slots: BibSlot[] }[];
  currentSlotId: string | null;
  bookingSlot:  string | null;
  error:        string | null;
  onBook:       (slotId: string) => void;
}

function SlotPicker({ groups, currentSlotId, bookingSlot, error, onBook }: SlotPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);

  if (groups.every(g => g.slots.every(s => s.available_count === 0))) {
    return (
      <p style={{ color: "#888", fontSize: "13px", margin: 0 }}>
        No slots available at this time. Please contact{" "}
        <a href="mailto:info@connectedsteps.in" style={{ color: "#e8620a" }}>info@connectedsteps.in</a>.
      </p>
    );
  }

  return (
    <div>
      {groups.map(({ date, slots }) => (
        <div key={date} style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
            {formatSlotDate(date)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {slots.map(slot => {
              const isCurrent  = slot.id === currentSlotId;
              const isSelected = slot.id === selected;
              const isFull     = slot.available_count === 0;
              const isLoading  = bookingSlot === slot.id;

              return (
                <button
                  key={slot.id}
                  disabled={isFull || isLoading}
                  onClick={() => !isFull && setSelected(slot.id === selected ? null : slot.id)}
                  style={{
                    ...styles.slotBtn,
                    ...(isSelected ? styles.slotBtnSelected : {}),
                    ...(isFull ? styles.slotBtnFull : {}),
                    ...(isCurrent ? styles.slotBtnCurrent : {}),
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", gap: "8px" }}>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: isFull ? "#555" : (isSelected ? "#fff" : "#ccc") }}>
                        {slot.start_time} – {slot.end_time}
                      </div>
                      <div style={{ fontSize: "12px", color: isFull ? "#444" : "#888", marginTop: "2px" }}>
                        {slot.location_name}
                      </div>
                      {slot.location_address && (
                        <div style={{ fontSize: "11px", color: "#555", marginTop: "1px" }}>{slot.location_address}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {isCurrent ? (
                        <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 700, textTransform: "uppercase" }}>Current</span>
                      ) : isFull ? (
                        <span style={{ fontSize: "10px", color: "#555", fontWeight: 700, textTransform: "uppercase" }}>Full</span>
                      ) : (
                        <span style={{ fontSize: "11px", color: isSelected ? "#10b981" : "#666" }}>
                          {slot.available_count} spot{slot.available_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected && (
        <div style={{ marginTop: "12px" }}>
          {error && (
            <div style={styles.errorBox}>{error}</div>
          )}
          <button
            onClick={() => onBook(selected)}
            disabled={bookingSlot !== null}
            style={styles.confirmBtn}
          >
            {bookingSlot ? "Booking…" : "Confirm This Slot →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight:       "100vh",
    background:      "#0a0a0a",
    color:           "#fff",
    fontFamily:      "'Helvetica Neue', Arial, sans-serif",
    WebkitFontSmoothing: "antialiased",
  },
  header: {
    background:   "#0f0f0f",
    borderBottom: "1px solid #1a1a1a",
    paddingTop:   "env(safe-area-inset-top, 0px)",
  },
  headerInner: {
    maxWidth:  "640px",
    margin:    "0 auto",
    padding:   "20px 16px",
  },
  content: {
    maxWidth: "640px",
    margin:   "0 auto",
    padding:  "16px 16px 40px",
    display:  "flex",
    flexDirection: "column",
    gap: "12px",
  },
  card: {
    background:   "#141414",
    border:       "1px solid #262626",
    borderRadius: "12px",
    overflow:     "hidden",
  },
  cardRow: {
    display:       "flex",
    gap:           "16px",
    padding:       "16px 20px",
    flexWrap:      "wrap",
  },
  cardLabel: {
    fontSize:        "10px",
    color:           "#666",
    textTransform:   "uppercase" as const,
    letterSpacing:   "0.1em",
    marginBottom:    "4px",
  },
  banner: {
    border:       "1px solid",
    borderRadius: "10px",
    padding:      "12px 16px",
    display:      "flex",
    alignItems:   "flex-start",
    gap:          "6px",
  },
  typeBadge: {
    fontSize:        "10px",
    fontWeight:      700,
    textTransform:   "uppercase" as const,
    letterSpacing:   "0.08em",
    color:           "#e8620a",
    background:      "rgba(232,98,10,0.12)",
    border:          "1px solid rgba(232,98,10,0.25)",
    borderRadius:    "4px",
    padding:         "2px 7px",
  },
  bookedSlotDetail: {
    display:    "flex",
    alignItems: "flex-start",
    gap:        "6px",
    fontSize:   "13px",
    lineHeight: "1.6",
  },
  bookedSlotIcon: {
    fontSize:  "12px",
    flexShrink: 0,
    marginTop:  "2px",
    width:      "16px",
  },
  changeBtn: {
    background:   "transparent",
    border:       "1px solid #333",
    borderRadius: "6px",
    color:        "#888",
    fontSize:     "12px",
    padding:      "6px 12px",
    cursor:       "pointer",
    flexShrink:   0,
    whiteSpace:   "nowrap" as const,
  },
  slotBtn: {
    display:      "flex",
    width:        "100%",
    background:   "#1a1a1a",
    border:       "1px solid #2a2a2a",
    borderRadius: "8px",
    padding:      "12px 14px",
    cursor:       "pointer",
    textAlign:    "left" as const,
    transition:   "border-color 0.15s",
  },
  slotBtnSelected: {
    border:     "1px solid #e8620a",
    background: "rgba(232,98,10,0.08)",
  },
  slotBtnFull: {
    opacity: 0.45,
    cursor:  "default" as const,
  },
  slotBtnCurrent: {
    border:     "1px solid rgba(16,185,129,0.4)",
    background: "rgba(16,185,129,0.06)",
  },
  confirmBtn: {
    width:        "100%",
    background:   "#e8620a",
    border:       "none",
    borderRadius: "8px",
    color:        "#fff",
    fontSize:     "15px",
    fontWeight:   700,
    padding:      "14px",
    cursor:       "pointer",
  },
  errorBox: {
    background:   "rgba(239,68,68,0.1)",
    border:       "1px solid rgba(239,68,68,0.3)",
    borderRadius: "6px",
    color:        "#f87171",
    fontSize:     "13px",
    padding:      "10px 12px",
    marginBottom: "10px",
  },
  centerBox: {
    display:        "flex",
    flexDirection:  "column" as const,
    alignItems:     "center",
    justifyContent: "center",
    minHeight:      "100vh",
  },
  spinner: {
    width:       "32px",
    height:      "32px",
    border:      "3px solid #222",
    borderTop:   "3px solid #e8620a",
    borderRadius: "50%",
    animation:   "spin 0.8s linear infinite",
  },
};
