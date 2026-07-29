"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Condition {
  field_key: string;
  operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value: string;
}

interface FormField {
  id: string;
  field_key: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  required: boolean;
  options: string[];
  display_order: number;
  is_active: boolean;
  is_hidden: boolean;
  is_readonly: boolean;
  conditions: Condition[];
  default_value: string | null;
  max_length: number | null;
  min_length: number | null;
  validation_pattern: string | null;
  validation_rules: Record<string, unknown>;
  editable_after_reg: boolean;
  section: string | null;
  race_ids: string[];
  created_at: string;
}

interface Race { id: string; name: string; distance: string; }

// ── Field type catalogue ───────────────────────────────────────────────────────

interface FieldTypeEntry { type: string; label: string; icon: string; hint?: string; }
interface FieldCategory  { title: string; items: FieldTypeEntry[]; }

const FIELD_CATEGORIES: FieldCategory[] = [
  {
    title: "Basic",
    items: [
      { type: "text",     label: "Short Text",    icon: "📝", hint: "Single-line text" },
      { type: "textarea", label: "Long Text",      icon: "📄", hint: "Multi-line text area" },
      { type: "number",   label: "Number",         icon: "#️⃣", hint: "Integer value" },
      { type: "decimal",  label: "Decimal",        icon: "🔢", hint: "Number with decimal places" },
      { type: "email",    label: "Email",          icon: "✉️", hint: "Email address" },
      { type: "phone",    label: "Phone",          icon: "📱", hint: "Phone number" },
      { type: "url",      label: "URL / Website",  icon: "🔗", hint: "Web address" },
    ],
  },
  {
    title: "Selection",
    items: [
      { type: "select",       label: "Dropdown",       icon: "▾", hint: "Pick one from a list" },
      { type: "radio",        label: "Radio Buttons",  icon: "🔘", hint: "Visible option list, pick one" },
      { type: "multi_select", label: "Multi-Select",   icon: "☑️", hint: "Pick one or more options" },
      { type: "checkbox",     label: "Checkbox",       icon: "✅", hint: "Single yes/no checkbox" },
      { type: "yes_no",       label: "Yes / No",       icon: "🔀", hint: "Toggle between Yes and No" },
      { type: "rating",       label: "Rating (1–5)",   icon: "⭐", hint: "Star rating" },
    ],
  },
  {
    title: "Date & Time",
    items: [
      { type: "date",     label: "Date",       icon: "📅" },
      { type: "time",     label: "Time",       icon: "⏰" },
      { type: "datetime", label: "Date & Time", icon: "🗓️" },
    ],
  },
  {
    title: "Files & Media",
    items: [
      { type: "file",         label: "File Upload",  icon: "📎", hint: "Any file type" },
      { type: "image_upload", label: "Image Upload", icon: "🖼️", hint: "Images only" },
    ],
  },
  {
    title: "Contact & Location",
    items: [
      { type: "address", label: "Address",   icon: "🏠", hint: "Full address text" },
      { type: "country", label: "Country",   icon: "🌍" },
      { type: "state",   label: "State / Region", icon: "📍" },
      { type: "pincode", label: "PIN Code",  icon: "🔢", hint: "6-digit postal code" },
    ],
  },
  {
    title: "Documents",
    items: [
      { type: "waiver",    label: "Waiver / Consent", icon: "📜", hint: "Show text, ask for acceptance" },
      { type: "signature", label: "Signature",         icon: "✍️", hint: "Type-to-sign field" },
    ],
  },
  {
    title: "Layout",
    items: [
      { type: "section_heading", label: "Section Heading", icon: "📌", hint: "Visual divider with heading" },
    ],
  },
];

interface TemplateEntry {
  key: string;
  label: string;
  icon: string;
  hint: string;
  fields: Array<Partial<FormField> & { label: string; field_type: string }>;
}

