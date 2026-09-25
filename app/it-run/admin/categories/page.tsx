"use client";

import { useState, useEffect } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";

type Category = {
  id: string; name: string; slug: string; category_type: string;
  distance_km: number | null; price_rupees: number;
  early_bird_price: number | null; early_bird_ends_at: string | null;
  max_participants: number | null; current_participants: number;
  is_active: boolean; sort_order: number; color: string;
  description: string | null;
  includes_bib: boolean; includes_timing: boolean; includes_medal: boolean;
  includes_tshirt: boolean; includes_certificate: boolean;
};

const RACE_TYPE_LABELS: Record<string, string> = {
  solo: "Solo", duo: "Duo (2 runners)", kid: "Parent & Child",
};
const INCLUSIONS: Array<[keyof Category, string]> = [
  ["includes_bib",         "Race BIB"],
  ["includes_timing",      "Chip Timing"],
  ["includes_medal",       "Medal"],
  ["includes_tshirt",      "T-Shirt"],
  ["includes_certificate", "Certificate"],
];

function pct(cur: number, max: number | null) {
  if (!max) return null;
  return Math.min(100, Math.round((cur / max) * 100));
}

// ── Form field helpers ─────────────────────────────────────────────────────────

function FInput({ label, name, value, type = "text", onChange, hint, readOnly }: {
  label: string; name: string; value: string | number; type?: string;
  onChange?: (n: string, v: string | number) => void; hint?: string; readOnly?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: readOnly ? "#444" : "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
        {label}{readOnly && <span style={{ marginLeft: 6, fontSize: 10, color: "#333" }}>(locked)</span>}
      </label>
      {hint && <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{hint}</div>}
      <input
        name={name} value={String(value ?? "")} type={type} readOnly={readOnly}
        onChange={e => !readOnly && onChange?.(name, type === "number" ? Number(e.target.value) : e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", padding: "9px 12px",
          background: readOnly ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${readOnly ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 8, color: readOnly ? "#444" : "#fff", fontSize: 13,
          fontFamily: "inherit", outline: "none",
        }}
      />
    </div>
  );
}

function FTextarea({ label, name, value, onChange, hint, rows = 3 }: {
  label: string; name: string; value: string;
  onChange: (n: string, v: string) => void; hint?: string; rows?: number;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{hint}</div>}
      <textarea
        name={name} value={value ?? ""} rows={rows}
        onChange={e => onChange(name, e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.5 }}
      />
    </div>
  );
}

