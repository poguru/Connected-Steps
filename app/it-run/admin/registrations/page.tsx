"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";

// ── Types ──────────────────────────────────────────────────────────────────────

type BibCollection = { id: string; collected_at: string | null; counter_name: string | null };
type Checkin       = { id: string; checked_in_at: string };

type Participant = {
  id: string; participant_type: string; first_name: string; last_name: string;
  gender: string; dob: string | null; email: string | null; mobile: string;
  blood_group: string | null; emergency_name: string | null; emergency_phone: string | null;
  company_name: string | null; employee_id: string | null; company_id_url: string | null;
  tshirt_size: string | null; medical_conditions: string | null; food_preference: string | null;
  bib_number: string | null; wave: string | null; collection_counter: string | null;
  verification_status: string;
  it_run_bib_collections: BibCollection[];
  it_run_checkins: Checkin[];
};

type Registration = {
  id: string; registration_code: string; lead_email: string; participant_count: number;
  base_price: number; discount_amount: number; final_price: number;
  payment_status: string; registration_status: string;
  cancelled_reason: string | null; cancelled_at: string | null; admin_notes: string | null;
  created_at: string; updated_at: string;
  it_run_categories: { id: string; name: string; distance_km: number | null; category_type: string; color: string } | null;
  it_run_coupons: { code: string; discount_type: string; discount_value: number } | null;
  it_run_participants: Participant[];
};

type Category = { id: string; name: string; color: string };

// ── Color helpers ──────────────────────────────────────────────────────────────

const PAY_COLOR: Record<string, string> = {
  paid:    GREEN,   free:    GREEN,
  pending: "#f59e0b", failed: "#ef4444",
};
const REG_COLOR: Record<string, string> = {
  active: GREEN, cancelled: "#ef4444",
};
const VER_COLOR: Record<string, string> = {
  verified:           GREEN,    pending: "#f59e0b",
  rejected:           "#ef4444", need_clarification: "#6366f1",
};
function chip(label: string, color: string) {
  return { label, color, bg: `${color}18`, border: `1px solid ${color}30` };
}

// ── KV display ────────────────────────────────────────────────────────────────

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#ccc", fontFamily: mono ? "monospace" : "inherit" }}>{value ?? "—"}</div>
    </div>
  );
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
      color, background: `${color}18`, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

// ── Participant edit modal ─────────────────────────────────────────────────────

const EDITABLE_FIELDS: Array<{ key: keyof Participant; label: string; type?: string; hint?: string; options?: string[] }> = [
  { key: "first_name",      label: "First Name" },
  { key: "last_name",       label: "Last Name" },
  { key: "gender",          label: "Gender",         options: ["male","female","other","prefer_not"] },
  { key: "dob",             label: "Date of Birth",  type: "date" },
  { key: "email",           label: "Email",          type: "email" },
  { key: "mobile",          label: "Mobile" },
  { key: "blood_group",     label: "Blood Group",    options: ["A+","A-","B+","B-","AB+","AB-","O+","O-"] },
  { key: "emergency_name",  label: "Emergency Contact Name" },
  { key: "emergency_phone", label: "Emergency Phone" },
  { key: "company_name",    label: "Company Name" },
  { key: "employee_id",     label: "Employee ID" },
  { key: "tshirt_size",     label: "T-Shirt Size",   options: ["XS","S","M","L","XL","XXL","3XL","6Y","8Y","10Y","12Y","14Y"] },
  { key: "food_preference", label: "Food Preference", options: ["veg","non-veg","vegan"] },
  { key: "medical_conditions", label: "Medical Conditions", hint: "Relevant medical info for race day" },
  { key: "verification_status", label: "Verification Status", options: ["pending","verified","rejected","need_clarification"] },
];