const TEMPLATES: TemplateEntry[] = [
  {
    key: "gender",
    label: "Gender",
    icon: "🧬",
    hint: "Male / Female / Other",
    fields: [{ label: "Gender", field_type: "select", field_key: "gender", required: true, options: ["Male", "Female", "Non-binary", "Prefer not to say"] }],
  },
  {
    key: "dob",
    label: "Date of Birth",
    icon: "🎂",
    hint: "Date picker",
    fields: [{ label: "Date of Birth", field_type: "date", field_key: "date_of_birth", required: true }],
  },
  {
    key: "blood_group",
    label: "Blood Group",
    icon: "🩸",
    hint: "A+, A-, B+, B-, AB+, AB-, O+, O-",
    fields: [{ label: "Blood Group", field_type: "select", field_key: "blood_group", required: true, options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] }],
  },
  {
    key: "tshirt",
    label: "T-Shirt Size",
    icon: "👕",
    hint: "XS to XXXL",
    fields: [{ label: "T-Shirt Size", field_type: "select", field_key: "tshirt_size", required: true, options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] }],
  },
  {
    key: "emergency",
    label: "Emergency Contact",
    icon: "🚨",
    hint: "Name + Phone number",
    fields: [
      { label: "Emergency Contact Name",  field_type: "text",  field_key: "emergency_contact_name",  required: true,  placeholder: "Full name of emergency contact" },
      { label: "Emergency Contact Phone", field_type: "phone", field_key: "emergency_contact_phone", required: true,  placeholder: "10-digit mobile number" },
    ],
  },
  {
    key: "notes",
    label: "Notes / Special Requests",
    icon: "📝",
    hint: "Medical conditions, dietary needs",
    fields: [{ label: "Notes / Special Requests", field_type: "textarea", field_key: "notes", required: false, placeholder: "Medical conditions, dietary needs, or any other information. Enter NA if none." }],
  },
];

const HAS_OPTIONS = new Set(["select", "radio", "multi_select"]);
const NO_INPUT    = new Set(["section_heading"]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/, "").slice(0, 40);
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  input: {
    width: "100%", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "#fff", padding: "7px 10px", fontSize: 13,
    fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none",
  },
  label: {
    fontSize: 10, color: "#666", display: "block" as const, marginBottom: 4,
    textTransform: "uppercase" as const, fontWeight: 700, letterSpacing: ".05em",
  },
  row: { display: "flex" as const, alignItems: "center" as const, gap: 6, cursor: "pointer", fontSize: 12, color: "#aaa" },
};

// ── Main component ─────────────────────────────────────────────────────────────

