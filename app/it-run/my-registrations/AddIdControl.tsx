"use client";

import { useState } from "react";

// Lets a signed-in participant who continued without an ID add one later. The file is uploaded through the same
// route as the registration wizard, then attached by the server, which moves the participant to admin review.

const ACCENT = "#e8620a";
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export default function AddIdControl({ participantId, participantName, onAdded }: {
  participantId: string; participantName: string; onAdded: () => void;
}) {
  const [documentType, setDocumentType] = useState<"company" | "government">("company");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/it-run/upload/company-id", { method: "POST", body: form });
      const upData = await up.json().catch(() => ({})) as { url?: string; error?: string };
      if (!up.ok || !upData.url) {
        setMsg({ ok: false, text: upData.error ?? "The file could not be uploaded. Please try again." });
        return;
      }
      const res = await fetch("/api/it-run/my-registrations/id-document", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, documentPath: upData.url, documentType }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "The ID could not be saved. Please try again." });
        return;
      }
      setMsg({ ok: true, text: "ID received. Our team will review it." });
      onAdded();
    } catch {
      setMsg({ ok: false, text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      marginTop: 8, padding: "10px 12px", borderRadius: 10,
      background: "rgba(232,98,10,0.05)", border: "1px solid rgba(232,98,10,0.2)",
    }}>
      <div style={{ fontSize: 12, color: "#ccc", marginBottom: 8, lineHeight: 1.5 }}>
        {participantName} continued without an ID. Add one now for a faster BIB collection.
      </div>
      <div role="radiogroup" aria-label={`Type of ID for ${participantName}`} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {([
          { value: "company" as const, text: "Company ID" },
          { value: "government" as const, text: "Government-issued photo ID" },
        ]).map(opt => (
          <button key={opt.value} type="button" role="radio" aria-checked={documentType === opt.value}
            onClick={() => setDocumentType(opt.value)}
            style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
              color: "#fff", background: documentType === opt.value ? `${ACCENT}14` : "rgba(255,255,255,0.02)",
              border: `1px solid ${documentType === opt.value ? ACCENT : "rgba(255,255,255,0.1)"}`,
            }}>
            {documentType === opt.value ? "✓ " : ""}{opt.text}
          </button>
        ))}
      </div>
      <label style={{
        display: "inline-block", minHeight: 40, padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
        background: busy ? "rgba(232,98,10,0.08)" : `${ACCENT}`, color: "#fff", cursor: busy ? "wait" : "pointer",
      }}>
        {busy ? "Uploading…" : "Choose file to upload"}
        <input type="file" accept={ACCEPT} disabled={busy} style={{ display: "none" }}
          onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>JPG, PNG, WEBP or PDF, up to 5 MB.</div>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} style={{ fontSize: 12, marginTop: 6, color: msg.ok ? "#10b981" : "#f87171" }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
