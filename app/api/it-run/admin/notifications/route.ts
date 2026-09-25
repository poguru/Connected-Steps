import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { sendItRunConfirmationEmail } from "@/lib/it-run-email";

// GET /api/it-run/admin/notifications
// Lists paid/free registrations with email sent status.
// ?filter=all|sent|unsent  ?limit=50&offset=0
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") ?? "all";
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const db = getSupabaseServer();
  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let query = db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email,
      payment_status, final_price,
      confirmation_email_sent_at, created_at,
      it_run_categories ( name )
    `, { count: "exact" })
    .eq("event_id", event.id)
    .in("payment_status", ["paid", "free"])
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter === "sent")   query = (query as typeof query).not("confirmation_email_sent_at", "is", null);
  if (filter === "unsent") query = (query as typeof query).is("confirmation_email_sent_at", null);

  const { data: registrations, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ registrations, total: count ?? 0 });
}

// POST /api/it-run/admin/notifications
// Body: { registrationId, force?: boolean }
// If force=true: clears confirmation_email_sent_at first so the idempotency lock is released,
// then calls sendItRunConfirmationEmail which re-claims the lock and sends.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { registrationId, force } = await req.json() as {
    registrationId: string;
    force?: boolean;
  };

  if (!registrationId) {
    return NextResponse.json({ error: "registrationId required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, registration_code, lead_email, payment_status")
    .eq("id", registrationId)
    .single<{ id: string; registration_code: string; lead_email: string; payment_status: string }>();

  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  if (!["paid", "free"].includes(reg.payment_status)) {
    return NextResponse.json(
      { error: "Confirmation email only applies to paid or free registrations" },
      { status: 400 },
    );
  }

  if (force) {
    await db
      .from("it_run_registrations")
      .update({ confirmation_email_sent_at: null })
      .eq("id", registrationId);
  }

  await sendItRunConfirmationEmail(reg.id, reg.registration_code, reg.lead_email, "");

  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action:      force ? "force_resend_email" : "resend_email",
    entity_type: "registration",
    entity_id:   reg.registration_code,
    detail:      { lead_email: reg.lead_email },
  }).then(() => {}).catch(() => {});

  return NextResponse.json({ ok: true });
}
