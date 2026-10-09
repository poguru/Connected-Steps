"use client";

import { useState } from "react";

// Change category for one registration. Options and prices come from the server.
//  - Same price: applied immediately.
//  - Upgrade: the difference is paid through Razorpay. The category changes only after the server verifies the payment.
//  - Downgrade: not available online yet (support message).

interface Option {
  id: string;
  name: string;
  distanceKm: number;
  priceRupees: number;
  change: "same" | "upgrade" | "downgrade";
  availability: "available" | "full";
  allowed: boolean;
  note: string | null;
}

interface Loaded {
  current: { id: string; name: string; priceRupees: number; distanceKm: number } | null;
  options: Option[];
}

interface PaymentStart {
  kind: "payment";
  changeId: string;
  orderId: string;
  amount: number;
  currency: string;
  key: string;
  toCategory: { id: string; name: string };
}

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };

const ACCENT = "#e8620a";

function loadCheckout(): Promise<void> {
  return new Promise(resolve => {
    if ((window as unknown as { Razorpay?: RazorpayCtor }).Razorpay) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

export default function CategoryChangeButton({ registrationId }: { registrationId: string }) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<Loaded | null>(null);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState("");
  const [busy, setBusy]       = useState(false);

  const base = `/api/it-run/registrations/${registrationId}/category`;

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (data) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(base, { cache: "no-store" });
      const body = await res.json().catch(() => ({})) as Partial<Loaded> & { error?: string };
      if (!res.ok) { setError(body.error ?? "We couldn't load categories right now. Please try again."); return; }
      setData(body as Loaded);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function payDifference(start: PaymentStart) {
    await loadCheckout();
    const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
    if (!Razorpay) { setError("The payment window could not be opened. Check your connection and try again."); return; }

    const rz = new Razorpay({
      key: start.key,
      amount: start.amount,
      currency: start.currency,
      order_id: start.orderId,
      name: "Connected Steps",
      description: `Change to ${start.toCategory.name}`,
      handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        // The category changes only here, after the server has verified the payment
        const res = await fetch(`${base}/verify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changeId: start.changeId, orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature,
          }),
        });
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.ok) {
          setDone(`Your category is now ${start.toCategory.name}. You paid the difference, and your registration ID and QR code are unchanged. Refresh to see the update.`);
          setData(null);
          setOpen(false);
        } else {
          setError(body.error ?? "We could not confirm the payment yet. Please refresh in a moment.");
        }
      },
      modal: {
        // Closing checkout without paying releases the held seat
        ondismiss: () => { void fetch(`${base}/cancel`, { method: "POST" }).catch(() => {}); },
      },
    });
    rz.open();
  }

  async function choose(opt: Option) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: opt.id }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string; kind?: string; category?: { name: string } } & Partial<PaymentStart>;
      if (!res.ok) { setError(body.error ?? "The change could not be made. Please try again."); return; }
      if (body.kind === "payment" && body.orderId && body.changeId) {
        await payDifference(body as PaymentStart);
        return;
      }
      setDone(`Your category is now ${body.category?.name ?? opt.name}. Your registration ID and QR code are unchanged. Refresh to see the update.`);
      setData(null);
      setOpen(false);
    } catch {
      setError("We couldn't reach the server. Your category has not been changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {done && <div role="status" style={{ fontSize: 13, color: "#10b981", marginBottom: 8, lineHeight: 1.5 }}>{done}</div>}
      <button type="button" onClick={toggle} aria-expanded={open}
        style={{ minHeight: 40, padding: "8px 14px", borderRadius: 8, background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
        {open ? "Hide category options" : "Change category"}
      </button>

      {open && (
        <div style={{ marginTop: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 14 }}>
          {loading && <div style={{ fontSize: 13, color: "#888" }}>Loading categories…</div>}
          {error && <div role="alert" style={{ fontSize: 13, color: "#f87171", marginBottom: 8, lineHeight: 1.5 }}>{error}</div>}
          {data && (
            <>
              {data.current && (
                <div style={{ fontSize: 13, color: "#ccc", marginBottom: 10 }}>
                  Current: <strong style={{ color: "#fff" }}>{data.current.name}</strong> · ₹{data.current.priceRupees}
                </div>
              )}
              {data.options.length === 0 && (
                <div style={{ fontSize: 13, color: "#888" }}>No other categories are available for this registration.</div>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {data.options.map(opt => (
                  <div key={opt.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#161616", borderRadius: 10, padding: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{opt.name}</div>
                      <div style={{ fontSize: 12, color: "#888" }}>{opt.distanceKm} km · ₹{opt.priceRupees}</div>
                      {opt.note && <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4, lineHeight: 1.5 }}>{opt.note}</div>}
                    </div>
                    {opt.allowed ? (
                      <button type="button" disabled={busy} onClick={() => choose(opt)}
                        style={{ minHeight: 40, padding: "8px 14px", borderRadius: 8, background: ACCENT, border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}>
                        {busy ? "Please wait…" : opt.change === "upgrade" ? "Pay difference" : "Switch to this"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "#666" }}>{opt.availability === "full" ? "Full" : "Not available online"}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
