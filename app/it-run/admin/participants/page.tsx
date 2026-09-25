"use client";

import { useState, useEffect, useCallback } from "react";

interface Participant {
  id: string; first_name: string; last_name: string; email: string | null;
  mobile: string; tshirt_size: string | null; dob: string | null;
  gender: string; blood_group: string | null;
  emergency_name: string | null; emergency_phone: string | null;
  company_name: string | null; employee_id: string | null;
  food_preference: string | null; medical_conditions: string | null;
  bib_number: string | null; wave: string | null;
  verification_status: string; participant_type: string;
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string; color: string } | null;
  };
  it_run_bib_collections: Array<{ id: string }>;
  it_run_checkins: Array<{ id: string; checked_in_at: string }>;
}

const ACCENT = "#e8620a";
const VERIFY_COLOR: Record<string, string> = {
  verified:           "#10b981",
  pending:            "#f59e0b",
  rejected:           "#ef4444",
  need_clarification: "#6366f1",
};

const EDITABLE_FIELDS: Array<{
  key: keyof Participant; label: string; type?: string; options?: string[]
}> = [
  { key: "first_name",         label: "First Name" },
  { key: "last_name",          label: "Last Name" },
  { key: "gender",             label: "Gender",          options: ["male","female","other","prefer_not"] },
  { key: "dob",                label: "Date of Birth",   type: "date" },
  { key: "email",              label: "Email",           type: "email" },
  { key: "mobile",             label: "Mobile" },
  { key: "blood_group",        label: "Blood Group",     options: ["A+","A-","B+","B-","AB+","AB-","O+","O-"] },
  { key: "emergency_name",     label: "Emergency Contact Name" },
  { key: "emergency_phone",    label: "Emergency Phone" },
  { key: "company_name",       label: "Company Name" },
  { key: "employee_id",        label: "Employee ID" },
  { key: "tshirt_size",        label: "T-Shirt Size",    options: ["XS","S","M","L","XL","XXL","3XL","6Y","8Y","10Y","12Y","14Y"] },
  { key: "food_preference",    label: "Food Preference", options: ["veg","non-veg","vegan"] },
  { key: "medical_conditions", label: "Medical Conditions" },
  { key: "verification_status", label: "Verification Status", options: ["pending","verified","rejected","need_clarification"] },
];

function EditModal({ participant, onClose, onSaved }: {
  participant: Participant;
  onClose: () => void;
  onSaved: (id: string, fields: Record<string, string>) => void;
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
    const res = await fetch("/api/it-run/admin/participants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: participant.id, ...form }),
    });
    const d = await res.json();
    setSaving(false);
    if (res.ok) { onSaved(participant.id, form); onClose(); }
    else setErr(d.error ?? "Save failed");
  }

  const INPUT_STYLE: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "9px 12px",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Edit Participant</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{participant.first_name} {participant.last_name} · {participant.participant_type}</div>
          </div>
          <button type="button" onClick={onClose}
            style={{ padding: "4px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>
        {err && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {EDITABLE_FIELDS.map(({ key, label, type, options }) => (
            <div key={key as string}>
              <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</label>
              {options ? (
                <select value={form[key as string] ?? ""} onChange={e => setForm(f => ({ ...f, [key as string]: e.target.value }))} style={INPUT_STYLE}>
                  <option value="" style={{ background: "#1a1a1a" }}>(none)</option>
                  {options.map(o => <option key={o} value={o} style={{ background: "#1a1a1a" }}>{o}</option>)}
                </select>
              ) : (
                <input type={type ?? "text"} value={form[key as string] ?? ""} onChange={e => setForm(f => ({ ...f, [key as string]: e.target.value }))} style={INPUT_STYLE} />
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 14 }}>BIB, wave, and collection counter are managed by the BIB workflow. All changes are audit-logged.</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="submit" disabled={saving}
            style={{ flex: 1, padding: 12, background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
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

export default function ParticipantsPage() {
  const [data,    setData]    = useState<Participant[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState("");
  const [editing, setEditing] = useState<Participant | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "40" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/it-run/admin/participants?${params}`);
      const d   = await res.json();
      setData(d.data ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(id: string, fields: Record<string, string>) {
    setData(prev => prev.map(p => p.id === id ? { ...p, ...fields } as Participant : p));
  }

  const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" };
  const INPUT: React.CSSProperties = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <>
    {editing && <EditModal participant={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>All Participants</h1>
          <div style={{ fontSize: 13, color: "#888" }}>{total} participant(s)</div>
        </div>
        <a href="/api/it-run/admin/reports?type=participants" download
          style={{ padding: "9px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          Export CSV
        </a>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...INPUT, flex: 1, minWidth: 180 }}
          placeholder="Search by name, email, mobile, or BIB..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select style={INPUT} value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All Verification</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="need_clarification">Clarification</option>
        </select>
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.map(p => {
              const cat       = p.it_run_registrations?.it_run_categories;
              const collected = p.it_run_bib_collections.length > 0;
              const checkedIn = p.it_run_checkins.length > 0;
              return (
                <div key={p.id} style={CARD}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
                    {/* BIB */}
                    <div style={{ width: 52, textAlign: "center" }}>
                      {p.bib_number ? (
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: ACCENT }}>{p.bib_number}</div>
                          {p.wave && <div style={{ fontSize: 9, color: "#888" }}>Wave {p.wave}</div>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: "#555" }}>No BIB</div>
                      )}
                    </div>
                    {/* Info */}
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{p.first_name} {p.last_name}</span>
                        <span style={{ fontSize: 11, color: cat?.color ?? "#888" }}>{cat?.name ?? "-"}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 4, color: VERIFY_COLOR[p.verification_status] ?? "#888", background: `${VERIFY_COLOR[p.verification_status] ?? "#888"}15` }}>
                          {p.verification_status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#888", display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>{p.email ?? p.mobile}</span>
                        {p.company_name && <span>{p.company_name}</span>}
                        {p.participant_type && p.participant_type !== "solo" && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                            color: p.participant_type === "child" ? "#a78bfa" : "#60a5fa",
                            background: p.participant_type === "child" ? "rgba(167,139,250,0.1)" : "rgba(96,165,250,0.1)" }}>
                            {p.participant_type.toUpperCase()}
                          </span>
                        )}
                        {p.tshirt_size && <span>T: {p.tshirt_size}</span>}
                        <span style={{ color: "#666" }}>{p.it_run_registrations?.registration_code}</span>
                      </div>
                    </div>
                    {/* Status badges + edit */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, alignItems: "flex-end" }}>
                      {collected && <span style={{ fontSize: 9, fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 4, padding: "2px 6px" }}>BIB Collected</span>}
                      {checkedIn && <span style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 4, padding: "2px 6px" }}>Checked In</span>}
                      <button onClick={() => setEditing(p)}
                        style={{ marginTop: 4, fontSize: 10, fontWeight: 600, padding: "3px 8px", background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 5, color: "#e8620a", cursor: "pointer", fontFamily: "inherit" }}>
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {data.length === 0 && <div style={{ color: "#888", textAlign: "center", padding: 40 }}>No participants found</div>}
          </div>

          {total > 40 && (
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Prev</button>
              <span style={{ padding: "7px 14px", fontSize: 13, color: "#888" }}>{page + 1} / {Math.ceil(total / 40)}</span>
              <button disabled={(page + 1) * 40 >= total} onClick={() => setPage(p => p + 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
