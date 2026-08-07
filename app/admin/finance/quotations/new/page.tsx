"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string; description: string; quantity: number; unit: string;
  rate: number; discount_pct: number; gst_pct: number; amount: number;
}

interface Deliverable { id: string; label: string; checked: boolean; }

interface SponsorPkg  {
  id: string; name: string; price: number; color: string; benefits: string[];
}

interface TimelineMilestone {
  id: string; title: string; date: string; description: string;
}

interface PaymentMilestone {
  id: string; label: string; percentage: number; due_days: number; notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function calcTotals(items: LineItem[], isIgst: boolean) {
  let subtotal = 0;
  let gstBucket: Record<number, number> = {};
  for (const it of items) {
    const base = it.quantity * it.rate * (1 - it.discount_pct / 100);
    subtotal += base;
    gstBucket[it.gst_pct] = (gstBucket[it.gst_pct] ?? 0) + base * (it.gst_pct / 100);
  }
  const totalGst = Object.values(gstBucket).reduce((a, b) => a + b, 0);
  const taxable  = subtotal;
  const igst     = isIgst ? totalGst : 0;
  const cgst     = isIgst ? 0 : totalGst / 2;
  const sgst     = isIgst ? 0 : totalGst / 2;
  const grand    = Math.round(subtotal + totalGst);
  const roundOff = grand - (subtotal + totalGst);
  return { subtotal, taxable_amount: taxable, igst_amount: igst, cgst_amount: cgst, sgst_amount: sgst, round_off: roundOff, grand_total: grand };
}

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

const label: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", fontWeight: 600, color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5,
};

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label}>{l}</label>
      {children}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fff" }}>{title}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "#555", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── TipTap wrapper ─────────────────────────────────────────────────────────────

function RichEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        style: "min-height:120px;padding:10px 12px;font-size:0.84rem;line-height:1.65;color:#f0f0f0;outline:none",
      },
    },
  });

  // Sync external value (edit mode initial load)
  useEffect(() => {
    if (editor && value && editor.getHTML() !== value) {
      editor.commands.setContent(value);
    }
  }, [value]); // eslint-disable-line

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 2, padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
        {[
          { label: "B", title: "Bold",       action: () => editor?.chain().focus().toggleBold().run()         },
          { label: "I", title: "Italic",     action: () => editor?.chain().focus().toggleItalic().run()       },
          { label: "H2",title: "Heading 2",  action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
          { label: "H3",title: "Heading 3",  action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
          { label: "•",  title: "Bullet list",action: () => editor?.chain().focus().toggleBulletList().run()  },
          { label: "1.", title: "Ordered list",action:()=> editor?.chain().focus().toggleOrderedList().run()  },
          { label: "—",  title: "Divider",   action: () => editor?.chain().focus().setHorizontalRule().run()  },
        ].map(b => (
          <button key={b.label} title={b.title} onClick={b.action} type="button"
            style={{ padding: "2px 7px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#888", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit" }}>
            {b.label}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
      {!value && !editor?.getText() && (
        <div style={{ padding: "0 12px 8px", fontSize: "0.78rem", color: "#333", pointerEvents: "none" }}>{placeholder}</div>
      )}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function QuotationFormPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editId       = searchParams.get("edit");
  const isEdit       = !!editId;

  const [loading,  setLoading]  = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [alert,    setAlert]    = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [saving,   setSaving]   = useState(false);

  // Client
  const [companyName,      setCompanyName]      = useState("");
  const [clientName,       setClientName]       = useState("");
  const [clientDesig,      setClientDesig]      = useState("");
  const [clientDept,       setClientDept]       = useState("");
  const [clientGst,        setClientGst]        = useState("");
  const [clientPan,        setClientPan]        = useState("");
  const [clientEmail,      setClientEmail]      = useState("");
  const [clientPhone,      setClientPhone]      = useState("");
  const [billingAddress,   setBillingAddress]   = useState("");
  const [projectLocation,  setProjectLocation]  = useState("");
  const [clientWebsite,    setClientWebsite]    = useState("");

  // Proposal meta
  const [proposalTitle,    setProposalTitle]    = useState("");
  const [projectName,      setProjectName]      = useState("");
  const [eventDate,        setEventDate]        = useState("");
  const [validUntil,       setValidUntil]       = useState("");
  const [preparedBy,       setPreparedBy]       = useState("");
  const [referenceNumber,  setReferenceNumber]  = useState("");

  // Rich text
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [scopeOfWork,      setScopeOfWork]      = useState("");
  const [termsConditions,  setTermsConditions]  = useState("");
  const [paymentTermsNotes,setPaymentTermsNotes]= useState("");

  // Structured sections
  const [deliverables,     setDeliverables]     = useState<Deliverable[]>([]);
  const [sponsorPkgs,      setSponsorPkgs]      = useState<SponsorPkg[]>([]);
  const [timelineMilestones, setTimelineMilestones] = useState<TimelineMilestone[]>([]);
  const [paymentMilestones,  setPaymentMilestones]  = useState<PaymentMilestone[]>([]);

  // Financials
  const [items,            setItems]            = useState<LineItem[]>([]);
  const [isIgst,           setIsIgst]           = useState(false);
  const [placeOfSupply,    setPlaceOfSupply]    = useState("Telangana");
  const [advancePct,       setAdvancePct]       = useState("");
  const [internalNotes,    setInternalNotes]    = useState("");
  const [customerNotes,    setCustomerNotes]    = useState("");

  // Computed totals
  const totals = calcTotals(items, isIgst);

  // Load for edit mode
  useEffect(() => {
    if (!editId) return;
    (async () => {
      setFetching(true);
      const res = await fetch(`/api/admin/quotations/${editId}`);
      if (!res.ok) { setAlert({ type: "error", msg: "Failed to load quotation" }); setFetching(false); return; }
      const { quotation: q, items: its } = await res.json();

      setCompanyName(q.company_name ?? "");
      setClientName(q.client_name ?? "");
      setClientDesig(q.client_designation ?? "");
      setClientDept(q.client_department ?? "");
      setClientGst(q.client_gst ?? "");
      setClientPan(q.client_pan ?? "");
      setClientEmail(q.client_email ?? "");
      setClientPhone(q.client_phone ?? "");
      setBillingAddress(q.billing_address ?? "");
      setProjectLocation(q.project_location ?? "");
      setClientWebsite(q.client_website ?? "");
      setProposalTitle(q.proposal_title ?? "");
      setProjectName(q.project_name ?? "");
      setEventDate(q.event_date ?? "");
      setValidUntil(q.valid_until ?? "");
      setPreparedBy(q.prepared_by ?? "");
      setReferenceNumber(q.reference_number ?? "");
      setExecutiveSummary(q.executive_summary ?? "");
      setScopeOfWork(q.scope_of_work ?? "");
      setTermsConditions(q.terms_conditions ?? "");
      setPaymentTermsNotes(q.payment_terms_notes ?? "");
      setDeliverables(q.deliverables ?? []);
      setSponsorPkgs(q.sponsorship_packages ?? []);
      setTimelineMilestones(q.timeline_milestones ?? []);
      setPaymentMilestones(q.payment_milestones ?? []);
      setIsIgst(q.is_igst ?? false);
      setPlaceOfSupply(q.place_of_supply ?? "Telangana");
      setAdvancePct(q.advance_percentage ?? "");
      setInternalNotes(q.internal_notes ?? "");
      setCustomerNotes(q.customer_notes ?? "");
      setItems((its ?? []).map((it: Record<string, unknown>) => ({
        id:           String(it.id ?? uid()),
        description:  String(it.description ?? ""),
        quantity:     Number(it.quantity     ?? 1),
        unit:         String(it.unit         ?? ""),
        rate:         Number(it.rate         ?? 0),
        discount_pct: Number(it.discount_pct ?? 0),
        gst_pct:      Number(it.gst_pct     ?? 18),
        amount:       Number(it.amount       ?? 0),
      })));
      setFetching(false);
    })();
  }, [editId]);

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      const base = next.quantity * next.rate * (1 - next.discount_pct / 100);
      const gst  = base * (next.gst_pct / 100);
      next.amount = Math.round((base + gst) * 100) / 100;
      return next;
    }));
  }

  function addItem() {
    setItems(prev => [...prev, { id: uid(), description: "", quantity: 1, unit: "", rate: 0, discount_pct: 0, gst_pct: 18, amount: 0 }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) { setAlert({ type: "error", msg: "Client name is required" }); return; }
    if (!proposalTitle.trim()) { setAlert({ type: "error", msg: "Proposal title is required" }); return; }

    setSaving(true);
    setAlert(null);

    const payload = {
      company_name: companyName || null, client_name: clientName,
      client_designation: clientDesig || null, client_department: clientDept || null,
      client_gst: clientGst || null, client_pan: clientPan || null,
      client_email: clientEmail || null, client_phone: clientPhone || null,
      billing_address: billingAddress || null, project_location: projectLocation || null,
      client_website: clientWebsite || null,
      proposal_title: proposalTitle, project_name: projectName || null,
      event_date: eventDate || null, valid_until: validUntil || null,
      prepared_by: preparedBy || null, reference_number: referenceNumber || null,
      executive_summary: executiveSummary || null, scope_of_work: scopeOfWork || null,
      terms_conditions: termsConditions || null, payment_terms_notes: paymentTermsNotes || null,
      deliverables, sponsorship_packages: sponsorPkgs,
      timeline_milestones: timelineMilestones, payment_milestones: paymentMilestones,
      currency: "INR", place_of_supply: placeOfSupply || null,
      is_igst: isIgst, advance_percentage: advancePct ? Number(advancePct) : null,
      internal_notes: internalNotes || null, customer_notes: customerNotes || null,
      items: items.map(it => ({ ...it })),
      ...totals,
    };

    const url    = isEdit ? `/api/admin/quotations/${editId}` : "/api/admin/quotations";
    const method = isEdit ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data   = await res.json();
    setSaving(false);

    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Save failed" }); return; }

    router.push(`/admin/finance/quotations/${data.quotation?.id ?? editId}`);
  }

  if (fetching) return (
    <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>
  );

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>
              {isEdit ? "Edit Quotation" : "New Quotation"}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "#555" }}>
              {isEdit ? "Changes bump the version number automatically" : "Creates a draft quotation with auto-assigned number"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Quotation"}
            </Button>
          </div>
        </div>

        {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>{alert.msg}</Alert>}

        {/* ── Section 1: Client Details ─────────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Client Details" sub="Who is this proposal for?" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <Field label="Company Name">
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corp" style={inp} />
            </Field>
            <Field label="Client Name *">
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Rahul Sharma" required style={inp} />
            </Field>
            <Field label="Designation">
              <input value={clientDesig} onChange={e => setClientDesig(e.target.value)} placeholder="Marketing Manager" style={inp} />
            </Field>
            <Field label="Department">
              <input value={clientDept} onChange={e => setClientDept(e.target.value)} placeholder="Corporate HR" style={inp} />
            </Field>
            <Field label="Email">
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="rahul@acme.com" style={inp} />
            </Field>
            <Field label="Phone">
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+91 98765 43210" style={inp} />
            </Field>
            <Field label="GST Number">
              <input value={clientGst} onChange={e => setClientGst(e.target.value)} placeholder="36AABCU9603R1ZP" style={inp} />
            </Field>
            <Field label="PAN">
              <input value={clientPan} onChange={e => setClientPan(e.target.value)} placeholder="AABCU9603R" style={inp} />
            </Field>
            <Field label="Website">
              <input value={clientWebsite} onChange={e => setClientWebsite(e.target.value)} placeholder="https://acme.com" style={inp} />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Billing Address">
              <textarea value={billingAddress} onChange={e => setBillingAddress(e.target.value)}
                rows={2} placeholder="123, Road Name, Area, City, State – PIN" style={{ ...inp, resize: "vertical" }} />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Project / Event Location">
              <input value={projectLocation} onChange={e => setProjectLocation(e.target.value)} placeholder="Hyderabad, Telangana" style={inp} />
            </Field>
          </div>
        </Card>

        {/* ── Section 2: Proposal Meta ─────────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Proposal Details" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <Field label="Proposal Title *">
              <input value={proposalTitle} onChange={e => setProposalTitle(e.target.value)}
                placeholder="Corporate Marathon 2026 – Event Proposal" required style={inp} />
            </Field>
            <Field label="Project / Event Name">
              <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Run for Life 2026" style={inp} />
            </Field>
            <Field label="Event Date">
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={inp} />
            </Field>
            <Field label="Valid Until">
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={inp} />
            </Field>
            <Field label="Prepared By">
              <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Connected Steps Team" style={inp} />
            </Field>
            <Field label="Reference Number">
              <input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} placeholder="CS-REF-2026-001" style={inp} />
            </Field>
          </div>
        </Card>

        {/* ── Section 3: Executive Summary ──────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Executive Summary" sub="Opening statement — first thing client reads" />
          <RichEditor value={executiveSummary} onChange={setExecutiveSummary} placeholder="We are pleased to submit this proposal…" />
        </Card>

        {/* ── Section 4: Scope of Work ──────────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Scope of Work" sub="What will be delivered and how" />
          <RichEditor value={scopeOfWork} onChange={setScopeOfWork} placeholder="Describe the services, responsibilities, and deliverables…" />
        </Card>

        {/* ── Section 5: Deliverables Checklist ────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Deliverables Checklist" sub="Items included in the package (visual checklist in proposal)" />
          {deliverables.map((d, i) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input type="checkbox" checked={d.checked} onChange={e => setDeliverables(prev => prev.map((x, xi) => xi === i ? { ...x, checked: e.target.checked } : x))} />
              <input value={d.label} onChange={e => setDeliverables(prev => prev.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))}
                placeholder="e.g. Finisher Medal" style={{ ...inp, flex: 1 }} />
              <button type="button" onClick={() => setDeliverables(prev => prev.filter((_, xi) => xi !== i))}
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeliverables(prev => [...prev, { id: uid(), label: "", checked: true }])}>
            + Add Deliverable
          </Button>
        </Card>

        {/* ── Section 6: Line Items ─────────────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Line Items & Pricing" sub="Services, packages, and costs" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Description", "Qty", "Unit", "Rate (₹)", "Disc%", "GST%", "Amount", ""].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "4px 4px" }}>
                      <input value={it.description} onChange={e => updateItem(it.id, { description: e.target.value })}
                        placeholder="Service description" style={{ ...inp, minWidth: 200 }} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <input type="number" value={it.quantity} min={0} step="any" onChange={e => updateItem(it.id, { quantity: Number(e.target.value) })}
                        style={{ ...inp, width: 60, fontVariantNumeric: "tabular-nums" }} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <input value={it.unit} onChange={e => updateItem(it.id, { unit: e.target.value })}
                        placeholder="pax/hrs/lot" style={{ ...inp, width: 70 }} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <input type="number" value={it.rate} min={0} step="any" onChange={e => updateItem(it.id, { rate: Number(e.target.value) })}
                        style={{ ...inp, width: 100, fontVariantNumeric: "tabular-nums" }} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <input type="number" value={it.discount_pct} min={0} max={100} step="any" onChange={e => updateItem(it.id, { discount_pct: Number(e.target.value) })}
                        style={{ ...inp, width: 55, fontVariantNumeric: "tabular-nums" }} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <select value={it.gst_pct} onChange={e => updateItem(it.id, { gst_pct: Number(e.target.value) })} style={{ ...inp, width: 65 }}>
                        {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "4px 8px", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      ₹{it.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <button type="button" onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))}
                        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button type="button" variant="ghost" size="sm" onClick={addItem} style={{ marginTop: 8 }}>+ Add Line Item</Button>

          {/* GST toggle & totals */}
          {items.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <div style={{ minWidth: 280 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <input type="checkbox" id="igst" checked={isIgst} onChange={e => setIsIgst(e.target.checked)} />
                  <label htmlFor="igst" style={{ fontSize: "0.78rem", color: "#888", cursor: "pointer" }}>Interstate supply (IGST)</label>
                  <input value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}
                    placeholder="Place of supply" style={{ ...inp, flex: 1, fontSize: "0.76rem" }} />
                </div>
                {[
                  { k: "Subtotal",       v: totals.subtotal },
                  ...(!isIgst ? [
                    { k: `CGST`, v: totals.cgst_amount },
                    { k: `SGST`, v: totals.sgst_amount },
                  ] : [
                    { k: `IGST`, v: totals.igst_amount },
                  ]),
                  { k: "Round Off",     v: totals.round_off },
                ].map(r => (
                  <div key={r.k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.78rem", color: "#888" }}>
                    <span>{r.k}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>₹{r.v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 6, fontWeight: 800, color: "#fff", fontSize: "1rem" }}>
                  <span>Grand Total</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>₹{totals.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Field label="Advance %">
                    <input type="number" value={advancePct} onChange={e => setAdvancePct(e.target.value)} min={0} max={100} placeholder="50" style={{ ...inp, maxWidth: 100 }} />
                  </Field>
                  {advancePct && (
                    <div style={{ fontSize: "0.78rem", color: "#e8620a", marginTop: 4 }}>
                      Advance: ₹{(totals.grand_total * Number(advancePct) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ── Section 7: Sponsorship Packages ──────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Sponsorship Packages" sub="Optional — shown as visual tiers in the proposal" />
          {sponsorPkgs.map((pkg, pi) => (
            <div key={pkg.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px", marginBottom: 12, borderLeft: `3px solid ${pkg.color}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                <Field label="Package Name">
                  <input value={pkg.name} onChange={e => setSponsorPkgs(prev => prev.map((x, xi) => xi === pi ? { ...x, name: e.target.value } : x))}
                    placeholder="Title Sponsor" style={inp} />
                </Field>
                <Field label="Price (₹)">
                  <input type="number" value={pkg.price} min={0} onChange={e => setSponsorPkgs(prev => prev.map((x, xi) => xi === pi ? { ...x, price: Number(e.target.value) } : x))}
                    style={{ ...inp, fontVariantNumeric: "tabular-nums" }} />
                </Field>
                <Field label="Badge Color">
                  <input type="color" value={pkg.color} onChange={e => setSponsorPkgs(prev => prev.map((x, xi) => xi === pi ? { ...x, color: e.target.value } : x))}
                    style={{ ...inp, height: 34, padding: 2, cursor: "pointer" }} />
                </Field>
                <div style={{ paddingTop: 22 }}>
                  <button type="button" onClick={() => setSponsorPkgs(prev => prev.filter((_, xi) => xi !== pi))}
                    style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18 }}>×</button>
                </div>
              </div>
              <div style={{ marginTop: 4 }}>
                <label style={label}>Benefits (one per line)</label>
                <textarea
                  value={pkg.benefits.join("\n")}
                  onChange={e => setSponsorPkgs(prev => prev.map((x, xi) => xi === pi ? { ...x, benefits: e.target.value.split("\n") } : x))}
                  rows={4} placeholder="Logo on T-Shirt&#10;Expo booth&#10;Social media posts" style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setSponsorPkgs(prev => [...prev, { id: uid(), name: "", price: 0, color: "#e8620a", benefits: [""] }])}>
            + Add Package
          </Button>
        </Card>

        {/* ── Section 8: Timeline ───────────────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Event Timeline" sub="Key milestones shown as a table in the proposal" />
          {timelineMilestones.map((m, i) => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
              <Field label="Milestone">
                <input value={m.title} onChange={e => setTimelineMilestones(prev => prev.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x))}
                  placeholder="BIB Distribution" style={inp} />
              </Field>
              <Field label="Date">
                <input type="date" value={m.date} onChange={e => setTimelineMilestones(prev => prev.map((x, xi) => xi === i ? { ...x, date: e.target.value } : x))}
                  style={inp} />
              </Field>
              <Field label="Notes">
                <input value={m.description} onChange={e => setTimelineMilestones(prev => prev.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))}
                  placeholder="Details or location" style={inp} />
              </Field>
              <div>
                <button type="button" onClick={() => setTimelineMilestones(prev => prev.filter((_, xi) => xi !== i))}
                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, marginTop: 4 }}>×</button>
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setTimelineMilestones(prev => [...prev, { id: uid(), title: "", date: "", description: "" }])}>
            + Add Milestone
          </Button>
        </Card>

        {/* ── Section 9: Payment Milestones ─────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Payment Milestones" sub="When and how much is due at each stage" />
          {paymentMilestones.map((m, i) => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 1fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
              <Field label="Label">
                <input value={m.label} onChange={e => setPaymentMilestones(prev => prev.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))}
                  placeholder="Advance payment" style={inp} />
              </Field>
              <Field label="%">
                <input type="number" value={m.percentage} min={0} max={100} onChange={e => setPaymentMilestones(prev => prev.map((x, xi) => xi === i ? { ...x, percentage: Number(e.target.value) } : x))}
                  style={{ ...inp, fontVariantNumeric: "tabular-nums" }} />
              </Field>
              <Field label="Due (days)">
                <input type="number" value={m.due_days} min={0} onChange={e => setPaymentMilestones(prev => prev.map((x, xi) => xi === i ? { ...x, due_days: Number(e.target.value) } : x))}
                  placeholder="Days before event" style={{ ...inp, fontVariantNumeric: "tabular-nums" }} />
              </Field>
              <Field label="Notes">
                <input value={m.notes} onChange={e => setPaymentMilestones(prev => prev.map((x, xi) => xi === i ? { ...x, notes: e.target.value } : x))}
                  placeholder="Before confirming booking" style={inp} />
              </Field>
              <div>
                <button type="button" onClick={() => setPaymentMilestones(prev => prev.filter((_, xi) => xi !== i))}
                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, marginTop: 4 }}>×</button>
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setPaymentMilestones(prev => [...prev, { id: uid(), label: "", percentage: 50, due_days: 30, notes: "" }])}>
            + Add Payment Milestone
          </Button>
        </Card>

        {/* ── Section 10: Terms & Conditions ───────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Payment Terms & Conditions" />
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Payment Terms Notes</label>
            <RichEditor value={paymentTermsNotes} onChange={setPaymentTermsNotes} placeholder="50% advance to confirm booking, balance 7 days before event…" />
          </div>
          <div>
            <label style={label}>Terms & Conditions</label>
            <RichEditor value={termsConditions} onChange={setTermsConditions} placeholder="This proposal is valid for 30 days…" />
          </div>
        </Card>

        {/* ── Section 11: Internal Notes ────────────────────────────────────── */}
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <SectionHead title="Notes" sub="Internal notes are not shown on the proposal PDF" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>Internal Notes (not shown to client)</label>
              <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                rows={3} placeholder="Follow up needed, contact person prefers WhatsApp…" style={{ ...inp, resize: "vertical" }} />
            </div>
            <div>
              <label style={label}>Customer Notes (shown on proposal)</label>
              <textarea value={customerNotes} onChange={e => setCustomerNotes(e.target.value)}
                rows={3} placeholder="Thank you for considering Connected Steps…" style={{ ...inp, resize: "vertical" }} />
            </div>
          </div>
        </Card>

        {/* Save bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Quotation"}
          </Button>
        </div>

      </div>
    </form>
  );
}
