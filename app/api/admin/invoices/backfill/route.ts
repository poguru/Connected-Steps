import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { createAndSendInvoice } from "@/lib/invoice-service";

// POST /api/admin/invoices/backfill
// Finds ALL paid event registrations and memberships that don't have invoices yet
// and generates one for each. Safe to call multiple times — idempotent.
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { send_email?: boolean };
  const sendEmail = body.send_email !== false; // default: true

  const db = getSupabaseServer();

  // ── 1. Paid event registrations without an invoice ────────────────────────
  const { data: paidRegs } = await db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, event_id, final_price, payment_status, razorpay_payment_id, razorpay_order_id, distance_category, events(title, start_date, location)")
    .in("payment_status", ["paid"])
    .eq("status", "confirmed");

  // Get registration IDs that already have invoices
  const { data: existingRegInvoices } = await db
    .from("invoices")
    .select("registration_id")
    .not("registration_id", "is", null);
  const alreadyInvoicedRegs = new Set((existingRegInvoices ?? []).map(i => i.registration_id));

  const regsToInvoice = (paidRegs ?? []).filter(r => !alreadyInvoicedRegs.has(r.id));

  // ── 2. Active memberships without an invoice ──────────────────────────────
  const { data: memberships } = await db
    .from("memberships")
    .select("user_email, plan, amount_paid, razorpay_payment_id, razorpay_order_id, started_at")
    .eq("status", "active")
    .not("razorpay_payment_id", "is", null);

  const { data: existingPayInvoices } = await db
    .from("invoices")
    .select("payment_id")
    .not("payment_id", "is", null);
  const alreadyInvoicedPayments = new Set((existingPayInvoices ?? []).map(i => i.payment_id));

  const membershipsToInvoice = (memberships ?? []).filter(m =>
    m.razorpay_payment_id && !alreadyInvoicedPayments.has(m.razorpay_payment_id)
  );

  // ── 3. Fetch user names for memberships ────────────────────────────────────
  const memberEmails = [...new Set(membershipsToInvoice.map(m => m.user_email))];
  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name")
    .in("email", memberEmails);
  const nameMap = new Map((users ?? []).map(u => [u.email, `${u.first_name} ${u.last_name}`.trim()]));

  const PLAN_LABELS: Record<string, string> = {
    monthly: "Monthly Membership", quarterly: "3-Month Membership",
    biannual: "6-Month Membership", annual: "Annual Membership",
  };

  // ── 4. Generate invoices ───────────────────────────────────────────────────
  let regGenerated = 0, regFailed = 0;
  let memGenerated = 0, memFailed = 0;
  const details: { type: string; id: string; status: string; reason?: string }[] = [];

  // Event registration invoices
  type RegRow = {
    id: string; registration_code: string; user_email: string; user_name: string;
    event_id: string; final_price: number | null; razorpay_payment_id: string | null;
    razorpay_order_id: string | null; distance_category: string | null;
    events: { title: string; start_date: string; location: string } | null;
  };
  for (const reg of (regsToInvoice as unknown as RegRow[])) {
    try {
      const ev  = reg.events;
      const inv = await createAndSendInvoice({
        userEmail:       reg.user_email,
        userName:        reg.user_name,
        productName:     ev?.title ?? "Event Registration",
        productType:     "event",
        totalPaidRupees: reg.final_price ?? 0,
        paymentId:       reg.razorpay_payment_id ?? undefined,
        orderId:         reg.razorpay_order_id   ?? undefined,
        registrationId:  reg.id,
        eventId:         reg.event_id,
        eventDate:       ev?.start_date,
        eventVenue:      ev?.location,
      });
      if (inv) { regGenerated++; details.push({ type: "event", id: reg.registration_code, status: "generated" }); }
      else      { regFailed++;   details.push({ type: "event", id: reg.registration_code, status: "failed", reason: "createAndSendInvoice returned null" }); }
    } catch (e: unknown) {
      regFailed++;
      details.push({ type: "event", id: reg.registration_code, status: "failed", reason: String(e) });
    }

    // Small pause to avoid hammering SES rate limit
    await new Promise(r => setTimeout(r, 1200));
  }

  // Membership invoices
  for (const mem of membershipsToInvoice) {
    try {
      const userName = nameMap.get(mem.user_email) || mem.user_email;
      const inv = await createAndSendInvoice({
        userEmail:       mem.user_email,
        userName,
        productName:     PLAN_LABELS[mem.plan] ?? `${mem.plan} Membership`,
        productType:     "membership",
        totalPaidRupees: (mem.amount_paid ?? 0) / 100, // paise → rupees
        paymentId:       mem.razorpay_payment_id ?? undefined,
        orderId:         mem.razorpay_order_id   ?? undefined,
      });
      if (inv) { memGenerated++; details.push({ type: "membership", id: mem.razorpay_payment_id ?? mem.user_email, status: "generated" }); }
      else      { memFailed++;   details.push({ type: "membership", id: mem.razorpay_payment_id ?? mem.user_email, status: "failed" }); }
    } catch (e: unknown) {
      memFailed++;
      details.push({ type: "membership", id: mem.user_email, status: "failed", reason: String(e) });
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  return NextResponse.json({
    summary: {
      event_registrations: { found: regsToInvoice.length,        generated: regGenerated, failed: regFailed },
      memberships:         { found: membershipsToInvoice.length,  generated: memGenerated, failed: memFailed },
      total_generated:     regGenerated + memGenerated,
      total_failed:        regFailed    + memFailed,
      already_had_invoice: alreadyInvoicedRegs.size + alreadyInvoicedPayments.size,
    },
    details,
  });
}

// GET — preview: show how many transactions need invoices (no generation)
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const [paidRegsRes, membershipsRes, existingRegRes, existingPayRes] = await Promise.all([
    db.from("event_registrations").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("status", "confirmed"),
    db.from("memberships").select("user_email", { count: "exact", head: true }).eq("status", "active").not("razorpay_payment_id", "is", null),
    db.from("invoices").select("registration_id", { count: "exact", head: true }).not("registration_id", "is", null),
    db.from("invoices").select("payment_id", { count: "exact", head: true }).not("payment_id", "is", null),
  ]);

  return NextResponse.json({
    paid_event_registrations: paidRegsRes.count ?? 0,
    active_memberships_with_payment: membershipsRes.count ?? 0,
    already_invoiced_registrations: existingRegRes.count ?? 0,
    already_invoiced_payments: existingPayRes.count ?? 0,
    estimate_to_generate: Math.max(0,
      ((paidRegsRes.count ?? 0) - (existingRegRes.count ?? 0)) +
      ((membershipsRes.count ?? 0) - (existingPayRes.count ?? 0))
    ),
  });
}
