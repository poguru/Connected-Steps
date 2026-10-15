"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Event emails: send an update to chosen runners, or resend a registration confirmation. Each send is queued first,
// then delivered in small batches. "Accepted" means the email provider took it; delivery is confirmed separately.

const ACCENT = "#e8620a";
const PAYMENT_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "free", label: "Free" },
  { value: "pending", label: "Pending" },
  { value: "payment_attempted", label: "Payment in progress" },
  { value: "partially_refunded", label: "Partly refunded" },
];

type Category = { id: string; name: string };
type Summary = { total: number; queued: number; accepted: number; delivered: number; failed: number; retryable: number; subject: string | null; createdAt: string | null; emailType: string | null };
type Runner = { id: string; first_name: string; last_name: string; email: string | null; it_run_registrations?: { registration_code: string } | null };

const card: React.CSSProperties = { background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, marginBottom: 14 };
const label: React.CSSProperties = { display: "block", fontSize: 12, color: "#999", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const button = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "10px 16px", borderRadius: 8, border: primary ? "none" : "1px solid rgba(255,255,255,0.18)",
  background: primary ? ACCENT : "transparent", color: "#fff", fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1, fontFamily: "inherit",
});

function newBatchId(): string {
  return crypto.randomUUID();
}

export default function AdminEmailsPage() {
  const [tab, setTab] = useState<"update" | "confirmation">("update");
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<Array<{ batchId: string; emailType: string; createdAt: string; summary: Summary }>>([]);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Update form
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<{ recipientCount: number; excludedInvalid: number; excludedDuplicate: number; previewHtml: string } | null>(null);
  const [updateBatch, setUpdateBatch] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Confirmation resend
  const [search, setSearch] = useState("");
  const [runners, setRunners] = useState<Runner[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [resendBatch, setResendBatch] = useState<string | null>(null);

  // Progress of the batch being sent
  const [progress, setProgress] = useState<{ batchId: string; summary: Summary | null; running: boolean } | null>(null);
  const busy = useRef(false);

  const loadHistory = useCallback(() => {
    fetch("/api/it-run/admin/emails")
      .then(r => r.json())
      .then(d => setHistory(d.batches ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/it-run/categories")
      .then(r => r.json())
      .then(d => setCategories((d.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    // Loaded once on open; the history is refreshed after each send
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  function filterBody() {
    return {
      categoryIds,
      paymentStatuses: statuses,
      registeredFrom: from || undefined,
      registeredTo: to || undefined,
    };
  }

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/it-run/admin/emails", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "The request failed. Nothing was sent.");
    return data;
  }

  /** Sends a queued batch in bounded steps until nothing is left queued. Each step is one request. */
  async function deliver(batchId: string, retry = false) {
    if (busy.current) return;
    busy.current = true;
    setProgress({ batchId, summary: null, running: true });
    try {
      let first = true;
      for (let step = 0; step < 200; step++) {
        const data = await post({ action: retry && first ? "retry_failed" : "process", batchId });
        first = false;
        setProgress({ batchId, summary: data.summary, running: true });
        if (data.attempted === 0) break;
      }
      setProgress(p => (p ? { ...p, running: false } : p));
      loadHistory();
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
      setProgress(p => (p ? { ...p, running: false } : p));
    } finally {
      busy.current = false;
    }
  }

  async function checkUpdate() {
    setMessage(null);
    setConfirming(false);
    try {
      const data = await post({ action: "preview_update", subject, body, filter: filterBody() });
      setPreview(data);
      // The batch id is made once per preview, so a double click on the send button cannot queue a second batch
      setUpdateBatch(newBatchId());
    } catch (e) {
      setPreview(null);
      setMessage({ text: (e as Error).message, ok: false });
    }
  }

  async function sendUpdate() {
    if (!updateBatch) return;
    setMessage(null);
    try {
      const data = await post({ action: "queue_update", batchId: updateBatch, subject, body, filter: filterBody() });
      setMessage({ text: data.status === "already_queued" ? "This update was already queued. Its progress is shown below." : `Queued ${data.count} emails. Sending now.`, ok: true });
      setConfirming(false);
      setPreview(null);
      await deliver(updateBatch);
      setUpdateBatch(null);
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    }
  }

  async function searchRunners() {
    setMessage(null);
    const res = await fetch(`/api/it-run/admin/participants?search=${encodeURIComponent(search)}&limit=20`);
    const data = await res.json().catch(() => ({}));
    setRunners(data.data ?? []);
  }

  async function sendConfirmations() {
    if (picked.length === 0) return;
    const batch = resendBatch ?? newBatchId();
    setResendBatch(batch);
    setMessage(null);
    try {
      const data = await post({ action: "queue_confirmation", batchId: batch, participantIds: picked });
      setMessage({ text: data.status === "already_queued" ? "These confirmations were already queued. Their progress is shown below." : `Queued ${data.count} confirmation emails.`, ok: true });
      await deliver(batch);
      setResendBatch(null);
      setPicked([]);
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    }
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px 80px", color: "#ddd", fontFamily: "inherit" }}>
      <h1 style={{ fontSize: 22, color: "#fff", margin: "0 0 4px" }}>Event emails</h1>
      <p style={{ fontSize: 13, color: "#777", margin: "0 0 18px" }}>The IT Run Sprint-2. Nothing is sent until you confirm.</p>

      <div role="tablist" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {([["update", "Event update"], ["confirmation", "Resend confirmation"]] as const).map(([key, text]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            style={{ ...button(tab === key), padding: "8px 14px" }}>{text}</button>
        ))}
      </div>

      {message && (
        <div role="status" style={{ ...card, borderColor: message.ok ? "rgba(16,185,129,0.4)" : "rgba(248,113,113,0.4)", color: message.ok ? "#6ee7b7" : "#fca5a5" }}>
          {message.text}
        </div>
      )}

      {tab === "update" && (
        <div>
          <div style={card}>
            <label style={label} htmlFor="subj">Subject</label>
            <input id="subj" style={input} value={subject} maxLength={150} onChange={e => { setSubject(e.target.value); setPreview(null); setConfirming(false); }} />

            <label style={{ ...label, marginTop: 14 }} htmlFor="body">Message</label>
            <textarea id="body" style={{ ...input, minHeight: 160, resize: "vertical" }} value={body} maxLength={10000}
              onChange={e => { setBody(e.target.value); setPreview(null); setConfirming(false); }} />
            <p style={{ fontSize: 12, color: "#666", margin: "6px 0 0" }}>
              You can use &lt;b&gt;, &lt;i&gt;, &lt;p&gt;, &lt;br&gt;, &lt;ul&gt;/&lt;li&gt; and links that start with https://. Other HTML is removed.
            </p>
          </div>

          <div style={card}>
            <span style={label}>Who receives it</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {categories.map(c => (
                <label key={c.id} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => { setCategoryIds(toggle(categoryIds, c.id)); setPreview(null); }} />
                  {c.name}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {PAYMENT_OPTIONS.map(s => (
                <label key={s.value} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={statuses.includes(s.value)} onChange={() => { setStatuses(toggle(statuses, s.value)); setPreview(null); }} />
                  {s.label}
                </label>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <div><label style={label} htmlFor="from">Registered from</label><input id="from" type="date" style={input} value={from} onChange={e => { setFrom(e.target.value); setPreview(null); }} /></div>
              <div><label style={label} htmlFor="to">Registered to</label><input id="to" type="date" style={input} value={to} onChange={e => { setTo(e.target.value); setPreview(null); }} /></div>
            </div>
            <p style={{ fontSize: 12, color: "#666", margin: "10px 0 0" }}>Runners without a valid email address are left out. The same address is only emailed once.</p>
            <div style={{ marginTop: 14 }}>
              <button style={button()} onClick={checkUpdate} disabled={!subject || !body}>Check recipients and preview</button>
            </div>
          </div>

          {preview && (
            <div style={card}>
              <div style={{ fontSize: 15, color: "#fff", marginBottom: 6 }}>
                <strong>{preview.recipientCount}</strong> {preview.recipientCount === 1 ? "person" : "people"} will receive this email.
              </div>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>
                Left out: {preview.excludedInvalid} without a valid address, {preview.excludedDuplicate} duplicate addresses.
              </div>
              <div style={{ fontSize: 13, color: "#aaa", marginBottom: 8 }}>Preview (as the first person sees it)</div>
              <iframe title="Email preview" sandbox="" srcDoc={preview.previewHtml}
                style={{ width: "100%", height: 420, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, background: "#fff" }} />
              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {!confirming ? (
                  <button style={button(true, preview.recipientCount === 0)} onClick={() => setConfirming(true)} disabled={preview.recipientCount === 0 || !updateBatch}>
                    Send to {preview.recipientCount}
                  </button>
                ) : (
                  <>
                    <button style={button(true, progress?.running)} onClick={sendUpdate} disabled={progress?.running}>
                      Yes, send to {preview.recipientCount} people
                    </button>
                    <button style={button()} onClick={() => setConfirming(false)}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "confirmation" && (
        <div style={card}>
          <span style={label}>Find a runner</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={input} placeholder="Name, email or mobile" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") searchRunners(); }} />
            <button style={button()} onClick={searchRunners}>Search</button>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {runners.map(r => (
              <label key={r.id} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <input type="checkbox" checked={picked.includes(r.id)} onChange={() => setPicked(toggle(picked, r.id))} />
                <span>{r.first_name} {r.last_name}</span>
                <span style={{ color: "#666" }}>{r.it_run_registrations?.registration_code ?? ""}</span>
              </label>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#666", margin: "10px 0" }}>
            Each chosen runner&apos;s category is resent as the confirmation the registration received. No registration, payment, QR code or status changes.
          </p>
          <button style={button(true, picked.length === 0 || !!progress?.running)} onClick={sendConfirmations} disabled={picked.length === 0 || !!progress?.running}>
            Resend confirmation to {picked.length} runner{picked.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {progress && (
        <div style={card}>
          <span style={label}>Progress</span>
          {progress.summary ? (
            <div style={{ fontSize: 14, color: "#fff" }}>
              {progress.summary.accepted} of {progress.summary.total} accepted by the provider
              {progress.summary.failed > 0 && <span style={{ color: "#fca5a5" }}> · {progress.summary.failed} failed</span>}
              {progress.summary.queued > 0 && <span style={{ color: "#aaa" }}> · {progress.summary.queued} waiting</span>}
              {progress.running && <span style={{ color: "#aaa" }}> · sending…</span>}
              {!progress.running && progress.summary.retryable > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button style={button()} onClick={() => deliver(progress.batchId, true)}>Retry {progress.summary.retryable} failed</button>
                </div>
              )}
            </div>
          ) : <div style={{ fontSize: 14, color: "#aaa" }}>Starting…</div>}
          <p style={{ fontSize: 12, color: "#666", margin: "8px 0 0" }}>&quot;Accepted&quot; means the email provider took the message. Delivery is shown once the provider reports it.</p>
        </div>
      )}

      <div style={card}>
        <span style={label}>History</span>
        {history.length === 0 && <div style={{ fontSize: 13, color: "#666" }}>No emails sent yet.</div>}
        {history.map(h => (
          <div key={h.batchId} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
            <div style={{ color: "#fff" }}>{h.summary.subject ?? "(no subject)"}</div>
            <div style={{ color: "#777", marginTop: 3 }}>
              {h.emailType === "confirmation_resend" ? "Confirmation resend" : "Event update"} · {new Date(h.createdAt).toLocaleString("en-IN")}
            </div>
            <div style={{ color: "#aaa", marginTop: 3 }}>
              {h.summary.total} emails · {h.summary.accepted} accepted · {h.summary.failed} failed{h.summary.queued > 0 ? ` · ${h.summary.queued} waiting` : ""}
            </div>
            {h.summary.retryable > 0 && (
              <button style={{ ...button(), marginTop: 6, padding: "6px 10px", fontSize: 12 }} onClick={() => deliver(h.batchId, true)}>
                Retry {h.summary.retryable} failed
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