function ParticipantEditModal({ participant, onSave, onClose }: {
  participant: Participant;
  onSave: (id: string, fields: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const { key } of EDITABLE_FIELDS) f[key as string] = String((participant[key] as string | null) ?? "");
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    const result = await onSave(participant.id, form);
    setSaving(false);
    if (result.ok) onClose();
    else setErr(result.error ?? "Save failed");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Edit Participant</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>{participant.first_name} {participant.last_name} · {participant.participant_type}</div>
          </div>
          <button type="button" onClick={onClose}
            style={{ padding: "4px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>

        {err && (
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {EDITABLE_FIELDS.map(({ key, label, type, hint, options }) => (
            <div key={key as string}>
              <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</label>
              {hint && <div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>{hint}</div>}
              {options ? (
                <select value={form[key as string] ?? ""} onChange={e => setForm(f => ({ ...f, [key as string]: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                  <option value="" style={{ background: "#1a1a1a" }}>(none)</option>
                  {options.map(o => <option key={o} value={o} style={{ background: "#1a1a1a" }}>{o}</option>)}
                </select>
              ) : (
                <input type={type ?? "text"} value={form[key as string] ?? ""}
                  onChange={e => setForm(f => ({ ...f, [key as string]: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "#555", marginTop: 16, lineHeight: 1.5 }}>
          BIB number, wave, and collection counter are managed by the BIB workflow and cannot be edited here.
          All changes are recorded in the audit log.
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="submit" disabled={saving}
            style={{ flex: 1, padding: "12px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" onClick={onClose}
            style={{ padding: "12px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Cancel confirmation modal ──────────────────────────────────────────────────

function CancelModal({ reg, reason, onReasonChange, onConfirm, onClose, saving }: {
  reg: Registration; reason: string; onReasonChange: (v: string) => void;
  onConfirm: () => void; onClose: () => void; saving: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#111", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 16, maxWidth: 480, width: "100%", padding: 28 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Cancel Registration</div>
        <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 16 }}>
          This is a soft cancel — no data is deleted. The registration record and all participant data are preserved.
        </div>
        {reg.payment_status === "paid" && (
          <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, fontSize: 13, color: "#f87171", marginBottom: 16, lineHeight: 1.6 }}>
            ⚠ This is a PAID registration (₹{reg.final_price.toLocaleString("en-IN")}).
            Cancelling does NOT automatically issue a refund. Handle any refund separately through Razorpay.
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Cancellation Reason</label>
          <textarea value={reason} rows={3} onChange={e => onReasonChange(e.target.value)}
            placeholder="Required — reason for cancellation"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button disabled={saving || !reason.trim()} onClick={onConfirm}
            style={{ flex: 1, padding: "12px", background: saving ? "rgba(239,68,68,0.3)" : "#ef4444", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: (saving || !reason.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Cancelling…" : "Confirm Cancellation"}
          </button>
          <button onClick={onClose}
            style={{ padding: "12px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Participant card ───────────────────────────────────────────────────────────

function ParticipantCard({ p, idx, onEdit }: {
  p: Participant; idx: number; onEdit: (p: Participant) => void;
}) {
  const [open, setOpen] = useState(false);
  const collected = p.it_run_bib_collections.length > 0;
  const checkedIn = p.it_run_checkins.length > 0;
  const vc = VER_COLOR[p.verification_status] ?? "#888";

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "inherit", fontFamily: "inherit" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#555", minWidth: 24 }}>P{idx + 1}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{p.first_name} {p.last_name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, color: "#888", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {p.participant_type}
          </span>
          <StatusChip label={p.verification_status.replace("_"," ")} color={vc} />
          {p.bib_number && <span style={{ fontSize: 12, fontWeight: 800, color: ACCENT }}>BIB {p.bib_number}</span>}
          {collected && <StatusChip label="BIB Collected" color={GREEN} />}
          {checkedIn  && <StatusChip label="Checked In" color="#60a5fa" />}
          {p.tshirt_size && <span style={{ fontSize: 11, color: "#666" }}>T: {p.tshirt_size}</span>}
          <span style={{ fontSize: 11, color: "#444", marginLeft: "auto" }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "14px 14px 14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px 16px", marginBottom: 14 }}>
            <KV label="Gender"        value={p.gender} />
            <KV label="Date of Birth" value={p.dob ? new Date(p.dob).toLocaleDateString("en-IN") : null} />
            <KV label="Mobile"        value={p.mobile} mono />
            <KV label="Email"         value={p.email} />
            <KV label="Blood Group"   value={p.blood_group} />
            <KV label="T-Shirt"       value={p.tshirt_size} />
            <KV label="Food Pref"     value={p.food_preference} />
            <KV label="Company"       value={p.company_name} />
            <KV label="Employee ID"   value={p.employee_id} mono />
            <KV label="Emergency"     value={p.emergency_name ? `${p.emergency_name} ${p.emergency_phone ?? ""}` : null} />
          </div>

          {(p.medical_conditions) && (
            <div style={{ marginBottom: 10 }}>
              <KV label="Medical Conditions" value={p.medical_conditions} />
            </div>
          )}

          {/* BIB / Check-in */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px 16px", marginBottom: 14 }}>
            <KV label="BIB Number" value={p.bib_number ?? "Not assigned"} mono />
            <KV label="Wave"       value={p.wave} />
            <KV label="BIB Collected" value={collected ? `${p.it_run_bib_collections[0]?.counter_name ?? "Yes"} · ${new Date(p.it_run_bib_collections[0]?.collected_at ?? "").toLocaleDateString("en-IN")}` : "No"} />
            <KV label="Checked In" value={checkedIn ? new Date(p.it_run_checkins[0].checked_in_at).toLocaleString("en-IN") : "No"} />
          </div>

          {/* Company ID photo */}
          {p.company_id_url && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Company ID Photo</div>
              <a href={p.company_id_url} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: ACCENT, fontWeight: 600, textDecoration: "none", padding: "5px 10px", background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 6 }}>
                View ID Photo →
              </a>
            </div>
          )}

          <button onClick={() => onEdit(p)}
            style={{ padding: "7px 16px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Edit Participant
          </button>
        </div>
      )}
    </div>
  );
}

// ── Registration detail ────────────────────────────────────────────────────────

function RegistrationDetail({ reg, onParticipantSave, onCancel, onNotesSave }: {
  reg: Registration;
  onParticipantSave: (id: string, fields: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  onCancel: (reg: Registration) => void;
  onNotesSave: (regId: string, notes: string) => Promise<void>;
}) {
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [notes, setNotes]   = useState(reg.admin_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCancelled = reg.registration_status === "cancelled";

  function handleNotesChange(v: string) {
    setNotes(v);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setSavingNotes(true);
      await onNotesSave(reg.id, v);
      setSavingNotes(false);
    }, 1500);
  }

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "16px 16px 16px" }}>
      {editingParticipant && (
        <ParticipantEditModal
          participant={editingParticipant}
          onSave={onParticipantSave}
          onClose={() => setEditingParticipant(null)}
        />
      )}

      {/* Registration fields */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px 16px", marginBottom: 16 }}>
        <KV label="Reg Code"    value={<span style={{ fontFamily: "monospace", color: ACCENT }}>{reg.registration_code}</span>} />
        <KV label="Category"    value={reg.it_run_categories?.name} />
        <KV label="Lead Email"  value={reg.lead_email} />
        <KV label="Participants" value={reg.participant_count} />
        <KV label="Base Price"  value={`₹${reg.base_price.toLocaleString("en-IN")}`} />
        <KV label="Discount"    value={reg.discount_amount > 0 ? `₹${reg.discount_amount.toLocaleString("en-IN")}` : "None"} />
        <KV label="Final Price" value={<span style={{ fontWeight: 700, color: GREEN }}>₹{reg.final_price.toLocaleString("en-IN")}</span>} />
        <KV label="Coupon"      value={reg.it_run_coupons?.code ?? "None"} mono />
        <KV label="Registered"  value={new Date(reg.created_at).toLocaleString("en-IN")} />
        <KV label="Updated"     value={new Date(reg.updated_at).toLocaleString("en-IN")} />
        {isCancelled && <KV label="Cancelled" value={reg.cancelled_at ? new Date(reg.cancelled_at).toLocaleString("en-IN") : "Yes"} />}
        {isCancelled && <KV label="Cancel Reason" value={reg.cancelled_reason} />}
      </div>

      {/* Participants */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Participants</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reg.it_run_participants.map((p, i) => (
            <ParticipantCard key={p.id} p={p} idx={i} onEdit={() => setEditingParticipant(p)} />
          ))}
          {reg.it_run_participants.length === 0 && (
            <div style={{ color: "#555", fontSize: 13 }}>No participant records</div>
          )}
        </div>
      </div>

      {/* Admin notes */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          Admin Notes {savingNotes && <span style={{ color: "#666", fontWeight: 400, textTransform: "none" }}>(saving…)</span>}
        </label>
        <textarea value={notes} rows={2} onChange={e => handleNotesChange(e.target.value)}
          placeholder="Internal notes — not visible to participants"
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#888", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
      </div>

      {/* Actions */}
      {!isCancelled ? (
        <button onClick={() => onCancel(reg)}
          style={{ padding: "7px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel Registration
        </button>
      ) : (
        <div style={{ fontSize: 12, color: "#555", fontStyle: "italic" }}>
          This registration is cancelled. To reactivate, contact a system administrator.
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RegistrationsPage() {
  const [regs,       setRegs]       = useState<Registration[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [msg,        setMsg]        = useState<{ text: string; ok: boolean } | null>(null);

  // Filters
  const [search,    setSearch]    = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [regStatus, setRegStatus] = useState("");
  const [catFilter, setCatFilter] = useState("");

  // Cancel modal state
  const [cancelReg,    setCancelReg]    = useState<Registration | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling,   setCancelling]   = useState(false);

  const LIMIT = 30;

  // Load categories for filter dropdown
  useEffect(() => {
    fetch("/api/it-run/admin/categories")
      .then(r => r.json())
      .then(d => setCategories((d.categories ?? []).map((c: Category & { id: string; name: string; color: string }) => ({ id: c.id, name: c.name, color: c.color }))));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (payStatus) params.set("payment_status", payStatus);
    if (regStatus) params.set("registration_status", regStatus);
    if (catFilter) params.set("category_id", catFilter);
    if (search)    params.set("search", search);
    fetch(`/api/it-run/admin/registrations?${params}`)
      .then(r => r.json())
      .then(d => { setRegs(d.data ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, payStatus, regStatus, catFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchInput(v: string) {
    setSearch(v);
    setPage(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }

  async function saveParticipant(participantId: string, fields: Record<string, unknown>) {
    const res = await fetch("/api/it-run/admin/participants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: participantId, ...fields }),
    });
    const d = await res.json();
    if (res.ok) {
      // Update local state
      setRegs(prev => prev.map(reg => ({
        ...reg,
        it_run_participants: reg.it_run_participants.map(p =>
          p.id === participantId ? { ...p, ...fields } as Participant : p
        ),
      })));
      setMsg({ text: "Participant updated", ok: true });
      return { ok: true };
    }
    return { ok: false, error: d.error };
  }

  function openCancelModal(reg: Registration) {
    setCancelReg(reg);
    setCancelReason("");
  }

  async function confirmCancel() {
    if (!cancelReg || !cancelReason.trim()) return;
    setCancelling(true);
    const res = await fetch("/api/it-run/admin/registrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: cancelReg.id,
        registration_status: "cancelled",
        cancelled_reason: cancelReason.trim(),
        confirm: true,
      }),
    });
    const d = await res.json();
    setCancelling(false);
    if (res.ok) {
      setRegs(prev => prev.map(r => r.id === cancelReg.id
        ? { ...r, registration_status: "cancelled", cancelled_reason: cancelReason.trim(), cancelled_at: new Date().toISOString() }
        : r
      ));
      setMsg({ text: `${cancelReg.registration_code} cancelled`, ok: false });
      setCancelReg(null);
    } else {
      setMsg({ text: d.error ?? "Cancel failed", ok: false });
    }
  }

  async function saveNotes(regId: string, notes: string) {
    await fetch("/api/it-run/admin/registrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: regId, admin_notes: notes }),
    });
    setRegs(prev => prev.map(r => r.id === regId ? { ...r, admin_notes: notes } : r));
  }

  const INPUT: React.CSSProperties = {
    padding: "9px 12px", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
    color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
  };

  return (
    <>
      {/* Cancel modal */}
      {cancelReg && (
        <CancelModal
          reg={cancelReg}
          reason={cancelReason}
          onReasonChange={setCancelReason}
          onConfirm={confirmCancel}
          onClose={() => setCancelReg(null)}
          saving={cancelling}
        />
      )}

      <div style={{ maxWidth: 1000 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Registrations</h1>
          <div style={{ fontSize: 13, color: "#888" }}>
            {total} registration{total !== 1 ? "s" : ""}
            {regStatus === "cancelled" ? " (showing cancelled)" : ""}
          </div>
        </div>

        {msg && (
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: msg.ok ? GREEN : "#f87171" }}>
            {msg.text}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            style={{ ...INPUT, flex: 2, minWidth: 200 }}
            placeholder="Search: code, email, name, mobile, company, employee ID…"
            value={search}
            onChange={e => handleSearchInput(e.target.value)}
          />
          <select style={INPUT} value={payStatus} onChange={e => { setPayStatus(e.target.value); setPage(0); }}>
            <option value="">All Payment</option>
            <option value="paid">Paid</option>
            <option value="free">Free</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select style={INPUT} value={regStatus} onChange={e => { setRegStatus(e.target.value); setPage(0); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select style={INPUT} value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0); }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <a href="/api/it-run/admin/reports?type=registrations" download
            style={{ padding: "9px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            Export CSV
          </a>
        </div>

        {/* Registration list */}
        {loading ? (
          <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {regs.map(reg => {
              const pc = PAY_COLOR[reg.payment_status] ?? "#888";
              const rc = REG_COLOR[reg.registration_status] ?? "#888";
              const isOpen = expanded === reg.id;
              const isCancelled = reg.registration_status === "cancelled";

              return (
                <div key={reg.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${isCancelled ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 12, overflow: "hidden",
                  opacity: isCancelled ? 0.7 : 1,
                }}>
                  {/* Summary row */}
                  <button onClick={() => setExpanded(isOpen ? null : reg.id)}
                    style={{ width: "100%", background: "none", border: "none", color: "inherit", fontFamily: "inherit", cursor: "pointer", padding: "14px 16px", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <code style={{ fontSize: 13, color: ACCENT, fontWeight: 700, letterSpacing: "0.04em", minWidth: 120 }}>
                        {reg.registration_code}
                      </code>
                      <StatusChip label={reg.payment_status} color={pc} />
                      {isCancelled && <StatusChip label="cancelled" color={rc} />}
                      <span style={{ fontSize: 12, color: reg.it_run_categories?.color ?? "#888", fontWeight: 600 }}>
                        {reg.it_run_categories?.name ?? "—"}
                      </span>
                      <span style={{ fontSize: 13, color: "#ccc", flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {reg.lead_email}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: GREEN, whiteSpace: "nowrap" }}>
                        ₹{reg.final_price.toLocaleString("en-IN")}
                      </span>
                      <span style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                        {new Date(reg.created_at).toLocaleDateString("en-IN")}
                      </span>
                      <span style={{ fontSize: 12, color: "#555" }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <RegistrationDetail
                      reg={reg}
                      onParticipantSave={saveParticipant}
                      onCancel={openCancelModal}
                      onNotesSave={saveNotes}
                    />
                  )}
                </div>
              );
            })}
            {regs.length === 0 && (
              <div style={{ color: "#888", padding: 40, textAlign: "center" }}>No registrations found</div>
            )}
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center", alignItems: "center" }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: page === 0 ? "#444" : "#ccc", cursor: page === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              ← Prev
            </button>
            <span style={{ fontSize: 13, color: "#666" }}>
              {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
            </span>
            <button disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)}
              style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: (page + 1) * LIMIT >= total ? "#444" : "#ccc", cursor: (page + 1) * LIMIT >= total ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
