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
  id:        string;
  entity:    "payment";
  amount:    number;       // in paise
  currency:  string;
  status:    RzpPaymentStatus;
  order_id:  string;
  method:    string;
  captured:  boolean;
  created_at: number;      // Unix timestamp
}

export interface RzpOrderPaymentsResponse {
  entity: "collection";
  count:  number;
  items:  RzpPayment[];
}

/**
 * Returns all payments for a Razorpay order.
 * Throws on network / auth error; returns null items array on Razorpay 404.
 */
export async function getOrderPayments(orderId: string): Promise<RzpPayment[]> {
  const res = await fetch(`${RZP_BASE}/orders/${orderId}/payments`, {
    headers: { Authorization: auth() },
    // Bypass Next.js data cache — always fetch live from Razorpay
    cache: "no-store",
  });

  if (res.status === 404) return [];     // order not found in Razorpay
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as RzpOrderPaymentsResponse;
  return data.items ?? [];
}

/**
 * Returns the single captured (successful) payment for an order, or null.
 */
export async function getCapturedPayment(orderId: string): Promise<RzpPayment | null> {
  const payments = await getOrderPayments(orderId);
  return payments.find(p => p.status === "captured") ?? null;
}
