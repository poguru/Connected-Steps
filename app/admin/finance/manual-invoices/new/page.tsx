"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, Button, Alert, Spinner } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id:           string;
  description:  string;
  quantity:     number;
  unit:         string;
  rate:         number;
  discount_pct: number;
  gst_pct:      number;
  amount:       number;
}

interface Totals {
  subtotal:       number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount:    number;
  sgst_amount:    number;
  igst_amount:    number;
  round_off:      number;
  grand_total:    number;
  balance_due:    number;
}

// ── GST Calculation ───────────────────────────────────────────────────────────

function calcItem(item: LineItem): number {
  const base = item.quantity * item.rate;
  return Math.max(0, base * (1 - item.discount_pct / 100));
}

function calcTotals(items: LineItem[], isIgst: boolean, advanceReceived: number): Totals {
  let subtotal = 0;
  let discountTotal = 0;
  let cgst = 0, sgst = 0, igst = 0;

  for (const it of items) {
    const base    = it.quantity * it.rate;
    const disc    = base * (it.discount_pct / 100);
    const taxable = base - disc;
    subtotal      += base;
    discountTotal += disc;
    if (isIgst) {
      igst += taxable * (it.gst_pct / 100);
    } else {
      cgst += taxable * (it.gst_pct / 200);
      sgst += taxable * (it.gst_pct / 200);
    }
  }

  const taxableAmount = subtotal - discountTotal;
  const raw           = taxableAmount + cgst + sgst + igst;
  const rounded       = Math.round(raw);
  const roundOff      = +(rounded - raw).toFixed(2);
  const grandTotal    = rounded;

  return {
    subtotal:       +subtotal.toFixed(2),
    discount_amount: +discountTotal.toFixed(2),
    taxable_amount: +taxableAmount.toFixed(2),
    cgst_amount:    +cgst.toFixed(2),
    sgst_amount:    +sgst.toFixed(2),
    igst_amount:    +igst.toFixed(2),
    round_off:      roundOff,
    grand_total:    grandTotal,
    balance_due:    Math.max(0, grandTotal - advanceReceived),
  };
}

// ── Style helpers ─────────────────────────────────────────────────────────────

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

// ── Invoice form inner ────────────────────────────────────────────────────────

function InvoiceFormInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editId       = searchParams.get("edit");

  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [alert,   setAlert]   = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Invoice metadata
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate,   setInvoiceDate]   = useState(new Date().toISOString().slice(0, 10));
  const [dueDate,       setDueDate]       = useState("");
  const [invoiceType,   setInvoiceType]   = useState("tax_invoice");
  const [currency,      setCurrency]      = useState("INR");
  const [placeOfSupply, setPlaceOfSupply] = useState("Telangana");
  const [isIgst,        setIsIgst]        = useState(false);

  // Client
  const [clientType,    setClientType]    = useState("corporate");
  const [companyName,   setCompanyName]   = useState("");
  const [clientName,    setClientName]    = useState("");
  const [clientGst,     setClientGst]     = useState("");
  const [clientPan,     setClientPan]     = useState("");
  const [clientEmail,   setClientEmail]   = useState("");
  const [clientPhone,   setClientPhone]   = useState("");
  const [billingAddr,   setBillingAddr]   = useState("");
  const [clientState,   setClientState]   = useState("");
  const [clientCountry, setClientCountry] = useState("India");
  const [clientPincode, setClientPincode] = useState("");

  // Additional
  const [paymentTerms,   setPaymentTerms]   = useState("");
  const [advanceReceived, setAdvanceReceived] = useState(0);
  const [paymentMethod,  setPaymentMethod]  = useState("");
  const [poNumber,       setPoNumber]       = useState("");
  const [quotationRef,   setQuotationRef]   = useState("");
  const [projectName,    setProjectName]    = useState("");
  const [servicePeriod,  setServicePeriod]  = useState("");
  const [internalNotes,  setInternalNotes]  = useState("");
  const [customerNotes,  setCustomerNotes]  = useState("");
  const [termsConditions, setTermsConditions] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("Thank you for your business!");

  // Line items
  const [items, setItems] = useState<LineItem[]>([{
    id: crypto.randomUUID(), description: "", quantity: 1, unit: "",
    rate: 0, discount_pct: 0, gst_pct: 18, amount: 0,
  }]);

  const totals = calcTotals(items, isIgst, advanceReceived);

  // Load existing invoice for editing
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const res  = await fetch(`/api/admin/manual-invoices/${editId}`);
      const data = await res.json();
      if (!res.ok || !data.invoice) { setLoading(false); return; }
      const inv = data.invoice;
      setInvoiceDate(inv.invoice_date ?? "");
      setDueDate(inv.due_date ?? "");
      setInvoiceType(inv.invoice_type ?? "tax_invoice");
      setCurrency(inv.currency ?? "INR");
      setPlaceOfSupply(inv.place_of_supply ?? "");
      setIsIgst(inv.is_igst ?? false);
      setClientType(inv.client_type ?? "corporate");
      setCompanyName(inv.company_name ?? "");
      setClientName(inv.client_name ?? "");
      setClientGst(inv.client_gst ?? "");
      setClientPan(inv.client_pan ?? "");
      setClientEmail(inv.client_email ?? "");
      setClientPhone(inv.client_phone ?? "");
      setBillingAddr(inv.billing_address ?? "");
      setClientState(inv.client_state ?? "");
      setClientCountry(inv.client_country ?? "India");
      setClientPincode(inv.client_pincode ?? "");
      setPaymentTerms(inv.payment_terms ?? "");
      setAdvanceReceived(Number(inv.advance_received ?? 0));
      setPaymentMethod(inv.payment_method ?? "");
      setPoNumber(inv.po_number ?? "");
      setQuotationRef(inv.quotation_ref ?? "");
      setProjectName(inv.project_name ?? "");
      setServicePeriod(inv.service_period ?? "");
      setInternalNotes(inv.internal_notes ?? "");
      setCustomerNotes(inv.customer_notes ?? "");
      setTermsConditions(inv.terms_conditions ?? "");
      setThankYouMessage(inv.thank_you_message ?? "");
      if (data.items?.length) {
        setItems(data.items.map((it: Record<string, unknown>) => ({
          id:           crypto.randomUUID(),
          description:  String(it.description ?? ""),
          quantity:     Number(it.quantity    ?? 1),
          unit:         String(it.unit        ?? ""),
          rate:         Number(it.rate        ?? 0),
          discount_pct: Number(it.discount_pct ?? 0),
          gst_pct:      Number(it.gst_pct    ?? 18),
          amount:       Number(it.amount      ?? 0),
        })));
      }
      setLoading(false);
    })();
  }, [editId]);

  function updateItem(id: string, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, [field]: value };
      updated.amount = +calcItem(updated).toFixed(2);
      return updated;
    }));
  }

  function addItem() {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(), description: "", quantity: 1, unit: "",
      rate: 0, discount_pct: 0, gst_pct: 18, amount: 0,
    }]);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(it => it.id !== id));
  }

  async function save() {
    if (!clientName.trim()) { setAlert({ type: "error", msg: "Client name is required" }); return; }
    if (items.every(it => !it.description.trim())) { setAlert({ type: "error", msg: "Add at least one line item" }); return; }

    setSaving(true); setAlert(null);

    const payload = {
      ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
      invoice_date: invoiceDate, due_date: dueDate || null,
      invoice_type: invoiceType, currency, place_of_supply: placeOfSupply || null,
      is_igst: isIgst, client_type: clientType, company_name: companyName || null,
      client_name: clientName, client_gst: clientGst || null, client_pan: clientPan || null,
      client_email: clientEmail || null, client_phone: clientPhone || null,
      billing_address: billingAddr || null, client_state: clientState || null,
      client_country: clientCountry || "India", client_pincode: clientPincode || null,
      payment_terms: paymentTerms || null, advance_received: advanceReceived,
      payment_method: paymentMethod || null,
      po_number: poNumber || null, quotation_ref: quotationRef || null,
      project_name: projectName || null, service_period: servicePeriod || null,
      internal_notes: internalNotes || null, customer_notes: customerNotes || null,
      terms_conditions: termsConditions || null, thank_you_message: thankYouMessage || null,
      ...totals,
      items: items.filter(it => it.description.trim()).map(({ id: _id, ...rest }) => rest),
    };

    const url    = editId ? `/api/admin/manual-invoices/${editId}` : "/api/admin/manual-invoices";
    const method = editId ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data   = await res.json();
    setSaving(false);

    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Save failed" }); return; }
    router.push(`/admin/finance/manual-invoices/${data.invoice.id}`);
  }

  if (loading) return <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>;

  const fmtR = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div style={{ padding: "1.5rem", maxWidth: 980, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/finance/manual-invoices" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>← Manual Invoices</Link>
      </div>
      <h1 style={{ margin: "0 0 20px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>
        {editId ? "✏️ Edit Invoice" : "🧾 New Invoice"}
      </h1>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>{alert.msg}</Alert>}

      {/* ── Invoice Metadata ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={section}>Invoice Details</div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          <div>
            <label style={label}>Invoice Number <span style={{ color: "#555", fontWeight: 400 }}>(auto if blank)</span></label>
            <input style={inp} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="CS-INV-2026-000001" />
          </div>
          <div>
            <label style={label}>Invoice Type</label>
            <select style={inp} value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
              <option value="tax_invoice">Tax Invoice</option>
              <option value="proforma">Proforma Invoice</option>
              <option value="credit_note">Credit Note</option>
              <option value="debit_note">Debit Note</option>
            </select>
          </div>
          <div>
            <label style={label}>Currency</label>
            <select style={inp} value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="INR">INR — Indian Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>
        </div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          <div>
            <label style={label}>Invoice Date</label>
            <input type="date" style={inp} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
          </div>
          <div>
            <label style={label}>Due Date</label>
            <input type="date" style={inp} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div>
            <label style={label}>Place of Supply</label>
            <input style={inp} value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)} placeholder="e.g. Telangana" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.82rem", color: "rgba(255,255,255,0.7)" }}>
            <input type="checkbox" checked={isIgst} onChange={e => setIsIgst(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "#e8620a" }} />
            Apply IGST (inter-state supply — use instead of CGST + SGST)
          </label>
        </div>
      </Card>

      {/* ── Client Details ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={section}>Client Details</div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          <div>
            <label style={label}>Client Type</label>
            <select style={inp} value={clientType} onChange={e => setClientType(e.target.value)}>
              {["corporate","individual","government","ngo","sponsor","other"].map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Company Name</label>
            <input style={inp} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corp Ltd." />
          </div>
          <div>
            <label style={label}>Client / Contact Name <span style={{ color: "#f87171" }}>*</span></label>
            <input style={inp} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full name" />
          </div>
        </div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          <div>
            <label style={label}>GST Number</label>
            <input style={inp} value={clientGst} onChange={e => setClientGst(e.target.value.toUpperCase())} placeholder="29AABCU9603R1ZX" />
          </div>
          <div>
            <label style={label}>PAN</label>
            <input style={inp} value={clientPan} onChange={e => setClientPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
          </div>
          <div>
            <label style={label}>Email</label>
            <input type="email" style={inp} value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="billing@company.com" />
          </div>
        </div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          <div>
            <label style={label}>Phone</label>
            <input style={inp} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+91 9876543210" />
          </div>
          <div>
            <label style={label}>State</label>
            <input style={inp} value={clientState} onChange={e => setClientState(e.target.value)} placeholder="Telangana" />
          </div>
          <div>
            <label style={label}>Pincode</label>
            <input style={inp} value={clientPincode} onChange={e => setClientPincode(e.target.value)} placeholder="500001" />
          </div>
        </div>
        <div>
          <label style={label}>Billing Address</label>
          <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={billingAddr}
            onChange={e => setBillingAddr(e.target.value)} placeholder="Full billing address" />
        </div>
      </Card>

      {/* ── Line Items ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={section}>Line Items</div>
          <Button size="sm" variant="outline" onClick={addItem}>+ Add Row</Button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["#", "Description", "Unit", "Qty", "Rate (₹)", "Disc %", "GST %", "Amount (₹)", ""].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "6px 8px", color: "#555", fontSize: "0.75rem" }}>{idx + 1}</td>
                  <td style={{ padding: "4px 8px", minWidth: 200 }}>
                    <input style={inp} value={it.description}
                      onChange={e => updateItem(it.id, "description", e.target.value)}
                      placeholder="Service or product description" />
                  </td>
                  <td style={{ padding: "4px 6px", minWidth: 80 }}>
                    <input style={inp} value={it.unit}
                      onChange={e => updateItem(it.id, "unit", e.target.value)}
                      placeholder="hrs, pcs" />
                  </td>
                  <td style={{ padding: "4px 6px", minWidth: 70 }}>
                    <input type="number" style={inp} value={it.quantity} min={0} step="0.01"
                      onChange={e => updateItem(it.id, "quantity", Number(e.target.value))} />
                  </td>
                  <td style={{ padding: "4px 6px", minWidth: 90 }}>
                    <input type="number" style={inp} value={it.rate} min={0} step="0.01"
                      onChange={e => updateItem(it.id, "rate", Number(e.target.value))} />
                  </td>
                  <td style={{ padding: "4px 6px", minWidth: 70 }}>
                    <input type="number" style={inp} value={it.discount_pct} min={0} max={100} step="0.01"
                      onChange={e => updateItem(it.id, "discount_pct", Number(e.target.value))} />
                  </td>
                  <td style={{ padding: "4px 6px", minWidth: 80 }}>
                    <select style={inp} value={it.gst_pct} onChange={e => updateItem(it.id, "gst_pct", Number(e.target.value))}>
                      {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "4px 8px", color: "#fff", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>
                    ₹{fmtR(it.amount)}
                  </td>
                  <td style={{ padding: "4px 6px" }}>
                    <button onClick={() => removeItem(it.id)} disabled={items.length <= 1}
                      style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, padding: 2 }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="ghost" onClick={addItem}>+ Add Another Item</Button>
        </div>

        {/* GST Summary */}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ minWidth: 280, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 16px" }}>
            {[
              { label: "Subtotal",        val: totals.subtotal,        color: "rgba(255,255,255,0.7)" },
              { label: "Discount",        val: -totals.discount_amount, color: "#f87171", hide: totals.discount_amount === 0 },
              { label: "Taxable Amount",  val: totals.taxable_amount,  color: "rgba(255,255,255,0.7)" },
              { label: isIgst ? "IGST" : "CGST", val: isIgst ? totals.igst_amount : totals.cgst_amount, color: "#fb923c" },
              ...(!isIgst ? [{ label: "SGST", val: totals.sgst_amount, color: "#fb923c" }] : []),
              { label: "Round Off",       val: totals.round_off,       color: "rgba(255,255,255,0.4)", hide: totals.round_off === 0 },
            ].filter(r => !r.hide).map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.82rem" }}>
                <span style={{ color: r.color }}>{r.label}</span>
                <span style={{ color: r.color, fontVariantNumeric: "tabular-nums" }}>
                  {r.val < 0 ? `−₹${fmtR(-r.val)}` : `₹${fmtR(r.val)}`}
                </span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#fff" }}>Grand Total</span>
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>₹{fmtR(totals.grand_total)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Payment & Additional ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={section}>Payment & Additional Details</div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          <div>
            <label style={label}>Payment Terms</label>
            <input style={inp} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="Net 30 days" />
          </div>
          <div>
            <label style={label}>Advance Received (₹)</label>
            <input type="number" style={inp} value={advanceReceived} min={0}
              onChange={e => setAdvanceReceived(Number(e.target.value))} />
          </div>
          <div>
            <label style={label}>Payment Method</label>
            <select style={inp} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="">— Select —</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
            </select>
          </div>
        </div>
        <div style={{ ...grid3, marginBottom: 14 }}>
          <div>
            <label style={label}>PO Number</label>
            <input style={inp} value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="PO-2026-001" />
          </div>
          <div>
            <label style={label}>Quotation Reference</label>
            <input style={inp} value={quotationRef} onChange={e => setQuotationRef(e.target.value)} placeholder="QT-2026-001" />
          </div>
          <div>
            <label style={label}>Project Name</label>
            <input style={inp} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Event Management" />
          </div>
        </div>
        <div style={{ ...grid2, marginBottom: 14 }}>
          <div>
            <label style={label}>Service Period</label>
            <input style={inp} value={servicePeriod} onChange={e => setServicePeriod(e.target.value)} placeholder="Aug 1 – Aug 15, 2026" />
          </div>
          <div>
            <label style={label}>Thank You Message</label>
            <input style={inp} value={thankYouMessage} onChange={e => setThankYouMessage(e.target.value)} />
          </div>
        </div>
        <div style={{ ...grid2, marginBottom: 14 }}>
          <div>
            <label style={label}>Customer Notes (visible on invoice)</label>
            <textarea style={{ ...inp, height: 70, resize: "vertical" }} value={customerNotes}
              onChange={e => setCustomerNotes(e.target.value)} placeholder="Payment instructions, bank details, etc." />
          </div>
          <div>
            <label style={label}>Internal Notes (not on invoice)</label>
            <textarea style={{ ...inp, height: 70, resize: "vertical" }} value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)} placeholder="Private notes for your team" />
          </div>
        </div>
        <div>
          <label style={label}>Terms & Conditions</label>
          <textarea style={{ ...inp, height: 70, resize: "vertical" }} value={termsConditions}
            onChange={e => setTermsConditions(e.target.value)} placeholder="Goods once sold will not be taken back. Subject to Hyderabad jurisdiction." />
        </div>
      </Card>

      {/* ── Balance Summary ── */}
      {advanceReceived > 0 && (
        <Card style={{ padding: "0.875rem 1.25rem", marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}>Grand Total: <strong style={{ color: "#fff" }}>₹{fmtR(totals.grand_total)}</strong></span>
          <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}>Advance: <strong style={{ color: "#4ade80" }}>₹{fmtR(advanceReceived)}</strong></span>
          <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#facc15" }}>Balance Due: ₹{fmtR(totals.balance_due)}</span>
        </Card>
      )}

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Link href="/admin/finance/manual-invoices"><Button size="sm" variant="ghost">Cancel</Button></Link>
        <Button onClick={save} loading={saving} variant="primary">
          {editId ? "Save Changes" : "Create Invoice"}
        </Button>
      </div>
    </div>
  );
}

// ── Page export with Suspense ─────────────────────────────────────────────────

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>}>
      <InvoiceFormInner />
    </Suspense>
  );
}
