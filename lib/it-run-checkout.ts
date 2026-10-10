/**
 * Checkout groups: several registrations paid by one Razorpay order.
 *
 * A group is valid when every registration belongs to the same event and the same lead email, is still
 * payable (pending or payment in progress, never paid, free or failed), and no two of them are already tied to
 * a different order. The order amount is the sum of the registrations' final prices, in paise.
 */

export interface CheckoutRegistration {
  id: string;
  registration_code: string;
  event_id: string;
  lead_email: string;
  final_price: number;
  payment_status: string;
  razorpay_order_id: string | null;
}

export const MAX_CHECKOUT_REGISTRATIONS = 10;

export type CheckoutCheck =
  | { ok: true; totalPaise: number; existingOrderId: string | null }
  | { ok: false; status: number; error: string };

/** Checks a set of registrations that is about to be paid together. Refuses anything that would be unsafe to charge. */
export function checkCheckoutGroup(
  requestedIds: string[],
  found: CheckoutRegistration[],
): CheckoutCheck {
  const unique = Array.from(new Set(requestedIds));
  if (unique.length === 0) return { ok: false, status: 400, error: "No registrations to pay for." };
  if (unique.length > MAX_CHECKOUT_REGISTRATIONS) {
    return { ok: false, status: 400, error: `A checkout can hold at most ${MAX_CHECKOUT_REGISTRATIONS} registrations.` };
  }
  if (found.length !== unique.length) {
    return { ok: false, status: 404, error: "One of the registrations could not be found." };
  }

  const first = found[0];
  const email = first.lead_email.trim().toLowerCase();
  for (const r of found) {
    if (r.event_id !== first.event_id) {
      return { ok: false, status: 400, error: "All registrations in one payment must be for the same event." };
    }
    if (r.lead_email.trim().toLowerCase() !== email) {
      return { ok: false, status: 400, error: "All registrations in one payment must be made with the same email address." };
    }
    if (r.payment_status === "paid" || r.payment_status === "free") {
      return { ok: false, status: 409, error: `${r.registration_code} is already paid.` };
    }
    if (r.payment_status === "failed" || r.payment_status === "expired") {
      return { ok: false, status: 409, error: `${r.registration_code} needs to be registered again before it can be paid.` };
    }
    if (r.final_price <= 0) {
      return { ok: false, status: 400, error: `${r.registration_code} is free and does not need payment.` };
    }
  }

  // Either none has an order yet, or they all share the same one (a retry of this checkout)
  const orders = Array.from(new Set(found.map(r => r.razorpay_order_id).filter((o): o is string => !!o)));
  const anyWithoutOrder = found.some(r => !r.razorpay_order_id);
  if (orders.length > 1 || (orders.length === 1 && anyWithoutOrder)) {
    return { ok: false, status: 409, error: "These registrations are already in different payments. Pay for each one separately." };
  }

  const totalPaise = found.reduce((sum, r) => sum + r.final_price * 100, 0);
  if (totalPaise < 100) return { ok: false, status: 400, error: "Amount too low" };

  return { ok: true, totalPaise, existingOrderId: orders[0] ?? null };
}

/** True when a captured payment's amount is exactly the amount the registrations owe. */
export function paymentCoversRegistrations(amountPaise: number, registrations: Array<{ final_price: number }>): boolean {
  const owed = registrations.reduce((sum, r) => sum + r.final_price * 100, 0);
  return owed > 0 && amountPaise === owed;
}

export interface SessionRegistration {
  id: string;
  code: string;
  finalPrice: number;
  categoryName: string;
}

/**
 * The registrations one payment covers in a checkout: those already submitted in the session, plus the one being
 * filled in. Free registrations are left out (already confirmed, nothing to pay). Null means an ordinary
 * single-category registration: the payment uses the current registration only.
 */
export function payableCheckout(
  session: SessionRegistration[],
  current: SessionRegistration | null,
): SessionRegistration[] | null {
  if (session.length === 0 || !current) return null;
  const others = session.filter(r => r.id !== current.id && r.finalPrice > 0);
  return current.finalPrice > 0 ? [...others, current] : others;
}
