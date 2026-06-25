import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { enqueueJob } from "@/lib/job-queue";

// POST /api/admin/invoices/backfill
// Finds ALL paid event registrations and memberships that don't have invoices yet
// and generates one for each. Safe to call multiple times — idempotent.
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // ── 1. Paid event registrations without an invoice ────────────────────────
  const { data: paidRegs } = await db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, event_id, final_price, razorpay_payment_id, razorpay_order_id, events(title, start_date, location)")
    .eq("payment_status", "paid")
    .eq("status", "confirmed");

  const { data: existingRegInvoices } = await db
    .from("invoices")
    .select("registration_id")
    .not("registration_id", "is", null);
  const alreadyInvoicedRegs = new Set((existingRegInvoices ?? []).map(i => i.registration_id));

  const regsToInvoice = (paidRegs ?? []).filter(r => !alreadyInvoicedRegs.has(r.id));

  // ── 2. Active memberships without an invoice ──────────────────────────────
  const { data: memberships } = await db
    .from("memberships")
    .select("user_email, plan, amount_paid, razorpay_payment_id, razorpay_order_id")
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

  // ── 4. Enqueue one bulk_invoice job per missing invoice ───────────────────
  // Idempotency key prevents double-queuing if admin clicks backfill twice.
  // The worker processes jobs at ≤20/min — no SES rate-limit hammering.
  let regQueued = 0, memQueued = 0;

  type RegRow = {
    id: string; registration_code: string; user_email: string; user_name: string;
    event_id: string; final_price: number | null; razorpay_payment_id: string | null;
    razorpay_order_id: string | null;
    events: { title: string; start_date: string; location: string } | null;
  };

  for (const reg of (regsToInvoice as unknown as RegRow[])) {
    const ev = reg.events;
    await enqueueJob("bulk_invoice", {
      productType:     "event",
      userEmail:       reg.user_email,
      userName:        reg.user_name,
      productName:     ev?.title ?? "Event Registration",
      totalPaidRupees: reg.final_price ?? 0,
      paymentId:       reg.razorpay_payment_id ?? undefined,
      orderId:         reg.razorpay_order_id   ?? undefined,
      registrationId:  reg.id,
      eventId:         reg.event_id,
      eventDate:       ev?.start_date,
      eventVenue:      ev?.location,
    }, {
      idempotencyKey: `bulk_invoice:event:${reg.id}`,
      priority:       -5,  // lower priority than transactional jobs
    });
    regQueued++;
  }

  for (const mem of membershipsToInvoice) {
    const userName = nameMap.get(mem.user_email) || mem.user_email;
    await enqueueJob("bulk_invoice", {
      productType:     "membership",
      userEmail:       mem.user_email,
      userName,
      productName:     PLAN_LABELS[mem.plan] ?? `${mem.plan} Membership`,
      totalPaidRupees: (mem.amount_paid ?? 0) / 100,
      paymentId:       mem.razorpay_payment_id ?? undefined,
      orderId:         mem.razorpay_order_id   ?? undefined,
    }, {
      idempotencyKey: `bulk_invoice:membership:${mem.razorpay_payment_id}`,
      priority:       -5,
    });
    memQueued++;
  }

  return NextResponse.json({
    queued: {
      event_registrations: regQueued,
      memberships:         memQueued,
      total:               regQueued + memQueued,
      already_had_invoice: alreadyInvoicedRegs.size + alreadyInvoicedPayments.size,
    },
    message: `${regQueued + memQueued} invoice jobs queued — processed by job-worker cron at ≤20/min`,
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
