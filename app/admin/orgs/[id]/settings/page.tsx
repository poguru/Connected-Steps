"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface OrgSettings {
  name: string; slug: string; logo_url: string | null; favicon_url: string | null;
  primary_color: string; secondary_color: string; domain: string | null;
  timezone: string; currency: string; contact_email: string | null; contact_phone: string | null;
  support_email: string | null; support_phone: string | null; wa_number: string | null;
  gst_number: string | null; company_name: string | null; billing_address: string | null;
  website: string | null; instagram_url: string | null; facebook_url: string | null;
  twitter_url: string | null; linkedin_url: string | null;
  privacy_policy: string | null; terms_of_service: string | null; refund_policy: string | null;
  plan: string; plan_status: string;
}

const TIMEZONES = ["Asia/Kolkata","Asia/Dubai","America/New_York","America/Los_Angeles","Europe/London","Europe/Paris","Australia/Sydney"];
const CURRENCIES = ["INR","USD","EUR","GBP","AED","AUD","SGD"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
      style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }} />
  );
}

function Textarea({ value, onChange, rows = 4 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} rows={rows}
      style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 20 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

export default function OrgSettingsPage() {
  const params = useParams<{ id: string }>();
  const id     = params.id;

  const [form,    setForm]    = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,     setErr]     = useState("");
  const [orgName, setOrgName] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/orgs/${id}/settings`)
      .then(r => r.json())
      .then(d => { setForm(d.org ?? null); setOrgName(d.org?.name ?? ""); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const set = (key: keyof OrgSettings) => (val: string) =>
    setForm(f => f ? { ...f, [key]: val } : f);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true); setErr(""); setSaved(false);
    try {
      const r = await fetch(`/api/admin/orgs/${id}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: "#555" }}>Loading…</div>;
  if (!form)   return <div style={{ padding: 48, textAlign: "center", color: "#f87171" }}>Not found</div>;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
        <Link href="/admin/orgs" style={{ color: "#555", textDecoration: "none" }}>Organizations</Link>
        {" / "}
        <Link href={`/admin/orgs/${id}`} style={{ color: "#555", textDecoration: "none" }}>{orgName}</Link>
        {" / Settings"}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Organization Settings</div>
        <div style={{ display: "flex", gap: 10 }}>
          {saved && <span style={{ fontSize: 12, color: "#4ade80", padding: "8px 14px", background: "rgba(74,222,128,0.08)", borderRadius: 8, border: "1px solid rgba(74,222,128,0.2)" }}>Saved!</span>}
          {err   && <span style={{ fontSize: 12, color: "#f87171" }}>{err}</span>}
          <button onClick={save} disabled={saving}
            style={{ padding: "8px 20px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <form onSubmit={save}>
        <Section title="Identity">
          <Field label="Organization Name"><Input value={form.name} onChange={set("name")} /></Field>
          <Field label="Website"><Input value={form.website ?? ""} onChange={set("website")} placeholder="https://example.com" /></Field>
          <Field label="Domain (for white-label)"><Input value={form.domain ?? ""} onChange={set("domain")} placeholder="events.example.com" /></Field>
          <div>
            <Field label="Timezone">
              <select value={form.timezone} onChange={e => set("timezone")(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13 }}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <Field label="Currency">
              <select value={form.currency} onChange={e => set("currency")(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13 }}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Branding">
          <Field label="Logo URL"><Input value={form.logo_url ?? ""} onChange={set("logo_url")} placeholder="https://cdn.example.com/logo.png" /></Field>
          <Field label="Favicon URL"><Input value={form.favicon_url ?? ""} onChange={set("favicon_url")} placeholder="https://cdn.example.com/favicon.png" /></Field>
          <div>
            <Field label="Primary Color">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={form.primary_color} onChange={e => set("primary_color")(e.target.value)}
                  style={{ width: 40, height: 36, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "none", cursor: "pointer" }} />
                <Input value={form.primary_color} onChange={set("primary_color")} />
              </div>
            </Field>
          </div>
          <div>
            <Field label="Secondary Color">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={form.secondary_color} onChange={e => set("secondary_color")(e.target.value)}
                  style={{ width: 40, height: 36, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "none", cursor: "pointer" }} />
                <Input value={form.secondary_color} onChange={set("secondary_color")} />
              </div>
            </Field>
          </div>
          {/* Live preview */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Preview</div>
            <div style={{ background: form.secondary_color, borderRadius: 10, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: form.primary_color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {form.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{form.name}</div>
                <div style={{ fontSize: 11, color: form.primary_color }}>Admin Portal</div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Contact">
          <Field label="Contact Email"><Input value={form.contact_email ?? ""} onChange={set("contact_email")} type="email" /></Field>
          <Field label="Contact Phone"><Input value={form.contact_phone ?? ""} onChange={set("contact_phone")} /></Field>
          <Field label="Support Email"><Input value={form.support_email ?? ""} onChange={set("support_email")} type="email" /></Field>
          <Field label="Support Phone"><Input value={form.support_phone ?? ""} onChange={set("support_phone")} /></Field>
          <Field label="WhatsApp Number"><Input value={form.wa_number ?? ""} onChange={set("wa_number")} placeholder="+91XXXXXXXXXX" /></Field>
        </Section>

        <Section title="GST & Legal">
          <Field label="Company / Legal Name"><Input value={form.company_name ?? ""} onChange={set("company_name")} /></Field>
          <Field label="GST Number"><Input value={form.gst_number ?? ""} onChange={set("gst_number")} placeholder="29ABCDE1234F1Z5" /></Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Billing Address">
              <Textarea value={form.billing_address ?? ""} onChange={set("billing_address")} rows={2} />
            </Field>
          </div>
        </Section>

        <Section title="Social Links">
          <Field label="Instagram"><Input value={form.instagram_url ?? ""} onChange={set("instagram_url")} placeholder="https://instagram.com/…" /></Field>
          <Field label="Facebook"><Input value={form.facebook_url ?? ""} onChange={set("facebook_url")} placeholder="https://facebook.com/…" /></Field>
          <Field label="Twitter / X"><Input value={form.twitter_url ?? ""} onChange={set("twitter_url")} placeholder="https://twitter.com/…" /></Field>
          <Field label="LinkedIn"><Input value={form.linkedin_url ?? ""} onChange={set("linkedin_url")} placeholder="https://linkedin.com/…" /></Field>
        </Section>

        <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Policies</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Privacy Policy">
              <Textarea value={form.privacy_policy ?? ""} onChange={set("privacy_policy")} rows={5} />
            </Field>
            <Field label="Terms of Service">
              <Textarea value={form.terms_of_service ?? ""} onChange={set("terms_of_service")} rows={5} />
            </Field>
            <Field label="Refund Policy">
              <Textarea value={form.refund_policy ?? ""} onChange={set("refund_policy")} rows={5} />
            </Field>
          </div>
        </div>

        {/* Plan info (read-only for non-platform-admins) */}
        <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Billing & Plan</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "#555" }}>Current Plan</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#e8620a", textTransform: "capitalize", marginTop: 4 }}>{form.plan}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#555" }}>Status</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: form.plan_status === "active" ? "#4ade80" : "#f87171", textTransform: "capitalize", marginTop: 4 }}>{form.plan_status}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "#444" }}>Contact platform support to upgrade your plan.</div>
        </div>
      </form>
    </div>
  );
}
