/**
 * Razorpay server-side API client.
 * Uses HTTP Basic Auth (key_id : key_secret).
 *
 * Only reads payment/order data — never creates or mutates anything.
 * Used by the admin reconciliation tool and the webhook handler.
 */

const RZP_BASE = "https://api.razorpay.com/v1";

function auth(): string {
  const key    = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

export type RzpPaymentStatus = "created" | "authorized" | "captured" | "refunded" | "failed";

export interface RzpPayment {
  id:           string;
  entity:       "payment";
  amount:       number;       // in paise
  currency:     string;
  status:       RzpPaymentStatus;
  order_id:     string | null;
  method:       string;       // upi | card | netbanking | wallet
  captured:     boolean;
  created_at:   number;       // Unix timestamp
  email?:       string;
  contact?:     string;       // phone
  description?: string;
  notes?:       Record<string, string>;
  acquirer_data?: {
    upi_transaction_id?: string;   // UTR visible on PhonePe / bank apps
    bank_transaction_id?: string;
    rrn?: string;                  // Retrieval Reference Number (= UTR for UPI)
  };
  error_code?:  string;
  error_description?: string;
}

export interface RzpOrder {
  id:          string;
  entity:      "order";
  amount:      number;
  amount_paid: number;
  amount_due:  number;
  currency:    string;
  status:      "created" | "attempted" | "paid";
  attempts:    number;
  receipt:     string | null;
  notes:       Record<string, string>;
  created_at:  number;
}

export interface RzpOrderPaymentsResponse {
  entity: "collection";
  count:  number;
  items:  RzpPayment[];
}

// ── Per-entity fetches ─────────────────────────────────────────────────────────

/** Fetch a single payment by its Razorpay payment_id (pay_xxx). */
export async function getPayment(paymentId: string): Promise<RzpPayment | null> {
  const res = await fetch(`${RZP_BASE}/payments/${paymentId}`, {
    headers: { Authorization: auth() },
    cache:   "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Razorpay API ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<RzpPayment>;
}

/** Fetch a single order by its Razorpay order_id (order_xxx). */
export async function getOrder(orderId: string): Promise<RzpOrder | null> {
  const res = await fetch(`${RZP_BASE}/orders/${orderId}`, {
    headers: { Authorization: auth() },
    cache:   "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Razorpay API ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<RzpOrder>;
}

/**
 * Returns all payments for a Razorpay order.
 * Throws on network / auth error; returns empty array on Razorpay 404.
 */
export async function getOrderPayments(orderId: string): Promise<RzpPayment[]> {
  const res = await fetch(`${RZP_BASE}/orders/${orderId}/payments`, {
    headers: { Authorization: auth() },
    cache:   "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Razorpay API ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json() as RzpOrderPaymentsResponse;
  return data.items ?? [];
}

/** Returns the single captured (successful) payment for an order, or null. */
export async function getCapturedPayment(orderId: string): Promise<RzpPayment | null> {
  const payments = await getOrderPayments(orderId);
  return payments.find(p => p.status === "captured") ?? null;
}

// ── Search / reconciliation helpers ───────────────────────────────────────────

/**
 * Fetch recent payments, optionally filtered by email or contact.
 * Razorpay API supports: from/to (Unix), count (max 100), email, contact.
 * Used by the admin reconciliation tool when we have user contact info but
 * no payment_id or order_id.
 */
export async function searchPayments(opts: {
  email?:   string;
  contact?: string;           // phone number
  from?:    number;           // Unix timestamp
  count?:   number;           // default 20, max 100
}): Promise<RzpPayment[]> {
  const params = new URLSearchParams();
  if (opts.email)   params.set("email",   opts.email);
  if (opts.contact) params.set("contact", opts.contact);
  if (opts.from)    params.set("from",    String(opts.from));
  params.set("count", String(Math.min(opts.count ?? 20, 100)));

  const res = await fetch(`${RZP_BASE}/payments?${params.toString()}`, {
    headers: { Authorization: auth() },
    cache:   "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json() as { entity: string; count: number; items: RzpPayment[] };
  return data.items ?? [];
}

/**
 * Search for a payment by UPI Transaction ID (UTR / RRN).
 * The UTR appears in acquirer_data.upi_transaction_id or acquirer_data.rrn.
 * We have to fetch recent payments and filter client-side since Razorpay
 * API does not support direct UTR search.
 *
 * Searches the last 100 payments from the past 30 days.
 */
export async function findPaymentByUTR(utr: string): Promise<RzpPayment | null> {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const payments = await searchPayments({ from: thirtyDaysAgo, count: 100 });

  const cleaned = utr.replace(/\s/g, "").toLowerCase();
  return payments.find(p => {
    const acq = p.acquirer_data ?? {};
    return (
      (acq.upi_transaction_id ?? "").toLowerCase() === cleaned ||
      (acq.rrn                ?? "").toLowerCase() === cleaned ||
      (acq.bank_transaction_id ?? "").toLowerCase() === cleaned
    );
  }) ?? null;
}
