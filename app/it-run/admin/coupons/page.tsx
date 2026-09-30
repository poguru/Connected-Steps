"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";

const INPUT: React.CSSProperties = {
  padding: "9px 12px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
  width: "100%", boxSizing: "border-box",
};

const SELECT_STYLE: React.CSSProperties = { ...INPUT, cursor: "pointer" };

interface Coupon {
  id: string; event_id: string; code: string; coupon_type: string;
  discount_type: "flat" | "percent"; discount_value: number;
  max_uses: number | null; use_count: number; min_amount: number | null;
  valid_from: string | null; expires_at: string | null;
  applicable_category_ids: string[] | null;
  description: string | null; is_active: boolean; created_at: string;
}

interface Category { id: string; name: string; color: string; }

type CouponStatus = "active" | "scheduled" | "expired" | "exhausted" | "disabled";

function getStatus(c: Coupon): CouponStatus {
  if (!c.is_active) return "disabled";
  const now = Date.now();
  if (c.valid_from && new Date(c.valid_from).getTime() > now) return "scheduled";
  if (c.expires_at && new Date(c.expires_at).getTime() < now) return "expired";
  if (c.max_uses !== null && c.use_count >= c.max_uses) return "exhausted";
  return "active";
}

const STATUS_STYLES: Record<CouponStatus, { bg: string; border: string; color: string }> = {
  active:    { bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)",  color: "#10b981" },
  scheduled: { bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)",  color: "#f59e0b" },
  expired:   { bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.3)", color: "#9ca3af" },
  exhausted: { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)",   color: "#f87171" },
  disabled:  { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", color: "#555"    },
};

function fmtDiscount(c: Coupon) {
  return c.discount_type === "flat" ? `₹${c.discount_value} OFF` : `${c.discount_value}% OFF`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function localDt(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>;
}

// ── Coupon form (shared by Create & Edit) ──────────────────────────────────────

type CouponFormData = {
  code: string; coupon_type: string;
  discount_type: "flat" | "percent"; discount_value: string;
  min_amount: string; max_uses: string;
  valid_from: string; expires_at: string;
  applicable_category_ids: string[];
  description: string;
};

const EMPTY_FORM: CouponFormData = {
  code: "", coupon_type: "generic",
  discount_type: "flat", discount_value: "",
  min_amount: "", max_uses: "",
  valid_from: "", expires_at: "",
  applicable_category_ids: [],
  description: "",
};

function CouponForm({
  form, setForm, cats, onSubmit, saving, error, hasBeenUsed = false, submitLabel,
}: {
  form: CouponFormData;
  setForm: React.Dispatch<React.SetStateAction<CouponFormData>>;
  cats: Category[];
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  hasBeenUsed?: boolean;
  submitLabel: string;
}) {
  function upd<K extends keyof CouponFormData>(k: K, v: CouponFormData[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleCat(id: string) {
    setForm(f => {
      const s = new Set(f.applicable_category_ids);
      s.has(id) ? s.delete(id) : s.add(id);
      return { ...f, applicable_category_ids: Array.from(s) };
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && (
        <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
          {error}
        </div>
      )}

      {hasBeenUsed && (
        <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: 12, color: "#fcd34d", lineHeight: 1.5 }}>
          This coupon has already been used. Code, discount type, discount value, and minimum amount cannot be changed.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Coupon Code *">
          <input style={{ ...INPUT, textTransform: "uppercase", ...(hasBeenUsed ? { opacity: 0.5 } : {}) }}
            required disabled={hasBeenUsed}
            value={form.code} onChange={e => upd("code", e.target.value.toUpperCase())}
            placeholder="e.g. WELCOME500" />
        </Field>
        <Field label="Type">
          <select style={SELECT_STYLE} value={form.coupon_type} onChange={e => upd("coupon_type", e.target.value)}>
            <option value="generic">Generic (multi-use code)</option>
            <option value="unique">Unique (single-use code)</option>
          </select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Discount Type *">
          <select style={{ ...SELECT_STYLE, ...(hasBeenUsed ? { opacity: 0.5 } : {}) }}
            disabled={hasBeenUsed}
            value={form.discount_type} onChange={e => upd("discount_type", e.target.value as "flat" | "percent")}>
            <option value="flat">Flat (₹ amount)</option>
            <option value="percent">Percentage (%)</option>
          </select>
        </Field>
        <Field label={form.discount_type === "flat" ? "Amount (₹) *" : "Percentage (%) *"}>
          <input type="number" min="0.01" max={form.discount_type === "percent" ? 100 : undefined} step="0.01"
            style={{ ...INPUT, ...(hasBeenUsed ? { opacity: 0.5 } : {}) }}
            required disabled={hasBeenUsed}
            value={form.discount_value} onChange={e => upd("discount_value", e.target.value)}
            placeholder={form.discount_type === "flat" ? "500" : "20"} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Max Total Uses (blank = unlimited)">
          <input type="number" min="1" style={INPUT}
            value={form.max_uses} onChange={e => upd("max_uses", e.target.value)}
            placeholder="100" />
        </Field>
        <Field label="Min Order Amount ₹ (optional)">
          <input type="number" min="0" style={{ ...INPUT, ...(hasBeenUsed ? { opacity: 0.5 } : {}) }}
            disabled={hasBeenUsed}
            value={form.min_amount} onChange={e => upd("min_amount", e.target.value)}
            placeholder="500" />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valid From">
          <input type="datetime-local" style={INPUT} value={form.valid_from}
            onChange={e => upd("valid_from", e.target.value)} />
        </Field>
        <Field label="Valid Until">
          <input type="datetime-local" style={INPUT} value={form.expires_at}
            onChange={e => upd("expires_at", e.target.value)} />
        </Field>
      </div>

      <Field label="Applicable Categories (leave empty = all categories)">
        {cats.length === 0 ? (
          <div style={{ fontSize: 12, color: "#555" }}>No categories loaded</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {cats.map(cat => {
              const sel = form.applicable_category_ids.includes(cat.id);
              return (
                <button key={cat.id} type="button" onClick={() => toggleCat(cat.id)}
                  style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    background: sel ? `${cat.color ?? ACCENT}20` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${sel ? (cat.color ?? ACCENT) : "rgba(255,255,255,0.1)"}`,
                    color: sel ? (cat.color ?? ACCENT) : "#666" }}>
                  {sel ? "✓ " : ""}{cat.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Description / Internal Note">
        <input style={INPUT} value={form.description} onChange={e => upd("description", e.target.value)}
          placeholder="Optional note" />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="submit" disabled={saving}
          style={{ flex: 1, padding: "11px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── Generate form ──────────────────────────────────────────────────────────────

type GenForm = {
  prefix: string; quantity: string;
  discount_type: "flat" | "percent"; discount_value: string;
  max_uses_per_coupon: string;
  valid_from: string; expires_at: string;
  applicable_category_ids: string[];
};

const EMPTY_GEN: GenForm = {
  prefix: "CS-", quantity: "50",
  discount_type: "flat", discount_value: "",
  max_uses_per_coupon: "1",
  valid_from: "", expires_at: "",
  applicable_category_ids: [],
};

// ── Main page ──────────────────────────────────────────────────────────────────

type ModalMode = "none" | "create" | "edit" | "delete" | "generate";

export default function CouponsPage() {
  const [coupons,    setCoupons]    = useState<Coupon[]>([]);
  const [cats,       setCats]       = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [globalMsg,  setGlobalMsg]  = useState<{ text: string; ok: boolean } | null>(null);
  const [mode,       setMode]       = useState<ModalMode>("none");
  const [activeCpn,  setActiveCpn]  = useState<Coupon | null>(null);
  const [form,       setForm]       = useState<CouponFormData>(EMPTY_FORM);
  const [genForm,    setGenForm]    = useState<GenForm>(EMPTY_GEN);
  const [formErr,    setFormErr]    = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter,   setTypeFilter]   = useState<string>("all");
  const [search,       setSearch]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, catr] = await Promise.all([
        fetch("/api/it-run/admin/coupons").then(r => r.json()),
        fetch("/api/it-run/admin/categories").then(r => r.json()),
      ]);
      setCoupons(cr.data ?? []);
      setCats(catr.categories ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function closeModal() { setMode("none"); setActiveCpn(null); setFormErr(null); }

  function openCreate() {
    setForm(EMPTY_FORM); setFormErr(null); setMode("create"); setGlobalMsg(null);
  }

  function openEdit(c: Coupon) {
    setForm({
      code: c.code, coupon_type: c.coupon_type ?? "generic",
      discount_type: c.discount_type, discount_value: String(c.discount_value),
      min_amount: c.min_amount != null ? String(c.min_amount) : "",
      max_uses: c.max_uses != null ? String(c.max_uses) : "",
      valid_from: localDt(c.valid_from), expires_at: localDt(c.expires_at),
      applicable_category_ids: c.applicable_category_ids ?? [],
      description: c.description ?? "",
    });
    setFormErr(null); setActiveCpn(c); setMode("edit"); setGlobalMsg(null);
  }

  function openDelete(c: Coupon) {
    setActiveCpn(c); setMode("delete"); setGlobalMsg(null);
  }

  function openGenerate() {
    setGenForm(EMPTY_GEN); setFormErr(null); setMode("generate"); setGlobalMsg(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setFormErr(null); setSaving(true);
    try {
      const r = await fetch("/api/it-run/admin/coupons", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code:                    form.code,
          coupon_type:             form.coupon_type,
          discount_type:           form.discount_type,
          discount_value:          Number(form.discount_value),
          min_amount:              form.min_amount ? Number(form.min_amount) : null,
          max_uses:                form.max_uses ? Number(form.max_uses) : null,
          valid_from:              form.valid_from ? new Date(form.valid_from).toISOString() : null,
          expires_at:              form.expires_at ? new Date(form.expires_at).toISOString() : null,
          applicable_category_ids: form.applicable_category_ids.length > 0 ? form.applicable_category_ids : null,
          description:             form.description || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setFormErr(d.error ?? "Failed to create coupon"); return; }
      setCoupons(prev => [d.data as Coupon, ...prev]);
      closeModal();
      setGlobalMsg({ text: `Coupon "${(d.data as Coupon).code}" created`, ok: true });
    } finally { setSaving(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault(); if (!activeCpn) return;
    setFormErr(null); setSaving(true);
    try {
      const r = await fetch("/api/it-run/admin/coupons", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeCpn.id,
          code:                    form.code,
          discount_type:           form.discount_type,
          discount_value:          Number(form.discount_value),
          min_amount:              form.min_amount ? Number(form.min_amount) : null,
          max_uses:                form.max_uses ? Number(form.max_uses) : null,
          valid_from:              form.valid_from ? new Date(form.valid_from).toISOString() : null,
          expires_at:              form.expires_at ? new Date(form.expires_at).toISOString() : null,
          applicable_category_ids: form.applicable_category_ids.length > 0 ? form.applicable_category_ids : null,
          description:             form.description || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setFormErr(d.error ?? "Failed to update coupon"); return; }
      setCoupons(prev => prev.map(c => c.id === activeCpn.id ? { ...c, ...(d.data as Coupon) } : c));
      closeModal();
      setGlobalMsg({ text: "Coupon updated", ok: true });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!activeCpn) return; setSaving(true);
    try {
      const r = await fetch("/api/it-run/admin/coupons", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeCpn.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        closeModal();
        setGlobalMsg({ text: d.error ?? "Cannot delete coupon", ok: false });
        return;
      }
      setCoupons(prev => prev.filter(c => c.id !== activeCpn.id));
      closeModal();
      setGlobalMsg({ text: `Coupon "${activeCpn.code}" deleted`, ok: true });
    } finally { setSaving(false); }
  }

  async function handleToggle(c: Coupon) {
    const r = await fetch("/api/it-run/admin/coupons", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
    });
    if (r.ok) {
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !c.is_active } : x));
      setGlobalMsg({ text: `Coupon "${c.code}" ${!c.is_active ? "enabled" : "disabled"}`, ok: true });
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault(); setFormErr(null); setSaving(true);
    try {
      const r = await fetch("/api/it-run/admin/coupons/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix:              genForm.prefix,
          quantity:            Number(genForm.quantity),
          discount_type:       genForm.discount_type,
          discount_value:      Number(genForm.discount_value),
          max_uses_per_coupon: Number(genForm.max_uses_per_coupon),
          valid_from:          genForm.valid_from ? new Date(genForm.valid_from).toISOString() : null,
          expires_at:          genForm.expires_at ? new Date(genForm.expires_at).toISOString() : null,
          applicable_category_ids: genForm.applicable_category_ids.length > 0 ? genForm.applicable_category_ids : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setFormErr(d.error ?? "Generation failed"); return; }
      closeModal();
      setGlobalMsg({ text: `${d.generated} unique coupon${d.generated !== 1 ? "s" : ""} generated successfully`, ok: true });
      await load();
    } finally { setSaving(false); }
  }

  function handleExport() {
    window.open("/api/it-run/admin/coupons/export", "_blank");
  }

  // Apply filters
  const filtered = coupons.filter(c => {
    const st = getStatus(c);
    if (statusFilter !== "all" && st !== statusFilter) return false;
    if (typeFilter !== "all" && (c.coupon_type ?? "generic") !== typeFilter) return false;
    if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function GenCatToggle({ id }: { id: string }) {
    const cat = cats.find(c => c.id === id);
    const sel = genForm.applicable_category_ids.includes(id);
    return (
      <button type="button"
        onClick={() => setGenForm(f => {
          const s = new Set(f.applicable_category_ids);
          s.has(id) ? s.delete(id) : s.add(id);
          return { ...f, applicable_category_ids: Array.from(s) };
        })}
        style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          background: sel ? `${cat?.color ?? ACCENT}20` : "rgba(255,255,255,0.04)",
          border: `1px solid ${sel ? (cat?.color ?? ACCENT) : "rgba(255,255,255,0.1)"}`,
          color: sel ? (cat?.color ?? ACCENT) : "#666" }}>
        {sel ? "✓ " : ""}{cat?.name ?? id}
      </button>
    );
  }

  return (
    <>
      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {mode !== "none" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "94vh", overflowY: "auto", padding: 28 }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {mode === "create" && "Create Coupon"}
                {mode === "edit" && `Edit Coupon — ${activeCpn?.code}`}
                {mode === "delete" && "Delete Coupon"}
                {mode === "generate" && "Generate Unique Coupons"}
              </div>
              <button onClick={closeModal}
                style={{ padding: "4px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>
                ✕
              </button>
            </div>

            {mode === "create" && (
              <CouponForm form={form} setForm={setForm} cats={cats}
                onSubmit={handleCreate} saving={saving} error={formErr}
                submitLabel="Create Coupon" />
            )}

            {mode === "edit" && activeCpn && (
              <CouponForm form={form} setForm={setForm} cats={cats}
                onSubmit={handleEdit} saving={saving} error={formErr}
                hasBeenUsed={(activeCpn.use_count ?? 0) > 0}
                submitLabel="Save Changes" />
            )}

            {mode === "delete" && activeCpn && (
              <>
                {(activeCpn.use_count ?? 0) > 0 ? (
                  <>
                    <div style={{ padding: "14px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, fontSize: 13, color: "#fca5a5", marginBottom: 20, lineHeight: 1.6 }}>
                      <strong>{activeCpn.code}</strong> has been used {activeCpn.use_count} time{activeCpn.use_count !== 1 ? "s" : ""} and cannot be deleted permanently.
                      You can disable it to prevent new redemptions.
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => { closeModal(); handleToggle(activeCpn); }}
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
                      Are you sure you want to permanently delete <strong style={{ color: "#ccc" }}>{activeCpn.code}</strong>?<br />
                      This coupon has never been used.
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

            {mode === "generate" && (
              <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {formErr && (
                  <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
                    {formErr}
                  </div>
                )}
                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, fontSize: 12, color: "#888", lineHeight: 1.5 }}>
                  Generates cryptographically unique single-use coupon codes. Each code will be: <code style={{ color: ACCENT }}>{"<PREFIX><6 RANDOM CHARS>"}</code>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Prefix">
                    <input style={{ ...INPUT, textTransform: "uppercase" }}
                      value={genForm.prefix} onChange={e => setGenForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                      placeholder="CS-" />
                  </Field>
                  <Field label="Quantity (1–1000) *">
                    <input type="number" min="1" max="1000" required style={INPUT}
                      value={genForm.quantity} onChange={e => setGenForm(f => ({ ...f, quantity: e.target.value }))} />
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Discount Type *">
                    <select required style={SELECT_STYLE} value={genForm.discount_type}
                      onChange={e => setGenForm(f => ({ ...f, discount_type: e.target.value as "flat" | "percent" }))}>
                      <option value="flat">Flat (₹ amount)</option>
                      <option value="percent">Percentage (%)</option>
                    </select>
                  </Field>
                  <Field label={genForm.discount_type === "flat" ? "Amount (₹) *" : "Percentage (%) *"}>
                    <input type="number" min="0.01" max={genForm.discount_type === "percent" ? 100 : undefined}
                      step="0.01" required style={INPUT}
                      value={genForm.discount_value} onChange={e => setGenForm(f => ({ ...f, discount_value: e.target.value }))}
                      placeholder={genForm.discount_type === "flat" ? "500" : "100"} />
                  </Field>
                </div>
                <Field label="Max Uses per Coupon (default: 1)">
                  <input type="number" min="1" style={INPUT}
                    value={genForm.max_uses_per_coupon} onChange={e => setGenForm(f => ({ ...f, max_uses_per_coupon: e.target.value }))} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Valid From">
                    <input type="datetime-local" style={INPUT} value={genForm.valid_from}
                      onChange={e => setGenForm(f => ({ ...f, valid_from: e.target.value }))} />
                  </Field>
                  <Field label="Valid Until">
                    <input type="datetime-local" style={INPUT} value={genForm.expires_at}
                      onChange={e => setGenForm(f => ({ ...f, expires_at: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Applicable Categories (empty = all)">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {cats.map(cat => <GenCatToggle key={cat.id} id={cat.id} />)}
                  </div>
                </Field>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button type="submit" disabled={saving}
                    style={{ flex: 1, padding: "11px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {saving ? "Generating…" : "Generate Coupons"}
                  </button>
                  <button type="button" onClick={closeModal}
                    style={{ padding: "11px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Main page ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1000 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Coupons</h1>
            <div style={{ fontSize: 13, color: "#888" }}>{coupons.length} coupon{coupons.length !== 1 ? "s" : ""} configured</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handleExport}
              style={{ padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ↓ Export CSV
            </button>
            <button onClick={openGenerate}
              style={{ padding: "8px 14px", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ⚡ Generate Unique
            </button>
            <button onClick={openCreate}
              style={{ padding: "8px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              + Create Coupon
            </button>
          </div>
        </div>

        {globalMsg && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: globalMsg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${globalMsg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: globalMsg.ok ? GREEN : "#f87171" }}>
            {globalMsg.text}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <input style={{ ...INPUT, width: 220 }} placeholder="Search code…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...SELECT_STYLE, width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="exhausted">Exhausted</option>
            <option value="disabled">Disabled</option>
          </select>
          <select style={{ ...SELECT_STYLE, width: 140 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="generic">Generic</option>
            <option value="unique">Unique</option>
          </select>
        </div>

        {loading ? (
          <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#666", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 }}>
            {coupons.length === 0
              ? <>No coupons yet. <button onClick={openCreate} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>Create one</button></>
              : "No coupons match the current filters."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(c => {
              const st      = getStatus(c);
              const sts     = STATUS_STYLES[st];
              const used    = c.use_count ?? 0;
              const maxU    = c.max_uses;
              const rem     = maxU != null ? Math.max(0, maxU - used) : null;
              const ctype   = c.coupon_type ?? "generic";
              const catNames = Array.isArray(c.applicable_category_ids) && c.applicable_category_ids.length > 0
                ? c.applicable_category_ids.map(id => cats.find(x => x.id === id)?.name ?? id)
                : ["All categories"];

              return (
                <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", opacity: st === "disabled" ? 0.65 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>

                    {/* Left */}
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{c.code}</span>
                        {/* Type badge */}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                          background: ctype === "unique" ? "rgba(139,92,246,0.12)" : "rgba(59,130,246,0.12)",
                          border: `1px solid ${ctype === "unique" ? "rgba(139,92,246,0.3)" : "rgba(59,130,246,0.3)"}`,
                          color: ctype === "unique" ? "#a78bfa" : "#60a5fa",
                          textTransform: "uppercase", letterSpacing: "0.07em" }}>
                          {ctype}
                        </span>
                        {/* Status badge */}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.07em",
                          background: sts.bg, border: `1px solid ${sts.border}`, color: sts.color }}>
                          {st}
                        </span>
                      </div>

                      {/* Discount + uses */}
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: ACCENT }}>{fmtDiscount(c)}</span>
                        <span style={{ fontSize: 13, color: "#888" }}>
                          Uses: <strong style={{ color: "#ccc" }}>{used}</strong>
                          {maxU != null ? <span style={{ color: "#555" }}>/{maxU}</span> : <span style={{ color: "#555" }}> / unlimited</span>}
                          {rem != null && <span style={{ color: "#555", marginLeft: 8 }}>({rem} remaining)</span>}
                        </span>
                      </div>

                      {/* Validity */}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#555", marginBottom: 5 }}>
                        {c.valid_from && <span>From: <span style={{ color: "#888" }}>{fmtDate(c.valid_from)}</span></span>}
                        {c.expires_at && <span>Until: <span style={{ color: st === "expired" ? "#f87171" : "#888" }}>{fmtDate(c.expires_at)}</span></span>}
                        {c.min_amount && <span>Min order: <span style={{ color: "#888" }}>₹{c.min_amount}</span></span>}
                      </div>

                      {/* Categories */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {catNames.map((n, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#666" }}>
                            {n}
                          </span>
                        ))}
                      </div>

                      {c.description && (
                        <div style={{ fontSize: 11, color: "#444", marginTop: 5, fontStyle: "italic" }}>{c.description}</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-end", flexShrink: 0 }}>
                      <button onClick={() => openEdit(c)}
                        style={{ padding: "5px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 7, color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Edit
                      </button>
                      <button onClick={() => handleToggle(c)}
                        style={{ padding: "5px 14px", background: c.is_active ? "rgba(239,68,68,0.07)" : "rgba(16,185,129,0.07)", border: `1px solid ${c.is_active ? "rgba(239,68,68,0.22)" : "rgba(16,185,129,0.22)"}`, borderRadius: 7, color: c.is_active ? "#f87171" : GREEN, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {c.is_active ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => openDelete(c)}
                        style={{ padding: "5px 14px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 7, color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