export function EventFormBuilder({ eventId, races }: { eventId: string | null; races: Race[] }) {
  const [fields,        setFields]        = useState<FormField[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [loadErr,       setLoadErr]       = useState("");
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [showPicker,    setShowPicker]    = useState(false);
  const [showPreview,   setShowPreview]   = useState(false);
  const [saving,        setSaving]        = useState<string | null>(null);
  const [dragFrom,      setDragFrom]      = useState(-1);
  const [dragOver,      setDragOver]      = useState(-1);

  const editingField = fields.find(f => f.id === editingId) ?? null;

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true); setLoadErr("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/form-fields`);
      const data = await res.json();
      if (!res.ok) { setLoadErr(data.error ?? "Failed to load fields"); return; }
      setFields(data.fields ?? []);
    } catch { setLoadErr("Network error"); }
    finally   { setLoading(false); }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function createField(body: Record<string, unknown>) {
    if (!eventId) return;
    const res  = await fetch(`/api/admin/events/${eventId}/form-fields`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setFields(fs => [...fs, data.field as FormField]);
      setEditingId(data.field.id);
    }
    return data;
  }

  async function updateField(id: string, patch: Record<string, unknown>) {
    if (!eventId) return;
    setSaving(id);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/form-fields`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (res.ok) setFields(fs => fs.map(f => f.id === id ? (data.field as FormField) : f));
      return data;
    } finally { setSaving(null); }
  }

  async function deleteField(id: string) {
    if (!eventId || !window.confirm("Delete this field?")) return;
    await fetch(`/api/admin/events/${eventId}/form-fields`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setFields(fs => fs.filter(f => f.id !== id));
    if (editingId === id) setEditingId(null);
  }

  async function duplicateField(f: FormField) {
    const { id: _id, created_at: _ca, display_order: _do, ...rest } = f;
    void _id; void _ca; void _do;
    await createField({ ...rest, label: f.label + " (copy)" });
  }

  async function reorder(from: number, to: number) {
    if (!eventId || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setFields(next);
    await fetch(`/api/admin/events/${eventId}/form-fields/reorder`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map(f => f.id) }),
    });
  }

  async function handleSelectType(type: string) {
    setShowPicker(false);
    await createField({ label: FIELD_CATEGORIES.flatMap(c => c.items).find(t => t.type === type)?.label ?? type, field_type: type });
  }

  async function handleSelectTemplate(tpl: TemplateEntry) {
    setShowPicker(false);
    let lastId: string | null = null;
    for (const f of tpl.fields) {
      const res = await createField({ ...f });
      if (res?.field?.id) lastId = res.field.id;
    }
    if (lastId) setEditingId(lastId);
  }

  if (!eventId) {
    return (
      <div style={{ padding: "28px 20px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", textAlign: "center" as const }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>Save the event first to configure registration fields</div>
        <div style={{ fontSize: 11, color: "#333" }}>Fill in the basic details above and save a draft first.</div>
      </div>
    );
  }

  const activeCount = fields.filter(f => f.is_active && !f.is_hidden).length;

  return (
    <div style={{ position: "relative" as const }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" as const, gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd" }}>
            {fields.length === 0 ? "No fields yet" : `${activeCount} active field${activeCount !== 1 ? "s" : ""}`}
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Drag rows to reorder · Click a field to edit its settings</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {fields.length > 0 && (
            <button type="button" onClick={() => setShowPreview(v => !v)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: showPreview ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)", color: showPreview ? "#818cf8" : "#aaa", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              {showPreview ? "Hide Preview" : "Live Preview"}
            </button>
          )}
          <button type="button" onClick={() => setShowPicker(true)}
            style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(232,98,10,0.4)", background: "rgba(232,98,10,0.1)", color: "#e8620a", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700 }}>
            + Add Field
          </button>
        </div>
      </div>

      {loadErr && <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 13, marginBottom: 12 }}>{loadErr}</div>}

      {loading && <div style={{ fontSize: 12, color: "#444", padding: "16px 0", textAlign: "center" as const }}>Loading fields…</div>}

      {/* Desktop two-column / mobile single-column layout */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" as const }}>

        {/* Field list */}
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          {!loading && fields.length === 0 ? (
            <div style={{ padding: "3rem 2rem", borderRadius: 12, background: "#111", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" as const, color: "#555" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>No fields added yet</div>
              <div style={{ fontSize: 11 }}>Click "+ Add Field" to start building the registration form.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {fields.map((f, i) => {
                const isEditing = editingId === f.id;
                const isSaving  = saving === f.id;
                const scopeLabel = (f.race_ids ?? []).length > 0
                  ? races.filter(r => (f.race_ids ?? []).includes(r.id)).map(r => r.name || r.distance).join(", ")
                  : null;
                const typeEntry = FIELD_CATEGORIES.flatMap(c => c.items).find(t => t.type === f.field_type);
                const icon = typeEntry?.icon ?? "📝";

                return (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                    onDrop={() => { if (dragFrom >= 0 && dragFrom !== i) void reorder(dragFrom, i); setDragFrom(-1); setDragOver(-1); }}
                    onDragEnd={() => { setDragFrom(-1); setDragOver(-1); }}
                    style={{
                      background: "#111",
                      border: `1px solid ${isEditing ? "rgba(232,98,10,0.4)" : dragOver === i ? "rgba(232,98,10,0.25)" : f.is_active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)"}`,
                      borderRadius: 10,
                      padding: "9px 12px",
                      cursor: "grab",
                      opacity: isSaving ? 0.6 : f.is_active ? 1 : 0.45,
                      transition: "border-color .15s, opacity .15s",
                      userSelect: "none" as const,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <span style={{ color: "#333", fontSize: 15, flexShrink: 0 }}>⋮⋮</span>
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" as const }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: isEditing ? "#e8620a" : "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.label}</span>
                          {f.required && !NO_INPUT.has(f.field_type) && <span style={{ fontSize: 9, color: "#f87171", fontWeight: 700, flexShrink: 0 }}>REQ</span>}
                          {f.is_hidden  && <span style={{ fontSize: 9, color: "#818cf8", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 3, padding: "1px 4px", fontWeight: 700, flexShrink: 0 }}>HIDDEN</span>}
                          {!f.is_active && <span style={{ fontSize: 9, color: "#555", fontWeight: 700, flexShrink: 0 }}>DISABLED</span>}
                        </div>
                        <div style={{ fontSize: 10, color: "#444", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          <span style={{ color: "#666" }}>{f.field_type}</span>
                          {f.section && <span> · §{f.section}</span>}
                          {scopeLabel && <span style={{ color: "#6366f1" }}> · 🎯 {scopeLabel}</span>}
                          {f.conditions.length > 0 && <span style={{ color: "#f59e0b" }}> · ⚡ {f.conditions.length} condition{f.conditions.length !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button type="button" onClick={() => setEditingId(isEditing ? null : f.id)}
                          style={{ padding: "3px 8px", background: isEditing ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid ${isEditing ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 5, color: isEditing ? "#e8620a" : "#888", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                          {isEditing ? "Done" : "Edit"}
                        </button>
                        <button type="button" onClick={async () => { await updateField(f.id, { is_active: !f.is_active }); }}
                          style={{ padding: "3px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                          {f.is_active ? "Off" : "On"}
                        </button>
                        <button type="button" onClick={() => void duplicateField(f)}
                          style={{ padding: "3px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                          Copy
                        </button>
                        <button type="button" onClick={() => void deleteField(f.id)}
                          style={{ padding: "3px 8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                          Del
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add field row */}
              <button type="button" onClick={() => setShowPicker(true)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "transparent", color: "#555", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                + Add Field
              </button>
            </div>
          )}
        </div>

        {/* Field editor panel (desktop: right column; mobile: below) */}
        {editingField && (
          <div style={{ flex: "1 1 360px", minWidth: 0, maxWidth: 520 }}>
            <FieldEditor
              field={editingField}
              allFields={fields}
              races={races}
              onSave={async (patch) => { await updateField(editingField.id, patch); }}
              onClose={() => setEditingId(null)}
            />
          </div>
        )}
      </div>

      {/* Live preview */}
      {showPreview && fields.length > 0 && (
        <div style={{ marginTop: 24, background: "#0d0d10", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 12, padding: "1.5rem" }}>
          <div style={{ fontSize: 10, color: "#e8620a", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 16 }}>Registration Form Preview</div>
          <FormPreview fields={fields.filter(f => f.is_active)} />
        </div>
      )}

      {/* Type picker modal */}
      {showPicker && (
        <TypePicker
          onSelectType={handleSelectType}
          onSelectTemplate={handleSelectTemplate}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ── Field Editor ──────────────────────────────────────────────────────────────

interface EditorState {
  label: string;
  placeholder: string;
  help_text: string;
  required: boolean;
  is_hidden: boolean;
  is_readonly: boolean;
  editable_after_reg: boolean;
  section: string;
  default_value: string;
  max_length: string;
  min_length: string;
  validation_pattern: string;
  race_ids: string[];
  options: string[];
  conditions: Condition[];
}

function fieldToEditor(f: FormField): EditorState {
  return {
    label:              f.label,
    placeholder:        f.placeholder        ?? "",
    help_text:          f.help_text          ?? "",
    required:           f.required,
    is_hidden:          f.is_hidden,
    is_readonly:        f.is_readonly,
    editable_after_reg: f.editable_after_reg,
    section:            f.section            ?? "",
    default_value:      f.default_value      ?? "",
    max_length:         f.max_length != null  ? String(f.max_length) : "",
    min_length:         f.min_length != null  ? String(f.min_length) : "",
    validation_pattern: f.validation_pattern  ?? "",
    race_ids:           f.race_ids            ?? [],
    options:            f.options             ?? [],
    conditions:         (f.conditions         ?? []).map(c => ({ ...c })),
  };
}

type EditorTab = "settings" | "options" | "conditions" | "advanced";

function FieldEditor({ field, allFields, races, onSave, onClose }: {
  field:     FormField;
  allFields: FormField[];
  races:     Race[];
  onSave:    (patch: Record<string, unknown>) => Promise<void>;
  onClose:   () => void;
}) {
  const [tab,     setTab]     = useState<EditorTab>("settings");
  const [vals,    setVals]    = useState<EditorState>(() => fieldToEditor(field));
  const [saving,  setSaving]  = useState(false);
  const [newOpt,  setNewOpt]  = useState("");
  const optInputRef = useRef<HTMLInputElement>(null);

  // Reset when field changes
  useEffect(() => { setVals(fieldToEditor(field)); setTab("settings"); }, [field.id]);

  function set<K extends keyof EditorState>(k: K, v: EditorState[K]) {
    setVals(prev => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        label:              vals.label.trim() || field.label,
        placeholder:        vals.placeholder.trim()        || null,
        help_text:          vals.help_text.trim()          || null,
        required:           vals.required,
        is_hidden:          vals.is_hidden,
        is_readonly:        vals.is_readonly,
        editable_after_reg: vals.editable_after_reg,
        section:            vals.section.trim()            || null,
        default_value:      vals.default_value.trim()      || null,
        max_length:         vals.max_length  ? Number(vals.max_length)  : null,
        min_length:         vals.min_length  ? Number(vals.min_length)  : null,
        validation_pattern: vals.validation_pattern.trim() || null,
        race_ids:           vals.race_ids,
        options:            vals.options.map(o => o.trim()).filter(Boolean),
        conditions:         vals.conditions,
      };
      await onSave(patch);
    } finally { setSaving(false); }
  }

  function addOption() {
    const v = newOpt.trim();
    if (!v) return;
    set("options", [...vals.options, v]);
    setNewOpt("");
    setTimeout(() => optInputRef.current?.focus(), 50);
  }

  function removeOption(i: number) { set("options", vals.options.filter((_, idx) => idx !== i)); }
  function moveOption(i: number, d: -1 | 1) {
    const next = [...vals.options];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set("options", next);
  }

  function addCondition() {
    set("conditions", [...vals.conditions, { field_key: "", operator: "equals", value: "" }]);
  }
  function updateCondition(i: number, patch: Partial<Condition>) {
    set("conditions", vals.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }
  function removeCondition(i: number) { set("conditions", vals.conditions.filter((_, idx) => idx !== i)); }

  const showOptions   = HAS_OPTIONS.has(field.field_type);
  const showNoInput   = NO_INPUT.has(field.field_type);
  const otherFields   = allFields.filter(f => f.id !== field.id && !NO_INPUT.has(f.field_type));
  const raceOptions   = races.filter(r => r.name.trim() || r.distance.trim());

  const tabBtn = (t: EditorTab, label: string, badge?: number) => (
    <button type="button" onClick={() => setTab(t)}
      style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: tab === t ? "rgba(232,98,10,0.15)" : "transparent", color: tab === t ? "#e8620a" : "#666", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: tab === t ? 700 : 400 }}>
      {label}{badge != null && badge > 0 ? ` (${badge})` : ""}
    </button>
  );

  return (
    <div style={{ background: "#111", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 12, overflow: "hidden" }}>
      {/* Editor header */}
      <div style={{ padding: "10px 14px", background: "rgba(232,98,10,0.06)", borderBottom: "1px solid rgba(232,98,10,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em" }}>
          Editing: {field.label}
        </div>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, lineHeight: 1, fontFamily: "inherit" }}>×</button>
      </div>

      {/* Tabs */}
      <div style={{ padding: "8px 10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 2 }}>
        {tabBtn("settings",   "Settings")}
        {showOptions && tabBtn("options", "Options", vals.options.length)}
        {!showNoInput && tabBtn("conditions", "Conditions", vals.conditions.length)}
        {tabBtn("advanced", "Advanced")}
      </div>

      <div style={{ padding: "14px 14px 0" }}>

        {/* ── SETTINGS TAB ─────────────────────────────── */}
        {tab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
            <div>
              <label style={S.label}>Label *</label>
              <input style={S.input} value={vals.label} onChange={e => set("label", e.target.value)} />
            </div>
            {!showNoInput && (
              <>
                <div>
                  <label style={S.label}>Placeholder Text</label>
                  <input style={S.input} value={vals.placeholder} onChange={e => set("placeholder", e.target.value)} placeholder="Hint shown inside the empty field" />
                </div>
                <div>
                  <label style={S.label}>Help Text</label>
                  <input style={S.input} value={vals.help_text} onChange={e => set("help_text", e.target.value)} placeholder="Additional instructions shown below the field" />
                </div>
              </>
            )}
            {!showNoInput && (
              <div>
                <label style={S.label}>Section Heading</label>
                <input style={S.input} value={vals.section} onChange={e => set("section", e.target.value)} placeholder="Groups this field under a heading, e.g. Medical Info" />
              </div>
            )}
            {!showNoInput && (
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 16 }}>
                <label style={S.row}>
                  <input type="checkbox" checked={vals.required} onChange={e => set("required", e.target.checked)} style={{ accentColor: "#e8620a" }} />
                  Required
                </label>
                <label style={S.row}>
                  <input type="checkbox" checked={vals.is_hidden} onChange={e => set("is_hidden", e.target.checked)} style={{ accentColor: "#818cf8" }} />
                  Hidden
                </label>
                <label style={S.row}>
                  <input type="checkbox" checked={vals.is_readonly} onChange={e => set("is_readonly", e.target.checked)} />
                  Read-only
                </label>
                <label style={S.row}>
                  <input type="checkbox" checked={vals.editable_after_reg} onChange={e => set("editable_after_reg", e.target.checked)} />
                  Editable after registration
                </label>
              </div>
            )}
            {raceOptions.length > 1 && (
              <div>
                <label style={S.label}>Category Filter (blank = all categories)</label>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {raceOptions.map(r => {
                    const sel = vals.race_ids.includes(r.id);
                    return (
                      <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "4px 9px", borderRadius: 5, background: sel ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${sel ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.07)"}`, fontSize: 11, color: sel ? "#818cf8" : "#666" }}>
                        <input type="checkbox" checked={sel} onChange={() => set("race_ids", sel ? vals.race_ids.filter(id => id !== r.id) : [...vals.race_ids, r.id])} style={{ accentColor: "#818cf8" }} />
                        {r.name || r.distance}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OPTIONS TAB ──────────────────────────────── */}
        {tab === "options" && showOptions && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            <div style={{ fontSize: 11, color: "#555" }}>
              {HAS_OPTIONS.has(field.field_type) ? "One option per row. Drag to reorder." : "This field type does not use options."}
            </div>
            {vals.options.map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ color: "#333", fontSize: 14, cursor: "ns-resize" }}>⋮⋮</span>
                <input
                  value={opt}
                  onChange={e => { const n = [...vals.options]; n[i] = e.target.value; set("options", n); }}
                  style={{ ...S.input, flex: 1 }}
                />
                <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0}
                  style={{ padding: "3px 7px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, color: i === 0 ? "#333" : "#aaa", cursor: i === 0 ? "default" : "pointer", fontSize: 12 }}>↑</button>
                <button type="button" onClick={() => moveOption(i, 1)} disabled={i === vals.options.length - 1}
                  style={{ padding: "3px 7px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, color: i === vals.options.length - 1 ? "#333" : "#aaa", cursor: i === vals.options.length - 1 ? "default" : "pointer", fontSize: 12 }}>↓</button>
                <button type="button" onClick={() => removeOption(i)}
                  style={{ padding: "3px 7px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 12 }}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <input ref={optInputRef} value={newOpt} onChange={e => setNewOpt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                placeholder="New option…" style={{ ...S.input, flex: 1 }} />
              <button type="button" onClick={addOption}
                style={{ padding: "7px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: "#e8620a", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}>
                Add
              </button>
            </div>
            {vals.options.length === 0 && (
              <div style={{ fontSize: 11, color: "#e87c3a", marginTop: 4 }}>⚠ Add at least one option for this field type to work on the registration form.</div>
            )}
          </div>
        )}

        {/* ── CONDITIONS TAB ───────────────────────────── */}
        {tab === "conditions" && !showNoInput && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>
              {vals.conditions.length === 0
                ? "This field is always visible. Add rules to show it only when certain conditions are met."
                : "This field is shown only when ALL of the following conditions are true:"}
            </div>
            {vals.conditions.map((cond, ci) => (
              <div key={ci} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 5, alignItems: "center" }}>
                <select
                  value={cond.field_key}
                  onChange={e => updateCondition(ci, { field_key: e.target.value })}
                  style={{ ...S.input, colorScheme: "dark" as const }}>
                  <option value="">Select field…</option>
                  {otherFields.map(f => <option key={f.id} value={f.field_key}>{f.label} ({f.field_key})</option>)}
                </select>
                <select
                  value={cond.operator}
                  onChange={e => updateCondition(ci, { operator: e.target.value as Condition["operator"] })}
                  style={{ ...S.input, colorScheme: "dark" as const }}>
                  <option value="equals">equals</option>
                  <option value="not_equals">not equals</option>
                  <option value="contains">contains</option>
                  <option value="is_empty">is empty</option>
                  <option value="is_not_empty">not empty</option>
                </select>
                <input
                  value={cond.value}
                  onChange={e => updateCondition(ci, { value: e.target.value })}
                  disabled={["is_empty", "is_not_empty"].includes(cond.operator)}
                  placeholder="value"
                  style={{ ...S.input, opacity: ["is_empty", "is_not_empty"].includes(cond.operator) ? 0.35 : 1 }}
                />
                <button type="button" onClick={() => removeCondition(ci)}
                  style={{ padding: "4px 8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 12 }}>×</button>
              </div>
            ))}
            <button type="button" onClick={addCondition}
              style={{ padding: "7px 14px", background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 8, color: "#e8620a", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700, alignSelf: "flex-start" as const }}>
              + Add Condition
            </button>
          </div>
        )}

        {/* ── ADVANCED TAB ─────────────────────────────── */}
        {tab === "advanced" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
            <div>
              <label style={S.label}>Internal Field Key</label>
              <input style={{ ...S.input, color: "#666", fontFamily: "monospace" }} value={field.field_key} readOnly />
              <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>Used as the database key — set at creation, immutable</div>
            </div>
            {!showNoInput && (
              <>
                <div>
                  <label style={S.label}>Default Value</label>
                  <input style={S.input} value={vals.default_value} onChange={e => set("default_value", e.target.value)} placeholder="Pre-filled value shown to participants" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={S.label}>Min Length</label>
                    <input type="number" min="0" style={S.input} value={vals.min_length} onChange={e => set("min_length", e.target.value)} placeholder="No minimum" />
                  </div>
                  <div>
                    <label style={S.label}>Max Length</label>
                    <input type="number" min="1" style={S.input} value={vals.max_length} onChange={e => set("max_length", e.target.value)} placeholder="No limit" />
                  </div>
                </div>
                <div>
                  <label style={S.label}>Validation Pattern (Regex)</label>
                  <input style={{ ...S.input, fontFamily: "monospace" }} value={vals.validation_pattern} onChange={e => set("validation_pattern", e.target.value)} placeholder="e.g. ^[0-9]{6}$ for PIN code" />
                </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* Save / Close footer */}
      <div style={{ padding: "12px 14px 14px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose}
          style={{ padding: "7px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#888", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={saving}
          style={{ padding: "7px 18px", background: "rgba(232,98,10,0.85)", border: "none", borderRadius: 8, color: "#fff", cursor: saving ? "wait" : "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ── Type Picker Modal ─────────────────────────────────────────────────────────

function TypePicker({ onSelectType, onSelectTemplate, onClose }: {
  onSelectType:     (type: string) => void;
  onSelectTemplate: (tpl: TemplateEntry) => void;
  onClose:          () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 0" }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#111", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 660, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" as const, boxShadow: "0 -8px 32px rgba(0,0,0,0.5)" }}>

        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Add Field</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 20, lineHeight: 1, fontFamily: "inherit" }}>×</button>
        </div>

        <div style={{ overflowY: "auto" as const, flex: 1, padding: "14px 18px 24px" }}>

          {/* Pre-built Templates */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 10 }}>
              Pre-built Templates
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
              {TEMPLATES.map(tpl => (
                <button key={tpl.key} type="button" onClick={() => onSelectTemplate(tpl)}
                  style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-start", gap: 3, padding: "10px 12px", background: "rgba(232,98,10,0.07)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 9, cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit" }}>
                  <span style={{ fontSize: 18 }}>{tpl.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#e8620a" }}>{tpl.label}</span>
                  <span style={{ fontSize: 10, color: "#666" }}>{tpl.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Field categories */}
          {FIELD_CATEGORIES.map(cat => (
            <div key={cat.title} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 }}>{cat.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6 }}>
                {cat.items.map(item => (
                  <button key={item.type} type="button" onClick={() => onSelectType(item.type)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit" }}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    <span style={{ fontSize: 12, color: "#bbb" }}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Form Preview ──────────────────────────────────────────────────────────────

function FormPreview({ fields }: { fields: FormField[] }) {
  const [vals, setVals] = useState<Record<string, string>>({});

  const LABEL: React.CSSProperties = { display: "block", fontSize: "10px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" };
  const INPUT: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", padding: "9px 12px", borderRadius: "8px", color: "rgba(255,255,255,0.7)", fontFamily: "inherit", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" };

  const visibleFields = fields.filter(f => !f.is_hidden).filter(f => {
    if (f.conditions.length === 0) return true;
    return f.conditions.every(c => {
      const v = vals[c.field_key] ?? "";
      if (c.operator === "is_empty")     return !v;
      if (c.operator === "is_not_empty") return !!v;
      if (c.operator === "equals")       return v === c.value;
      if (c.operator === "not_equals")   return v !== c.value;
      if (c.operator === "contains")     return v.includes(c.value);
      return true;
    });
  });

  let lastSection = "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {visibleFields.map(f => {
        const sectionBreak = f.section && f.section !== lastSection;
        if (f.section) lastSection = f.section;

        return (
          <div key={f.id}>
            {sectionBreak && (
              <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", paddingBottom: "6px", borderBottom: "1px solid rgba(232,98,10,0.2)", marginBottom: "8px" }}>
                {f.section}
              </div>
            )}
            {f.field_type === "section_heading" ? (
              <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", paddingBottom: "6px", borderBottom: "1px solid rgba(232,98,10,0.2)" }}>
                {f.label}
              </div>
            ) : (
              <div>
                <label style={LABEL}>{f.label}{f.required ? " *" : ""}</label>
                {(f.field_type === "text" || f.field_type === "email" || f.field_type === "phone" || f.field_type === "url" || f.field_type === "decimal" || f.field_type === "number" || f.field_type === "pincode") && (
                  <input style={INPUT} value={vals[f.field_key] ?? ""} onChange={e => setVals(p => ({ ...p, [f.field_key]: e.target.value }))} placeholder={f.placeholder ?? ""} readOnly={f.is_readonly} />
                )}
                {(f.field_type === "textarea" || f.field_type === "address") && (
                  <textarea style={{ ...INPUT, minHeight: "70px", resize: "vertical" as const }} value={vals[f.field_key] ?? ""} onChange={e => setVals(p => ({ ...p, [f.field_key]: e.target.value }))} placeholder={f.placeholder ?? ""} readOnly={f.is_readonly} />
                )}
                {(f.field_type === "date" || f.field_type === "time" || f.field_type === "datetime") && (
                  <input type={f.field_type === "datetime" ? "datetime-local" : f.field_type} style={{ ...INPUT, colorScheme: "dark" as const }} value={vals[f.field_key] ?? ""} onChange={e => setVals(p => ({ ...p, [f.field_key]: e.target.value }))} readOnly={f.is_readonly} />
                )}
                {f.field_type === "select" && (
                  <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark" as const }} value={vals[f.field_key] ?? ""} onChange={e => setVals(p => ({ ...p, [f.field_key]: e.target.value }))} disabled={f.is_readonly}>
                    <option value="">Select…</option>
                    {f.options.map(o => <option key={o} value={o} style={{ background: "#1a1a1a" }}>{o}</option>)}
                  </select>
                )}
                {f.field_type === "radio" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "4px" }}>
                    {f.options.map(o => (
                      <label key={o} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input type="radio" checked={vals[f.field_key] === o} onChange={() => setVals(p => ({ ...p, [f.field_key]: o }))} style={{ accentColor: "#e8620a" }} disabled={f.is_readonly} />
                        <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>{o}</span>
                      </label>
                    ))}
                  </div>
                )}
                {(f.field_type === "checkbox" || f.field_type === "yes_no") && (
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", paddingTop: "4px" }}>
                    <input type="checkbox" checked={vals[f.field_key] === "yes"} onChange={e => setVals(p => ({ ...p, [f.field_key]: e.target.checked ? "yes" : "" }))} style={{ accentColor: "#e8620a", width: 16, height: 16 }} disabled={f.is_readonly} />
                    <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>{f.placeholder ?? "Yes"}</span>
                  </label>
                )}
                {f.field_type === "rating" && (
                  <div style={{ display: "flex", gap: 6, paddingTop: 4 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} type="button" onClick={() => setVals(p => ({ ...p, [f.field_key]: String(n) }))}
                        style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer", color: Number(vals[f.field_key] ?? 0) >= n ? "#f59e0b" : "#333", lineHeight: 1 }}>
                        ★
                      </button>
                    ))}
                  </div>
                )}
                {(f.field_type === "file" || f.field_type === "image_upload") && (
                  <div style={{ padding: "18px 12px", border: "2px dashed rgba(255,255,255,0.12)", borderRadius: "8px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "0.875rem" }}>
                    {f.placeholder ?? (f.field_type === "image_upload" ? "Click to upload an image" : "Click to upload a file")}
                  </div>
                )}
                {f.field_type === "waiver" && (
                  <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", fontSize: "0.8125rem", color: "rgba(255,255,255,0.5)", maxHeight: "100px", overflowY: "auto" }}>
                      {f.placeholder ?? "Please read and accept the terms below."}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" }}>
                      <input type="checkbox" style={{ accentColor: "#e8620a" }} />
                      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>I agree</span>
                    </label>
                  </div>
                )}
                {f.help_text && (
                  <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>{f.help_text}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {visibleFields.length === 0 && (
        <div style={{ color: "#444", fontSize: 12, fontStyle: "italic" }}>No visible fields to preview.</div>
      )}
    </div>
  );
}

// Export the slugify utility for use in pages
export { slugify };
