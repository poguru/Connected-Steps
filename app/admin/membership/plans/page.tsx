"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Input, Label, Alert, Badge, EmptyState } from "@/components/ui/ds";

interface Plan {
  id:              string;
  name:            string;
  slug:            string;
  tagline:         string | null;
  description:     string | null;
  price:           number | null;
  currency:        string;
  billing_label:   string | null;
  razorpay_plan:   string | null;
  features:        string[];
  cta_label:       string;
  cta_href:        string | null;
  is_active:       boolean;
  is_featured:     boolean;
  is_contact_only: boolean;
  display_order:   number;
  badge_label:     string | null;
  color_accent:    string;
}

const BLANK: Omit<Plan, "id"> = {
  name: "", slug: "", tagline: "", description: "",
  price: null, currency: "INR", billing_label: "per month",
  razorpay_plan: null,
  features: [],
  cta_label: "Get Started", cta_href: null,
  is_active: true, is_featured: false, is_contact_only: false,
  display_order: 99, badge_label: null, color_accent: "orange",
};

function FeatureEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState(value.join("\n"));
  useEffect(() => { setDraft(value.join("\n")); }, [value]);
  return (
    <div>
      <Label>Features (one per line)</Label>
      <textarea
        value={draft}
        onChange={e => { setDraft(e.target.value); onChange(e.target.value.split("\n").map(l => l.trim()).filter(Boolean)); }}
        rows={8}
        style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" as const }}
        placeholder="Weekly community running sessions&#10;Community WhatsApp group&#10;..."
      />
    </div>
  );
}

