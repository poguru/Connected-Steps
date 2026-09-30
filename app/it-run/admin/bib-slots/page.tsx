"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";
const RED    = "#ef4444";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12, padding: 16,
};
const INPUT: React.CSSProperties = {
  padding: "9px 12px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
  width: "100%", boxSizing: "border-box",
};

interface BibSlot {
  id: string; slot_date: string; start_time: string; end_time: string;
  location_name: string; location_address: string | null;
  capacity: number; booked_count: number; live_booked_count: number;
  is_active: boolean;
}

type SlotStatus = "active" | "disabled" | "full";

function slotStatus(s: BibSlot): SlotStatus {
  if (s.live_booked_count >= s.capacity) return "full";
  if (!s.is_active) return "disabled";
  return "active";
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}

type FormState = {
  slot_date: string; start_time: string; end_time: string;
  location_name: string; location_address: string; capacity: string; is_active: boolean;
};

const EMPTY: FormState = {
  slot_date: "", start_time: "07:00", end_time: "10:00",
  location_name: "", location_address: "", capacity: "100", is_active: true,
};

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export default function BibSlotsPage() {
  const [slots,     setSlots]     = useState<BibSlot[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [globalMsg, setGlobalMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Modal state
  const [mode,       setMode]       = useState<"none" | "add" | "edit" | "delete">("none");
  const [activeSlot, setActiveSlot] = useState<BibSlot | null>(null);
  const [form,       setForm]       = useState<FormState>(EMPTY);
  const [formErr,    setFormErr]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/it-run/admin/bib-slots");
      const d = await r.json();
      setSlots(d.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openAdd() {
    setForm(EMPTY); setFormErr(null); setActiveSlot(null); setMode("add"); setGlobalMsg(null);
  }

  function openEdit(s: BibSlot) {
    setForm({
      slot_date: s.slot_date, start_time: s.start_time, end_time: s.end_time,
      location_name: s.location_name, location_address: s.location_address ?? "",
      capacity: String(s.capacity), is_active: s.is_active,
    });
    setFormErr(null); setActiveSlot(s); setMode("edit"); setGlobalMsg(null);
  }

  function openDelete(s: BibSlot) { setActiveSlot(s); setMode("delete"); setGlobalMsg(null); }
  function closeModal() { setMode("none"); setActiveSlot(null); setFormErr(null); }

  function upd<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setFormErr(null); setSaving(true);
    try {
      const r = await fetch("/api/it-run/admin/bib-slots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_date: form.slot_date, start_time: form.start_time, end_time: form.end_time,
          location: form.location_name, location_address: form.location_address || undefined,
          capacity: Number(form.capacity),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setFormErr(d.error ?? "Failed to create slot"); return; }
      setSlots(prev => [...prev, d.data as BibSlot].sort((a, b) =>
        a.slot_date.localeCompare(b.slot_date) || a.start_time.localeCompare(b.start_time)));
      closeModal();
      setGlobalMsg({ text: "Slot created successfully", ok: true });
    } finally { setSaving(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault(); if (!activeSlot) return;
    setFormErr(null); setSaving(true);
    try {
      const r = await fetch("/api/it-run/admin/bib-slots", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeSlot.id, slot_date: form.slot_date, start_time: form.start_time,
          end_time: form.end_time, location_name: form.location_name,
          location_address: form.location_address || null,
          capacity: Number(form.capacity), is_active: form.is_active,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setFormErr(d.error ?? "Failed to update slot"); return; }
      setSlots(prev => prev.map(s => s.id === activeSlot.id ? { ...s, ...(d.data as BibSlot) } : s));
      closeModal();
      setGlobalMsg({ text: "Slot updated", ok: true });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!activeSlot) return; setSaving(true);
    try {
      const r = await fetch("/api/it-run/admin/bib-slots", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeSlot.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        closeModal();
        setGlobalMsg({ text: d.error ?? "Cannot delete slot", ok: false });
        return;
      }
      setSlots(prev => prev.filter(s => s.id !== activeSlot.id));
      closeModal();
      setGlobalMsg({ text: "Slot deleted", ok: true });
    } finally { setSaving(false); }
  }

  async function handleToggle(s: BibSlot) {
    const r = await fetch("/api/it-run/admin/bib-slots", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, is_active: !s.is_active }),
    });
    if (r.ok) {
      setSlots(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !s.is_active } : x));
      setGlobalMsg({ text: `Slot ${!s.is_active ? "enabled" : "disabled"}`, ok: true });
    }
  }

  // Group by date
  const grouped = slots.reduce<Record<string, BibSlot[]>>((acc, s) => {
    (acc[s.slot_date] ??= []).push(s); return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort();

  const SlotForm = ({ onSubmit, isEdit }: { onSubmit: (e: React.FormEvent) => void; isEdit: boolean }) => (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {formErr && (
        <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 12 }}>
          {formErr}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <LabeledInput label="Date *">
          <input type="date" style={INPUT} required value={form.slot_date}
            onChange={e => upd("slot_date", e.target.value)} />
        </LabeledInput>
        <LabeledInput label="Start Time *">
          <input type="time" style={INPUT} required value={form.start_time}
            onChange={e => upd("start_time", e.target.value)} />
        </LabeledInput>
        <LabeledInput label="End Time *">
          <input type="time" style={INPUT} required value={form.end_time}
            onChange={e => upd("end_time", e.target.value)} />
        </LabeledInput>
        <LabeledInput label={`Capacity *${isEdit && activeSlot ? ` (min ${activeSlot.live_booked_count} booked)` : ""}`}>
          <input type="number" min={isEdit && activeSlot ? activeSlot.live_booked_count : 1} style={INPUT} required
            value={form.capacity} onChange={e => upd("capacity", e.target.value)} />
        </LabeledInput>
      </div>
      <LabeledInput label="Location Name *">
        <input style={INPUT} required placeholder="e.g. Connected Steps Studio - Miyapur"
          value={form.location_name} onChange={e => upd("location_name", e.target.value)} />
      </LabeledInput>
      <LabeledInput label="Location Address">
        <input style={INPUT} placeholder="Full address (optional)"
          value={form.location_address} onChange={e => upd("location_address", e.target.value)} />
      </LabeledInput>
      {isEdit && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={form.is_active} onChange={e => upd("is_active", e.target.checked)}
            style={{ width: 15, height: 15, accentColor: ACCENT }} />
          <span style={{ fontSize: 13, color: "#ccc" }}>Active (visible to participants)</span>
        </label>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="submit" disabled={saving}
          style={{ flex: 1, padding: "11px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Slot")}
        </button>
        <button type="button" onClick={closeModal}
          style={{ padding: "11px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <>
      {/* ── Modal overlay ───────────────────────────────────────────── */}
      {mode !== "none" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", padding: 28 }}>

            {mode === "add" && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 20 }}>New BIB Collection Slot</div>
                <SlotForm onSubmit={handleCreate} isEdit={false} />
              </>
            )}

            {mode === "edit" && activeSlot && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Edit Slot</div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  {fmtDate(activeSlot.slot_date)} · {activeSlot.start_time.slice(0,5)}–{activeSlot.end_time.slice(0,5)}
                  {" · "}<span style={{ color: activeSlot.live_booked_count > 0 ? "#f59e0b" : "#666" }}>
                    {activeSlot.live_booked_count} booked
                  </span>
                </div>
                <SlotForm onSubmit={handleEdit} isEdit={true} />
              </>
            )}

            {mode === "delete" && activeSlot && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Delete Slot</div>
                {activeSlot.live_booked_count > 0 ? (
                  <>
                    <div style={{ padding: "14px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, fontSize: 13, color: "#fca5a5", marginBottom: 20, lineHeight: 1.6 }}>
                      This slot has <strong>{activeSlot.live_booked_count}</strong> existing booking{activeSlot.live_booked_count !== 1 ? "s" : ""} and cannot be deleted.
                      You can <strong>disable it</strong> instead to prevent new bookings.
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => { closeModal(); handleToggle(activeSlot); }}
                        style={{ flex: 1, padding: "11px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#f87171", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                        Disable Instead
                      </button>
                      <button onClick={closeModal}
                        style={{ padding: "11px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>
                      Are you sure you want to permanently delete this slot?<br />
                      <strong style={{ color: "#ccc" }}>{fmtDate(activeSlot.slot_date)} · {activeSlot.start_time.slice(0,5)}–{activeSlot.end_time.slice(0,5)} · {activeSlot.location_name}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={handleDelete} disabled={saving}
                        style={{ flex: 1, padding: "11px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, color: "#f87171", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {saving ? "Deleting…" : "Yes, Delete"}
                      </button>
                      <button onClick={closeModal}
                        style={{ padding: "11px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Main page ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 800 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>BIB Collection Slots</h1>
            <div style={{ fontSize: 13, color: "#888" }}>{slots.length} slot{slots.length !== 1 ? "s" : ""} configured</div>
          </div>
          <button onClick={openAdd}
            style={{ padding: "9px 18px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            + Add Slot
          </button>
        </div>

        {globalMsg && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: globalMsg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${globalMsg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: globalMsg.ok ? GREEN : "#f87171" }}>
            {globalMsg.text}
          </div>
        )}

        {loading ? (
          <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>
        ) : slots.length === 0 ? (
          <div style={{ ...CARD, textAlign: "center", padding: 48, color: "#666" }}>
            No BIB collection slots configured yet.<br />
            <button onClick={openAdd} style={{ marginTop: 16, padding: "8px 18px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              + Add First Slot
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {sortedDates.map(date => (
              <div key={date}>
                <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 10 }}>
                  {fmtDate(date)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {grouped[date].map(slot => {
                    const st   = slotStatus(slot);
                    const live = slot.live_booked_count;
                    const pct  = slot.capacity > 0 ? Math.min(100, Math.round((live / slot.capacity) * 100)) : 0;
                    const barColor = st === "full" ? RED : st === "disabled" ? "#555" : GREEN;
                    const countColor = st === "full" ? RED : st === "disabled" ? "#555" : GREEN;

                    return (
                      <div key={slot.id} style={{ ...CARD, opacity: slot.is_active ? 1 : 0.65 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>

                          {/* Left */}
                          <div style={{ flex: 1, minWidth: 220 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                                {slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}
                              </span>
                              {/* Status badge */}
                              {st === "full" && (
                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: RED, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                  FULL
                                </span>
                              )}
                              {st === "disabled" && (
                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                  DISABLED
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 2 }}>{slot.location_name}</div>
                            {slot.location_address && <div style={{ fontSize: 11, color: "#555" }}>{slot.location_address}</div>}
                          </div>

                          {/* Right */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                            <div style={{ textAlign: "center", minWidth: 60 }}>
                              <div style={{ fontSize: 17, fontWeight: 900, color: countColor }}>
                                {live}/{slot.capacity}
                              </div>
                              <div style={{ fontSize: 10, color: "#555" }}>booked</div>
                            </div>
                            <button onClick={() => openEdit(slot)}
                              style={{ padding: "6px 12px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 8, color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              Edit
                            </button>
                            <button onClick={() => handleToggle(slot)}
                              style={{ padding: "6px 12px", background: slot.is_active ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${slot.is_active ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`, borderRadius: 8, color: slot.is_active ? "#f87171" : GREEN, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              {slot.is_active ? "Disable" : "Enable"}
                            </button>
                            <button onClick={() => openDelete(slot)}
                              style={{ padding: "6px 12px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 8, color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Capacity bar */}
                        <div style={{ marginTop: 12, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
