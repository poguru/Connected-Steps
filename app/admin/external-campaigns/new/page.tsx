"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Alert, Spinner } from "@/components/ui/ds";
import dynamic from "next/dynamic";

const RichEmailEditor = dynamic(() => import("@/components/admin/RichEmailEditor"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContactList { id: string; name: string; member_count: number; color: string; }

interface PreviewRow {
  row: number; full_name: string; email?: string; company_name?: string;
  errors: string[]; isDuplicate?: { field: string; existingId: string };
}
interface ImportPreview {
  total: number; valid: number; errors: number; duplicates: number;
  preview: PreviewRow[];
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: "8px 12px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
  color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit",
  width: "100%", boxSizing: "border-box",
};

const label: React.CSSProperties = {
  display: "block", fontSize: "0.68rem", fontWeight: 700,
  color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
};

function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={label}>{l}</label>
      {children}
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Recipients", "Email Content", "Review & Send"];

function StepBar({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i < step ? "#10b981" : i === step ? "#e8620a" : "rgba(255,255,255,0.08)",
              color: i <= step ? "#fff" : "#555",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
            }}>
              {i < step ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: "0.65rem", color: i === step ? "#e8620a" : i < step ? "#10b981" : "#555", marginTop: 4, textAlign: "center", fontWeight: i === step ? 700 : 400 }}>{s}</div>
          </div>
          {i < STEPS.length - 1 && <div style={{ height: 1, flex: 1, background: i < step ? "#10b981" : "rgba(255,255,255,0.08)", marginTop: -14, flexShrink: 0, minWidth: 20 }} />}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NewExternalCampaignPage() {
  const router = useRouter();

  // Step control
  const [step, setStep] = useState(0);

  // Step 0: Recipients
  const [recipientMode, setRecipientMode] = useState<"upload" | "lists">("lists");
  const [file,          setFile]          = useState<File | null>(null);
  const [dupHandling,   setDupHandling]   = useState("skip");
  const [consentAck,    setConsentAck]    = useState(false);
  const [preview,       setPreview]       = useState<ImportPreview | null>(null);
  const [previewing,    setPreviewing]    = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState<{ imported: number; skipped: number; failed: number } | null>(null);

  const [lists,         setLists]         = useState<ContactList[]>([]);
  const [listsLoaded,   setListsLoaded]   = useState(false);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Email content
  const [name,       setName]       = useState("");
  const [subject,    setSubject]    = useState("");
  const [senderName, setSenderName] = useState("Connected Steps");
  const [replyTo,    setReplyTo]    = useState("");
  const [htmlBody,   setHtmlBody]   = useState("");

  // Sending
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState("");

  // ── Load lists on mount ────────────────────────────────────────────────────

  const loadLists = useCallback(async () => {
    const res = await fetch("/api/admin/contact-lists?limit=100");
    if (res.ok) { const d = await res.json(); setLists(d.lists ?? []); }
    setListsLoaded(true);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  // ── File preview ───────────────────────────────────────────────────────────

  async function previewFile() {
    if (!file) return;
    setPreviewing(true); setPreview(null); setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "true");
    const res  = await fetch("/api/admin/external-contacts/import", { method: "POST", body: fd });
    const data = await res.json();
    setPreviewing(false);
    if (!res.ok) { setError(data.error ?? "Preview failed"); return; }
    setPreview(data);
  }

  async function doImport() {
    if (!file || !consentAck) return;
    setImporting(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "false");
    fd.append("duplicate_handling", dupHandling);
    fd.append("compliance_acknowledged", "true");
    const res  = await fetch("/api/admin/external-contacts/import", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) { setError(data.error ?? "Import failed"); return; }
    setImportResult(data);
    // Stay in upload mode — campaign will target all external contacts (external_contacts_all)
  }

  // ── Recipient count estimate ───────────────────────────────────────────────

  const estimatedCount = recipientMode === "upload"
    ? (importResult ? importResult.imported : (preview?.valid ?? 0))
    : selectedLists.reduce((a, id) => a + (lists.find(l => l.id === id)?.member_count ?? 0), 0);

  // ── Campaign creation & send ───────────────────────────────────────────────

  async function sendCampaign() {
    if (!name || !subject || !htmlBody) { setError("Name, subject, and email content are required"); return; }
    if (recipientMode === "lists" && !selectedLists.length) { setError("Select at least one contact list"); return; }
    setSending(true); setError("");

    // 1. Create campaign
    const createRes = await fetch("/api/admin/campaigns", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name,
        channel:          "email",
        message_type:     "general_update",
        is_transactional: false,
        segment_type:   recipientMode === "upload" ? "external_contacts_all" : "external_contact_list",
        segment_config: recipientMode === "upload"
          ? { require_consent: false }
          : { contact_list_ids: selectedLists, require_consent: false },
        subject,
        html_body:   htmlBody,
        sender_name: senderName || null,
        reply_to:    replyTo    || null,
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) { setError(createData.error ?? "Failed to create campaign"); setSending(false); return; }

    const campaignId = createData.campaign.id;

    // 2. Send campaign
    const sendRes = await fetch(`/api/admin/campaigns/${campaignId}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const sendData = await sendRes.json();
    setSending(false);
    if (!sendRes.ok) { setError(sendData.error ?? "Failed to start campaign"); return; }

    router.push(`/admin/external-campaigns/${campaignId}`);
  }

  // ── Step 0: Recipients ─────────────────────────────────────────────────────

  if (step === 0) return (
    <div style={{ padding: "1.5rem", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 8 }}>
        <Link href="/admin/external-campaigns" style={{ color: "#555", textDecoration: "none" }}>External Campaigns</Link> / New
      </div>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>New External Campaign</h1>
      <StepBar step={step} />

      {error && <Alert variant="error" style={{ marginBottom: 14 }}>{error}</Alert>}

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "lists", label: "📋 Select Contact List" },
          { key: "upload", label: "📥 Upload File" },
        ].map(m => (
          <button key={m.key} onClick={() => { setRecipientMode(m.key as "upload" | "lists"); if (m.key === "lists") loadLists(); }}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 600,
              background: recipientMode === m.key ? "rgba(232,98,10,0.12)" : "transparent",
              borderColor: recipientMode === m.key ? "#e8620a" : "rgba(255,255,255,0.1)",
              color: recipientMode === m.key ? "#e8620a" : "#888" }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Upload mode */}
      {recipientMode === "upload" && (
        <Card style={{ padding: 20 }}>
          {!importResult ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: "0 0 8px", fontSize: "0.82rem", color: "#888" }}>
                  Upload an Excel (.xlsx) or CSV (.csv) file with your recipient list.
                </p>
                <a href="/api/admin/external-contacts/sample" download
                  style={{ fontSize: "0.78rem", color: "#60a5fa", textDecoration: "none" }}>
                  ⬇ Download sample template
                </a>
              </div>

              <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
                style={{ display: "none" }} />

              <div onClick={() => fileInputRef.current?.click()}
                style={{ border: "2px dashed rgba(255,255,255,0.12)", borderRadius: 10, padding: "32px 24px", textAlign: "center", cursor: "pointer", marginBottom: 12 }}>
                {file ? (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: "0.88rem" }}>{file.name}</div>
                    <div style={{ color: "#555", fontSize: "0.72rem", marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
                    <div style={{ color: "#888", fontSize: "0.82rem" }}>Click to choose .xlsx or .csv file</div>
                  </div>
                )}
              </div>

              {file && !preview && (
                <Button variant="outline" size="sm" onClick={previewFile} disabled={previewing}>
                  {previewing ? <Spinner /> : "Preview File"}
                </Button>
              )}

              {/* Preview */}
              {preview && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: "Total Rows",  value: preview.total,      color: "#fff" },
                      { label: "Valid",        value: preview.valid,      color: "#34d399" },
                      { label: "Invalid",      value: preview.errors,     color: "#f87171" },
                      { label: "Duplicates",   value: preview.duplicates, color: "#f59e0b" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: "0.65rem", color: "#555", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Sample rows */}
                  {preview.preview.length > 0 && (
                    <div style={{ overflowX: "auto", marginBottom: 14 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                            {["Row", "Name", "Email", "Company", "Status"].map(h => (
                              <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "#555", fontSize: "0.65rem", textTransform: "uppercase", fontWeight: 700 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.preview.slice(0, 10).map(r => (
                            <tr key={r.row} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                              <td style={{ padding: "5px 8px", color: "#555" }}>{r.row}</td>
                              <td style={{ padding: "5px 8px", color: "#fff" }}>{r.full_name}</td>
                              <td style={{ padding: "5px 8px", color: "#60a5fa" }}>{r.email ?? "—"}</td>
                              <td style={{ padding: "5px 8px", color: "#888" }}>{r.company_name ?? "—"}</td>
                              <td style={{ padding: "5px 8px" }}>
                                {r.errors.length > 0
                                  ? <span style={{ color: "#f87171", fontSize: "0.7rem" }}>❌ {r.errors[0]}</span>
                                  : r.isDuplicate
                                    ? <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>⚠ Duplicate</span>
                                    : <span style={{ color: "#34d399", fontSize: "0.7rem" }}>✓ Valid</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Duplicate handling */}
                  <Field l="Duplicate emails">
                    <select value={dupHandling} onChange={e => setDupHandling(e.target.value)} style={{ ...inp, width: "auto" }}>
                      <option value="skip">Skip duplicates</option>
                      <option value="update">Update existing contact</option>
                    </select>
                  </Field>

                  {/* Consent */}
                  <div style={{ background: "rgba(232,98,10,0.07)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: "0.8rem", color: "#ccc", lineHeight: 1.5 }}>
                      <input type="checkbox" checked={consentAck} onChange={e => setConsentAck(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, accentColor: "#e8620a" }} />
                      I confirm that I have permission to send promotional communications to these recipients and that this contact list complies with applicable privacy, anti-spam, and communication requirements.
                    </label>
                  </div>

                  <Button variant="primary" size="sm" onClick={doImport} disabled={importing || !consentAck || preview.valid === 0}>
                    {importing ? <><Spinner /> Importing…</> : `Import ${preview.valid} contacts`}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, color: "#34d399", marginBottom: 6 }}>Import complete</div>
              <div style={{ fontSize: "0.82rem", color: "#888" }}>
                {importResult.imported} imported · {importResult.skipped} skipped
                {importResult.failed > 0 ? ` · ${importResult.failed} failed` : ""}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#555", marginTop: 8 }}>Now select the contact list(s) to send to below</div>
            </div>
          )}
        </Card>
      )}

      {/* List select mode */}
      {recipientMode === "lists" && (
        <Card style={{ padding: 20 }}>
          {!listsLoaded ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}><Spinner /></div>
          ) : lists.length === 0 ? (
            <div style={{ textAlign: "center", color: "#555", fontSize: "0.88rem", padding: "24px 0" }}>
              No contact lists yet. <Link href="/admin/contact-lists" style={{ color: "#e8620a" }}>Create one</Link> or use Upload File.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lists.map(l => {
                const selected = selectedLists.includes(l.id);
                return (
                  <label key={l.id}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
                      border: `1px solid ${selected ? l.color : "rgba(255,255,255,0.08)"}`,
                      background: selected ? `${l.color}12` : "rgba(255,255,255,0.02)", cursor: "pointer" }}>
                    <input type="checkbox" checked={selected} onChange={e => {
                      setSelectedLists(prev => e.target.checked ? [...prev, l.id] : prev.filter(id => id !== l.id));
                    }} style={{ accentColor: l.color }} />
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>{l.name}</div>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#555" }}>{l.member_count.toLocaleString()} contacts</div>
                  </label>
                );
              })}
            </div>
          )}
          {selectedLists.length > 0 && (
            <div style={{ marginTop: 12, fontSize: "0.8rem", color: "#60a5fa", fontWeight: 600 }}>
              ~{estimatedCount.toLocaleString()} estimated recipients across {selectedLists.length} list(s)
            </div>
          )}
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <Link href="/admin/external-campaigns"><Button variant="ghost" size="sm">Cancel</Button></Link>
        <Button variant="primary" size="sm"
          disabled={recipientMode === "lists" ? selectedLists.length === 0 : !importResult}
          onClick={() => { setError(""); setStep(1); }}>
          Continue →
        </Button>
      </div>
    </div>
  );

  // ── Step 1: Email Content ──────────────────────────────────────────────────

  if (step === 1) return (
    <div style={{ padding: "1.5rem", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 8 }}>
        <Link href="/admin/external-campaigns" style={{ color: "#555", textDecoration: "none" }}>External Campaigns</Link> / New
      </div>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>New External Campaign</h1>
      <StepBar step={step} />

      {error && <Alert variant="error" style={{ marginBottom: 14 }}>{error}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field l="Campaign Name *">
          <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="e.g. Corporate HR Outreach — Aug 2026" />
        </Field>
        <Field l="Email Subject *">
          <input value={subject} onChange={e => setSubject(e.target.value)} style={inp} placeholder="e.g. Join us for the Connected Steps Marathon!" />
        </Field>
        <Field l="Sender Name">
          <input value={senderName} onChange={e => setSenderName(e.target.value)} style={inp} placeholder="Connected Steps" />
          <div style={{ fontSize: "0.68rem", color: "#444", marginTop: 3 }}>Appears as the "from" display name. Email is always info@connectedsteps.in</div>
        </Field>
        <Field l="Reply-To Email">
          <input value={replyTo} onChange={e => setReplyTo(e.target.value)} style={inp} placeholder="events@connectedsteps.in (optional)" type="email" />
        </Field>
      </div>

      <Field l="Email Content *">
        <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 6 }}>
          Use <code style={{ color: "#e8620a" }}>{"{{name}}"}</code>, <code style={{ color: "#e8620a" }}>{"{{company}}"}</code>, <code style={{ color: "#e8620a" }}>{"{{designation}}"}</code>, <code style={{ color: "#e8620a" }}>{"{{city}}"}</code> for personalization. An unsubscribe link will be added automatically.
        </div>
        <RichEmailEditor content={htmlBody} onChange={(html) => setHtmlBody(html)} />
      </Field>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <Button variant="ghost" size="sm" onClick={() => setStep(0)}>← Back</Button>
        <Button variant="primary" size="sm"
          disabled={!name.trim() || !subject.trim() || !htmlBody.trim()}
          onClick={() => { setError(""); setStep(2); }}>
          Review →
        </Button>
      </div>
    </div>
  );

  // ── Step 2: Review & Send ──────────────────────────────────────────────────

  return (
    <div style={{ padding: "1.5rem", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 8 }}>
        <Link href="/admin/external-campaigns" style={{ color: "#555", textDecoration: "none" }}>External Campaigns</Link> / New
      </div>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>New External Campaign</h1>
      <StepBar step={step} />

      {error && <Alert variant="error" style={{ marginBottom: 14 }}>{error}</Alert>}

      <Card style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Campaign Summary</div>
        {[
          { label: "Name",         value: name },
          { label: "Subject",      value: subject },
          { label: "Sender",       value: `${senderName || "Connected Steps"} <info@connectedsteps.in>` },
          { label: "Reply-To",     value: replyTo || "(none)" },
          { label: "Lists",        value: selectedLists.map(id => lists.find(l => l.id === id)?.name ?? id).join(", ") || "All contacts from import" },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "8px 0" }}>
            <div style={{ width: 90, fontSize: "0.75rem", color: "#555", flexShrink: 0 }}>{r.label}</div>
            <div style={{ fontSize: "0.82rem", color: "#fff", flex: 1 }}>{r.value}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 12, padding: "8px 0" }}>
          <div style={{ width: 90, fontSize: "0.75rem", color: "#555", flexShrink: 0 }}>Recipients</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#e8620a" }}>~{estimatedCount.toLocaleString()}</div>
        </div>
      </Card>

      {/* Notices */}
      <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 14, fontSize: "0.78rem", color: "#93c5fd" }}>
        <strong>How this works:</strong> Emails are queued immediately and sent by the background worker. You do not need to keep this tab open. Recipients who opted out or are globally suppressed will be excluded automatically.
      </div>

      <div style={{ background: "rgba(232,98,10,0.07)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: "0.78rem", color: "#fdba74" }}>
        <strong>Unsubscribe:</strong> Every email will include a one-click unsubscribe link. Unsubscribed recipients will not receive future promotional emails, even if re-imported.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Back</Button>
        <Button variant="primary" size="sm" onClick={sendCampaign} disabled={sending}>
          {sending ? <><Spinner /> Sending…</> : `🚀 Send to ~${estimatedCount.toLocaleString()} contacts`}
        </Button>
      </div>
    </div>
  );
}
