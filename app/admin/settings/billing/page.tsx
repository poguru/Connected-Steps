"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, Button, Alert, Spinner } from "@/components/ui/ds";

const inp: React.CSSProperties = {
  padding: "8px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", width: "100%",
};
const lbl: React.CSSProperties = {
  fontSize: "0.72rem", fontWeight: 600, color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5,
};
const section: React.CSSProperties = {
  fontSize: "0.78rem", fontWeight: 700, color: "#e8620a",
  textTransform: "uppercase", letterSpacing: "0.1em",
  borderBottom: "1px solid rgba(232,98,10,0.2)", paddingBottom: 6, marginBottom: 14,
};
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };

type Settings = Record<string, string>;

const DEFAULTS: Settings = {
  org_name: "", gst_number: "", pan_number: "", address: "", city: "", state: "",
  state_code: "", pincode: "", phone: "", email: "", website: "", logo_url: "",
  bank_name: "", account_number: "", ifsc_code: "", upi_id: "", upi_qr_url: "",
  authorized_signatory: "", signature_url: "", terms_conditions: "", thank_you_message: "",
};

// ── Image upload field ────────────────────────────────────────────────────────

function ImageUploadField({
  fieldLabel, value, onChange, previewHeight = 64,
}: {
  fieldLabel:    string;
  value:         string;
  onChange:      (url: string) => void;
  previewHeight?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState("");
  const [showUrl,   setShowUrl]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "billing");
      const res  = await fetch("/api/admin/assets/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); }
      else { onChange(data.url); setShowUrl(false); }
    } catch { setError("Upload failed — check your connection."); }
    finally   { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div>
      <span style={lbl}>{fieldLabel}</span>

      {/* Preview box */}
      {value ? (
        <div style={{
          marginBottom: 10, padding: 10,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8, display: "flex", alignItems: "center", gap: 12,
        }}>
          <img
            src={value} alt="preview"
            style={{ height: previewHeight, maxWidth: 200, objectFit: "contain", borderRadius: 4, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", wordBreak: "break-all", lineHeight: 1.4 }}>
              {value.length > 60 ? `${value.slice(0, 60)}…` : value}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          marginBottom: 10, padding: "18px 14px",
          background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)",
          borderRadius: 8, textAlign: "center",
          fontSize: "0.78rem", color: "rgba(255,255,255,0.2)",
        }}>
          No image set
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          ref={fileRef} type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "7px 14px", borderRadius: 6, cursor: uploading ? "default" : "pointer",
            background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)",
            color: uploading ? "#666" : "#e8620a", fontSize: "0.8rem", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {uploading ? "⏳ Uploading…" : value ? "🔄 Replace Image" : "📤 Upload Image"}
        </button>

        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setShowUrl(false); }}
            style={{
              padding: "7px 10px", borderRadius: 6, cursor: "pointer",
              background: "none", border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171", fontSize: "0.75rem",
            }}
          >
            ✕ Remove
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowUrl(v => !v)}
          style={{
            background: "none", border: "none", padding: "4px 6px",
            color: "rgba(255,255,255,0.25)", fontSize: "0.72rem", cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {showUrl ? "hide URL" : "paste URL instead"}
        </button>
      </div>

      {/* URL text fallback */}
      {showUrl && (
        <input
          style={{ ...inp, marginTop: 8 }}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://…/image.png"
        />
      )}

      {error && (
        <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [alert,    setAlert]    = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const res  = await fetch("/api/admin/billing-settings");
      const data = await res.json();
      if (data.settings) {
        const s: Settings = {};
        for (const k of Object.keys(DEFAULTS)) {
          s[k] = String(data.settings[k] ?? "");
        }
        setSettings(s);
      }
      setLoading(false);
    })();
  }, []);

  function set(key: string, val: string) {
    setSettings(prev => ({ ...prev, [key]: val }));
  }

  async function save() {
    setSaving(true); setAlert(null);
    const res = await fetch("/api/admin/billing-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Save failed" }); return; }
    setAlert({ type: "success", msg: "Billing settings saved" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <div style={{ padding: "4rem", textAlign: "center" }}><Spinner /></div>;

  const F = (key: string, fieldLabel: string, placeholder?: string, type = "text") => (
    <div>
      <label style={lbl}>{fieldLabel}</label>
      <input type={type} style={inp} value={settings[key] ?? ""} placeholder={placeholder}
        onChange={e => set(key, e.target.value)} />
    </div>
  );

  return (
    <div style={{ padding: "1.5rem", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/admin/settings" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>← Settings</Link>
        {" / "}
        <Link href="/admin/finance/manual-invoices" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Manual Invoices</Link>
      </div>
      <h1 style={{ margin: "0 0 6px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>⚙️ Billing Settings</h1>
      <p style={{ margin: "0 0 20px", fontSize: "0.8rem", color: "#555" }}>Organisation details printed on every invoice.</p>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>{alert.msg}</Alert>}

      {/* Organisation */}
      <Card style={{ padding: "1.25rem", marginBottom: 14 }}>
        <div style={section}>Organisation</div>
        <div style={{ marginBottom: 14 }}>
          {F("org_name", "Organisation Name *", "Connected Steps Events Pvt. Ltd.")}
        </div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          {F("gst_number", "GST Number",       "29AABCU9603R1ZX")}
          {F("pan_number", "PAN Number",        "ABCDE1234F")}
          {F("state_code", "State Code (GST)",  "36")}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Address</label>
          <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={settings.address ?? ""}
            onChange={e => set("address", e.target.value)} placeholder="Plot No. 12, Road No. 3..." />
        </div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          {F("city",    "City",    "Hyderabad")}
          {F("state",   "State",   "Telangana")}
          {F("pincode", "Pincode", "500001")}
        </div>
        <div style={{ ...grid3 }}>
          {F("phone",   "Phone",   "+91 9876543210")}
          {F("email",   "Email",   "billing@connectedsteps.in", "email")}
          {F("website", "Website", "www.connectedsteps.in")}
        </div>
      </Card>

      {/* Branding */}
      <Card style={{ padding: "1.25rem", marginBottom: 14 }}>
        <div style={section}>Branding</div>
        <div style={{ ...grid2, marginBottom: 14 }}>
          <ImageUploadField
            fieldLabel="Logo"
            value={settings.logo_url ?? ""}
            onChange={url => set("logo_url", url)}
            previewHeight={56}
          />
          <ImageUploadField
            fieldLabel="Authorised Signature"
            value={settings.signature_url ?? ""}
            onChange={url => set("signature_url", url)}
            previewHeight={56}
          />
        </div>
        <div>
          {F("authorized_signatory", "Authorised Signatory Name", "Rahul Kumar")}
        </div>
      </Card>

      {/* UPI QR */}
      <Card style={{ padding: "1.25rem", marginBottom: 14 }}>
        <div style={section}>Bank &amp; Payment Details</div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          {F("bank_name",      "Bank Name",      "HDFC Bank")}
          {F("account_number", "Account Number", "12345678901234")}
          {F("ifsc_code",      "IFSC Code",      "HDFC0001234")}
        </div>
        <div style={{ ...grid2 }}>
          {F("upi_id", "UPI ID", "connectedsteps@hdfcbank")}
          <ImageUploadField
            fieldLabel="UPI QR Code Image"
            value={settings.upi_qr_url ?? ""}
            onChange={url => set("upi_qr_url", url)}
            previewHeight={80}
          />
        </div>
      </Card>

      {/* Defaults */}
      <Card style={{ padding: "1.25rem", marginBottom: 14 }}>
        <div style={section}>Default Invoice Text</div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Terms &amp; Conditions</label>
          <textarea style={{ ...inp, height: 80, resize: "vertical" }} value={settings.terms_conditions ?? ""}
            onChange={e => set("terms_conditions", e.target.value)}
            placeholder="Goods once sold will not be taken back. Subject to Hyderabad jurisdiction." />
        </div>
        <div>
          <label style={lbl}>Thank You Message</label>
          <input style={inp} value={settings.thank_you_message ?? ""}
            onChange={e => set("thank_you_message", e.target.value)}
            placeholder="Thank you for your business!" />
        </div>
      </Card>

      {/* Save */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Link href="/admin/finance/manual-invoices"><Button size="sm" variant="ghost">Cancel</Button></Link>
        <Button onClick={save} loading={saving} variant="primary">Save Settings</Button>
      </div>
    </div>
  );
}