export default function MembershipPlansAdminPage() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form,    setForm]    = useState<Omit<Plan, "id">>(BLANK);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [saveOk,  setSaveOk]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/admin/membership-plans");
      const data = await res.json() as { plans?: Plan[]; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
      setPlans(data.plans ?? []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function startEdit(plan: Plan) {
    setEditing(plan);
    const { id: _id, ...rest } = plan;
    setForm({ ...rest, features: Array.isArray(plan.features) ? plan.features : [] });
    setSaveErr(""); setSaveOk(false);
  }

  function startCreate() {
    setEditing({ id: "NEW", ...BLANK });
    setForm({ ...BLANK });
    setSaveErr(""); setSaveOk(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(""); setSaveOk(false); setSaving(true);
    try {
      const isNew = editing?.id === "NEW";
      const res = await fetch("/api/admin/membership-plans", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? form : { id: editing!.id, ...form }),
      });
      const data = await res.json() as { plan?: Plan; error?: string };
      if (!res.ok) { setSaveErr(data.error ?? "Save failed."); return; }
      setSaveOk(true);
      await load();
      setTimeout(() => { setEditing(null); setSaveOk(false); }, 900);
    } catch { setSaveErr("Network error."); }
    finally { setSaving(false); }
  }

  async function toggleActive(plan: Plan) {
    await fetch("/api/admin/membership-plans", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id, is_active: !plan.is_active }),
    });
    await load();
  }

  async function toggleFeatured(plan: Plan) {
    await fetch("/api/admin/membership-plans", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id, is_featured: !plan.is_featured }),
    });
    await load();
  }

  async function deletePlan(plan: Plan) {
    if (!confirm(`Delete "${plan.name}"? This cannot be undone.`)) return;
    await fetch("/api/admin/membership-plans", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id }),
    });
    await load();
  }

  async function moveOrder(plan: Plan, dir: -1 | 1) {
    await fetch("/api/admin/membership-plans", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id, display_order: plan.display_order + dir }),
    });
    await load();
  }

  const inp: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: 940, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Link href="/admin/settings" style={{ fontSize: 12, color: "var(--muted-foreground)", textDecoration: "none" }}>← Settings</Link>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: "4px 0" }}>Membership Plans</h1>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
            Manage pricing, features, and CTA buttons. Changes reflect on /pricing immediately.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/pricing" target="_blank" style={{ fontSize: 12, color: "var(--muted-foreground)", textDecoration: "none", padding: "6px 12px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6 }}>Preview →</Link>
          <Button size="sm" onClick={startCreate}>+ New Plan</Button>
        </div>
      </div>

      {error && <Alert variant="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      {/* ── Plan list ── */}
      {loading ? (
        <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Loading…</div>
      ) : plans.length === 0 ? (
        <EmptyState title="No membership plans yet." body="Create your first plan to get started." action={<Button onClick={startCreate}>+ Create Plan</Button>} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {plans.map(plan => (
            <Card key={plan.id} style={{ opacity: plan.is_active ? 1 : 0.5 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                {/* Order controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => moveOrder(plan, -1)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "2px 6px", fontSize: 12 }}>▲</button>
                  <div style={{ fontSize: 10, textAlign: "center", color: "var(--muted-foreground)" }}>{plan.display_order}</div>
                  <button onClick={() => moveOrder(plan, 1)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "2px 6px", fontSize: 12 }}>▼</button>
                </div>

                {/* Plan info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>{plan.name}</span>
                    {plan.is_featured   && <Badge color="orange" size="sm">Featured</Badge>}
                    {!plan.is_active    && <Badge color="gray"   size="sm">Hidden</Badge>}
                    {plan.is_contact_only && <Badge color="blue"   size="sm">Contact Only</Badge>}
                    {plan.badge_label   && <Badge color="yellow" size="sm">{plan.badge_label}</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {plan.is_contact_only
                      ? "No price — Contact Us"
                      : plan.price !== null && plan.price !== undefined
                        ? `₹${Number(plan.price).toLocaleString("en-IN")} ${plan.billing_label ?? ""}`
                        : "Price not set — shows Contact Us"
                    }
                    {plan.razorpay_plan && <span style={{ marginLeft: 8, color: "rgba(74,222,128,0.8)" }}>• Razorpay: {plan.razorpay_plan}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                    {(plan.features ?? []).length} features · CTA: "{plan.cta_label}"
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                  <Button size="xs" variant="secondary"    onClick={() => startEdit(plan)}>Edit</Button>
                  <Button size="xs" variant={plan.is_featured ? "primary" : "ghost"} onClick={() => toggleFeatured(plan)}>{plan.is_featured ? "★ Featured" : "☆ Feature"}</Button>
                  <Button size="xs" variant="ghost"        onClick={() => toggleActive(plan)}>{plan.is_active ? "Hide" : "Show"}</Button>
                  <Button size="xs" variant="danger"       onClick={() => deletePlan(plan)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Edit / Create Modal ── */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "1rem", overflowY: "auto" }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 600, marginTop: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{editing.id === "NEW" ? "Create Plan" : `Edit — ${editing.name}`}</div>
              <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><Label>Plan Name *</Label><input required style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Community Membership" /></div>
                <div><Label>Slug *</Label><input required style={inp} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="community" /></div>
              </div>

              <div><Label>Tagline</Label><input style={inp} value={form.tagline ?? ""} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} placeholder="Run with the community" /></div>

              <div>
                <Label>Description</Label>
                <textarea rows={3} style={{ ...inp, resize: "vertical" as const }} value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short paragraph shown on the pricing card…" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <Label>Price (₹)</Label>
                  <input type="number" style={inp} value={form.price ?? ""} onChange={e => setForm(f => ({ ...f, price: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="1499 (leave blank for Contact Us)" />
                </div>
                <div>
                  <Label>Billing Label</Label>
                  <input style={inp} value={form.billing_label ?? ""} onChange={e => setForm(f => ({ ...f, billing_label: e.target.value }))} placeholder="per month" />
                </div>
                <div>
                  <Label>Razorpay Plan Key</Label>
                  <input style={inp} value={form.razorpay_plan ?? ""} onChange={e => setForm(f => ({ ...f, razorpay_plan: e.target.value || null }))} placeholder="monthly" />
                </div>
              </div>

              <FeatureEditor value={form.features} onChange={f => setForm(prev => ({ ...prev, features: f }))} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div><Label>CTA Label *</Label><input required style={inp} value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))} placeholder="Join Community" /></div>
                <div><Label>CTA Link (optional)</Label><input style={inp} value={form.cta_href ?? ""} onChange={e => setForm(f => ({ ...f, cta_href: e.target.value || null }))} placeholder="mailto:..." /></div>
                <div>
                  <Label>Colour Accent</Label>
                  <select value={form.color_accent} onChange={e => setForm(f => ({ ...f, color_accent: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                    <option value="orange">Orange</option>
                    <option value="blue">Blue</option>
                    <option value="green">Green</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><Label>Badge Text (optional)</Label><input style={inp} value={form.badge_label ?? ""} onChange={e => setForm(f => ({ ...f, badge_label: e.target.value || null }))} placeholder="Most Popular" /></div>
                <div><Label>Display Order</Label><input type="number" style={inp} value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))} /></div>
              </div>

              {/* Toggles */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {([
                  { key: "is_active",       label: "Active (visible on /pricing)" },
                  { key: "is_featured",     label: "Featured (highlighted card)" },
                  { key: "is_contact_only", label: "Contact-only (no price shown)" },
                ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#ccc" }}>
                    <input type="checkbox" checked={!!form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>

              {saveErr && <Alert variant="error">{saveErr}</Alert>}
              {saveOk  && <Alert variant="success">Saved!</Alert>}

              <div style={{ display: "flex", gap: 10 }}>
                <Button type="submit" loading={saving} fullWidth>{editing.id === "NEW" ? "Create Plan" : "Save Changes"}</Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