function FCheck({ label, name, checked, onChange }: {
  label: string; name: string; checked: boolean; onChange: (n: string, v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(name, e.target.checked)}
        style={{ width: 14, height: 14, accentColor: ACCENT }} />
      <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
    </label>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

// ── Confirmation modal ─────────────────────────────────────────────────────────

type ConfirmField = { field: string; label: string; oldVal: string; newVal: string; note?: string };

function ConfirmModal({ fields, onConfirm, onCancel }: {
  fields: ConfirmField[]; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111", border: "1px solid rgba(232,98,10,0.4)", borderRadius: 16, maxWidth: 480, width: "100%", padding: 28 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Confirm Pricing / Capacity Change</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>
          These changes affect live registrations. Existing paid registrations are never recalculated.
        </div>
        {fields.map(f => (
          <div key={f.field} style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{f.label}</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "#888", fontFamily: "monospace" }}>{f.oldVal || "(none)"}</span>
              <span style={{ color: "#555" }}>→</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>{f.newVal || "(none)"}</span>
            </div>
            {f.note && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{f.note}</div>}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Yes, Save Changes
          </button>
          <button onClick={onCancel} style={{ padding: "12px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type FormState = Record<string, string | number | boolean>;

export default function CategoriesPage() {
  const [cats,    setCats]    = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form,    setForm]    = useState<FormState>({});
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean; catId?: string } | null>(null);
  const [confirmFields, setConfirmFields] = useState<ConfirmField[] | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/it-run/admin/categories")
      .then(r => r.json())
      .then(d => setCats(d.categories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function startEdit(cat: Category) {
    setEditing(cat);
    setForm({ ...cat } as unknown as FormState);
    setMsg(null);
    setConfirmFields(null);
  }

  function upd(key: string, val: string | number | boolean) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function doSave(withConfirm: boolean) {
    if (!editing) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = { ...form, id: editing.id };
      if (withConfirm) payload.confirm = true;

      const res = await fetch("/api/it-run/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();

      if (res.status === 409 && d.needsConfirm) {
        const fields: ConfirmField[] = (d.criticalFields as string[]).map((f: string) => {
          const details = d.details?.[f];
          if (f === "price_rupees") {
            return {
              field: f, label: "Price",
              oldVal: `₹${Number(details?.old).toLocaleString("en-IN")}`,
              newVal: `₹${Number(details?.new).toLocaleString("en-IN")}`,
              note:   "Existing paid registrations keep their original price. This change applies to new registrations only.",
            };
          }
          if (f === "max_participants") {
            return {
              field: f, label: "Maximum Capacity",
              oldVal: details?.old == null ? "Unlimited" : String(details.old),
              newVal: details?.new == null ? "Unlimited" : String(details.new),
              note:   `Current registrations: ${editing.current_participants}. New capacity must be ≥ this.`,
            };
          }
          return { field: f, label: f, oldVal: String(details?.old ?? ""), newVal: String(details?.new ?? "") };
        });
        setConfirmFields(fields);
        setPendingConfirm(true);
        return;
      }

      if (!res.ok) {
        setMsg({ text: d.error ?? "Save failed", ok: false });
        return;
      }

      // Update local state
      setCats(prev => prev.map(c => c.id === editing.id ? { ...c, ...form } as unknown as Category : c));
      setEditing(null);
      setConfirmFields(null);
      setMsg({ text: `"${editing.name}" updated`, ok: true, catId: editing.id });
    } finally {
      setSaving(false);
      setPendingConfirm(false);
    }
  }

  async function quickToggle(cat: Category) {
    const res = await fetch("/api/it-run/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cat.id, is_active: !cat.is_active }),
    });
    if (res.ok) {
      setCats(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !cat.is_active } : c));
      setMsg({ text: `"${cat.name}" ${!cat.is_active ? "activated" : "deactivated"}`, ok: true, catId: cat.id });
    }
  }

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>;

  const f = form;

  return (
    <>
      {/* Confirm modal */}
      {confirmFields && (
        <ConfirmModal
          fields={confirmFields}
          onConfirm={() => { setConfirmFields(null); doSave(true); }}
          onCancel={() => { setConfirmFields(null); setSaving(false); setPendingConfirm(false); }}
        />
      )}

      <div style={{ maxWidth: 920 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Categories · Pricing · Capacity</h1>
          <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>
            Slug and race type are locked — they anchor registration records and public URLs.
            Price changes never affect existing paid registrations.
          </p>
        </div>

        {msg && !editing && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: msg.ok ? GREEN : "#f87171" }}>
            {msg.text}
          </div>
        )}

        {/* Category cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cats.map(cat => {
            const fill = pct(cat.current_participants, cat.max_participants);
            const fillColor = fill === null ? GREEN : fill > 90 ? "#ef4444" : fill > 70 ? "#f59e0b" : GREEN;
            return (
              <div key={cat.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${cat.is_active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`, borderRadius: 14, overflow: "hidden", opacity: cat.is_active ? 1 : 0.6 }}>
                <div style={{ height: 3, background: cat.is_active ? (cat.color ?? ACCENT) : "#333" }} />
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>

                    {/* Left — info */}
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{cat.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `${cat.color ?? ACCENT}18`, border: `1px solid ${cat.color ?? ACCENT}30`, color: cat.color ?? ACCENT, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {RACE_TYPE_LABELS[cat.category_type] ?? cat.category_type}
                        </span>
                        {!cat.is_active && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                            INACTIVE
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>{cat.slug}</span>
                      </div>

                      {/* Price + capacity row */}
                      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: cat.color ?? ACCENT }}>
                          ₹{cat.price_rupees.toLocaleString("en-IN")}
                        </span>
                        {cat.early_bird_price && (
                          <span style={{ fontSize: 12, color: "#f59e0b" }}>
                            Early bird ₹{cat.early_bird_price.toLocaleString("en-IN")}
                          </span>
                        )}
                        <span style={{ fontSize: 13, color: "#888" }}>
                          <strong style={{ color: fill !== null && fill > 90 ? "#ef4444" : "#ccc" }}>{cat.current_participants}</strong>
                          {cat.max_participants ? <span style={{ color: "#555" }}>/{cat.max_participants}</span> : <span style={{ color: "#555" }}> registered (no limit)</span>}
                        </span>
                        {cat.distance_km && (
                          <span style={{ fontSize: 12, color: "#666" }}>{cat.distance_km} KM</span>
                        )}
                        <span style={{ fontSize: 12, color: "#555" }}>Order {cat.sort_order}</span>
                      </div>

                      {/* Capacity bar */}
                      {fill !== null && (
                        <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, maxWidth: 300, marginBottom: 10 }}>
                          <div style={{ height: "100%", width: `${fill}%`, background: fillColor, borderRadius: 3, transition: "width 0.3s" }} />
                        </div>
                      )}

                      {/* Inclusions */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {INCLUSIONS.map(([key, lbl]) => {
                          const on = cat[key] as boolean;
                          return (
                            <span key={key} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5,
                              background: on ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)",
                              color: on ? GREEN : "#444",
                              border: `1px solid ${on ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.05)"}` }}>
                              {on ? "✓" : "✗"} {lbl}
                            </span>
                          );
                        })}
                      </div>

                      {cat.description && (
                        <div style={{ fontSize: 12, color: "#555", marginTop: 8, lineHeight: 1.5 }}>{cat.description}</div>
                      )}
                    </div>

                    {/* Right — actions */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                      <button onClick={() => startEdit(cat)}
                        style={{ padding: "8px 18px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        Edit
                      </button>
                      <button onClick={() => quickToggle(cat)}
                        style={{ padding: "6px 12px", background: cat.is_active ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${cat.is_active ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`, borderRadius: 8, color: cat.is_active ? "#f87171" : GREEN, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {cat.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Edit modal */}
        {editing && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", padding: 28 }}>

              {/* Modal header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Edit Category</div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>{editing.name}</div>
                </div>
                <button onClick={() => { setEditing(null); setMsg(null); }}
                  style={{ padding: "4px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>
                  ✕
                </button>
              </div>

              {msg?.ok === false && (
                <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  {msg.text}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

                {/* Identity — locked fields */}
                <ModalSection title="Identity (Locked)">
                  <TwoCol>
                    <FInput label="Slug"       name="slug"          value={editing.slug}          readOnly />
                    <FInput label="Race Type"  name="category_type" value={RACE_TYPE_LABELS[editing.category_type] ?? editing.category_type} readOnly hint="Determines participant count" />
                  </TwoCol>
                  <div style={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>
                    Slug and race type are permanently locked. They anchor every registration record in the database.
                    Changing them would break existing participants' QR codes, dashboard links, and BIB assignments.
                  </div>
                </ModalSection>

                {/* Basic */}
                <ModalSection title="Basic Info">
                  <FInput label="Category Name" name="name"        value={String(f.name ?? "")} onChange={upd} />
                  <TwoCol>
                    <FInput label="Distance (km)" name="distance_km" value={String(f.distance_km ?? "")} type="number" onChange={upd} />
                    <FInput label="Accent Color"  name="color"       value={String(f.color ?? "")}        onChange={upd} hint="Hex — e.g. #e8620a" />
                  </TwoCol>
                  <FTextarea label="Description" name="description" value={String(f.description ?? "")} onChange={upd} hint="Shown on the registration page" />
                </ModalSection>

                {/* Pricing */}
                <ModalSection title="Pricing">
                  <div style={{ padding: "10px 12px", background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 8, fontSize: 12, color: "#888", lineHeight: 1.5 }}>
                    Price changes apply to new registrations only.
                    All <strong style={{ color: "#ccc" }}>{editing.current_participants}</strong> existing paid registration{editing.current_participants !== 1 ? "s" : ""} keep their original price.
                  </div>
                  <TwoCol>
                    <FInput label="Price (₹)"            name="price_rupees"    value={Number(f.price_rupees ?? 0)}    type="number" onChange={upd} />
                    <FInput label="Early Bird Price (₹)"  name="early_bird_price" value={String(f.early_bird_price ?? "")} type="number" onChange={upd} hint="Leave empty to disable" />
                  </TwoCol>
                  <FInput label="Early Bird Ends At" name="early_bird_ends_at" value={String(f.early_bird_ends_at ?? "")} type="datetime-local" onChange={upd} />
                </ModalSection>

                {/* Capacity */}
                <ModalSection title="Capacity">
                  <TwoCol>
                    <FInput label="Maximum Participants" name="max_participants"   value={String(f.max_participants ?? "")} type="number" onChange={upd} hint="Leave empty for no limit" />
                    <FInput label="Current Registrations" name="current_participants" value={String(editing.current_participants)} readOnly hint="Auto-updated by system" />
                  </TwoCol>
                  {editing.current_participants > 0 && (
                    <div style={{ fontSize: 11, color: "#666" }}>
                      Capacity cannot be reduced below {editing.current_participants} (current registrations).
                    </div>
                  )}
                </ModalSection>

                {/* Display */}
                <ModalSection title="Display">
                  <TwoCol>
                    <FInput label="Sort Order" name="sort_order" value={Number(f.sort_order ?? 0)} type="number" onChange={upd} hint="Lower = appears first" />
                    <div />
                  </TwoCol>
                </ModalSection>

                {/* Inclusions */}
                <ModalSection title="Inclusions">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {INCLUSIONS.map(([key, lbl]) => (
                      <FCheck key={key} label={lbl} name={key} checked={!!f[key]} onChange={upd} />
                    ))}
                  </div>
                </ModalSection>

                {/* Status */}
                <ModalSection title="Status">
                  <FCheck label="Category is Active (visible to registrants)" name="is_active" checked={!!f.is_active} onChange={upd} />
                </ModalSection>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  onClick={() => doSave(false)}
                  disabled={saving || pendingConfirm}
                  style={{ flex: 1, padding: "12px", background: (saving || pendingConfirm) ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: (saving || pendingConfirm) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(null); setMsg(null); setConfirmFields(null); }}
                  style={{ padding: "12px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
