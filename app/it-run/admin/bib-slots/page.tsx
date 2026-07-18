"use client";

import { useState, useEffect, useCallback } from "react";

interface BibSlot {
  id: string; slot_date: string; start_time: string; end_time: string;
  location_name: string; location_address: string | null;
  capacity: number; booked_count: number; is_active: boolean;
}

const ACCENT = "#e8620a";
const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16 };
const INPUT: React.CSSProperties = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };

const EMPTY_FORM = { slot_date: "", start_time: "07:00", end_time: "10:00", location: "", location_address: "", capacity: 100 };

export default function BibSlotsPage() {
  const [slots,    setSlots]    = useState<BibSlot[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/it-run/admin/bib-slots");
      const d   = await res.json();
      setSlots(d.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createSlot() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/it-run/admin/bib-slots", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...form, capacity: Number(form.capacity) }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to create slot"); return; }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleSlot(id: string, is_active: boolean) {
    await fetch("/api/it-run/admin/bib-slots", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, is_active }),
    });
    await load();
  }

  const grouped = slots.reduce<Record<string, BibSlot[]>>((acc, s) => {
    const d = s.slot_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(s);
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>BIB Collection Slots</h1>
          <div style={{ fontSize: 13, color: "#888" }}>{slots.length} slots configured</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ padding: "9px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {showForm ? "Cancel" : "+ Add Slot"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...CARD, marginBottom: 20, border: `1px solid ${ACCENT}40` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New BIB Collection Slot</div>
          {error && <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Date</div>
              <input type="date" style={INPUT} value={form.slot_date} onChange={e => setForm(f => ({ ...f, slot_date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Start Time</div>
              <input type="time" style={INPUT} value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>End Time</div>
              <input type="time" style={INPUT} value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Capacity</div>
              <input type="number" min={1} style={INPUT} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Location Name</div>
            <input style={INPUT} placeholder="e.g. HITEC City Sports Complex" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Location Address (optional)</div>
            <input style={INPUT} placeholder="Full address" value={form.location_address} onChange={e => setForm(f => ({ ...f, location_address: e.target.value }))} />
          </div>
          <button onClick={createSlot} disabled={saving || !form.slot_date || !form.location}
            style={{ padding: "9px 18px", background: saving ? "rgba(255,255,255,0.1)" : ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Creating..." : "Create Slot"}
          </button>
        </div>
      )}

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Object.entries(grouped).map(([date, daySlots]) => (
            <div key={date}>
              <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 10 }}>
                {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {daySlots.map(slot => {
                  const pct  = Math.round((slot.booked_count / slot.capacity) * 100);
                  const full = slot.booked_count >= slot.capacity;
                  return (
                    <div key={slot.id} style={{ ...CARD, opacity: slot.is_active ? 1 : 0.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                            {slot.start_time.slice(0,5)} - {slot.end_time.slice(0,5)}
                          </div>
                          <div style={{ fontSize: 13, color: "#ccc", marginTop: 2 }}>{slot.location_name}</div>
                          {slot.location_address && <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>{slot.location_address}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: full ? "#ef4444" : "#10b981" }}>{slot.booked_count}/{slot.capacity}</div>
                            <div style={{ fontSize: 10, color: "#666" }}>booked</div>
                          </div>
                          <button onClick={() => toggleSlot(slot.id, !slot.is_active)}
                            style={{ padding: "6px 12px", background: slot.is_active ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${slot.is_active ? "#ef4444" : "#10b981"}40`, borderRadius: 8, color: slot.is_active ? "#f87171" : "#10b981", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            {slot.is_active ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: full ? "#ef4444" : "#10b981", borderRadius: 2, transition: "width 0.5s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {slots.length === 0 && <div style={{ color: "#888", textAlign: "center", padding: 40 }}>No BIB collection slots configured yet</div>}
        </div>
      )}
    </div>
  );
}
