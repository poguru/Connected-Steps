"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, Button, Alert, Spinner } from "@/components/ui/ds";

const inp: React.CSSProperties = {
  padding: "8px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", width: "100%",
};
const label: React.CSSProperties = {
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

  const F = (key: string, lbl: string, placeholder?: string, type = "text") => (
    <div>
      <label style={label}>{lbl}</label>
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
          {F("gst_number",  "GST Number",  "29AABCU9603R1ZX")}
          {F("pan_number",  "PAN Number",  "ABCDE1234F")}
          {F("state_code",  "State Code (GST)", "36")}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Address</label>
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
          {F("logo_url",      "Logo URL (HTTPS image)",      "https://…/logo.png")}
          {F("signature_url", "Signature Image URL (HTTPS)", "https://…/signature.png")}
        </div>
        <div>
          {F("authorized_signatory", "Authorised Signatory Name", "Rahul Kumar")}
        </div>
        {settings.logo_url && (
          <div style={{ marginTop: 12 }}>
            <img src={settings.logo_url} alt="Logo preview" style={{ maxHeight: 60, borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
        )}
      </Card>

      {/* Bank & UPI */}
      <Card style={{ padding: "1.25rem", marginBottom: 14 }}>
        <div style={section}>Bank &amp; Payment Details</div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          {F("bank_name",      "Bank Name",       "HDFC Bank")}
          {F("account_number", "Account Number",  "12345678901234")}
          {F("ifsc_code",      "IFSC Code",       "HDFC0001234")}
        </div>
        <div style={{ ...grid2 }}>
          {F("upi_id",     "UPI ID",              "connectedsteps@hdfcbank")}
          {F("upi_qr_url", "UPI QR Image URL",    "https://…/upi-qr.png")}
        </div>
      </Card>

      {/* Defaults */}
      <Card style={{ padding: "1.25rem", marginBottom: 14 }}>
        <div style={section}>Default Invoice Text</div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Terms &amp; Conditions</label>
          <textarea style={{ ...inp, height: 80, resize: "vertical" }} value={settings.terms_conditions ?? ""}
            onChange={e => set("terms_conditions", e.target.value)}
            placeholder="Goods once sold will not be taken back. Subject to Hyderabad jurisdiction." />
        </div>
        <div>
          <label style={label}>Thank You Message</label>
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
