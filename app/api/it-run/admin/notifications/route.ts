import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { sendItRunConfirmationEmail, sendItRunBibInviteEmail } from "@/lib/it-run-email";

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
      confirmation_email_sent_at, bib_invite_sent_at, created_at,
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
// action: "confirmation"       — resend confirmation email for one registration
// action: "bib_invite"         — send BIB invite for one registration
// action: "bib_invite_bulk"    — send BIB invite to ALL confirmed registrations that haven't received one
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action: "confirmation" | "bib_invite" | "bib_invite_bulk";
    registrationId?: string;
    force?: boolean;
  };

  const db = getSupabaseServer();

  // ── Bulk BIB invite ───────────────────────────────────────────────────────────
  if (body.action === "bib_invite_bulk") {
    const { data: event } = await db
      .from("it_run_events").select("id").eq("slug", "sprint-2").single();
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { data: pending } = await db
      .from("it_run_registrations")
      .select("id, lead_email")
      .eq("event_id", event.id)
      .in("payment_status", ["paid", "free"])
      .eq("registration_status", "active")
      .is("bib_invite_sent_at", null);

    const targets = pending ?? [];
    let sent = 0;
    for (const reg of targets) {
      try {
        await sendItRunBibInviteEmail(reg.id, reg.lead_email);
        sent++;
      } catch (e) {
        console.error(`[admin/notifications] bulk bib invite failed reg=${reg.id}:`, e);
      }
    }

    db.from("it_run_audit_logs").insert({
      event_id:    event.id,
      actor_email: session.email,
      actor_role:  session.role,
      action:      "bulk_bib_invite",
      entity_type: "event",
      entity_id:   "sprint-2",
      ip:          getClientIp(req),
      detail:      { total: targets.length, sent },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, sent, total: targets.length });
  }

  // ── Single registration actions ───────────────────────────────────────────────
  const { registrationId, force } = body;
  if (!registrationId) {
    return NextResponse.json({ error: "registrationId required" }, { status: 400 });
  }

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, registration_code, lead_email, payment_status")
    .eq("id", registrationId)
    .single<{ id: string; registration_code: string; lead_email: string; payment_status: string }>();

  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  if (!["paid", "free"].includes(reg.payment_status)) {
    return NextResponse.json(
      { error: "Only applies to paid or free registrations" },
      { status: 400 },
    );
  }

  if (body.action === "bib_invite") {
    if (force) {
      // Only reset the "sent" flag, not the token itself. The token remains valid.
      // sendItRunBibInviteEmail will regenerate a new token if needed, but won't invalidate the old one.
      await db.from("it_run_registrations")
        .update({ bib_invite_sent_at: null })
        .eq("id", registrationId);
    }
    await sendItRunBibInviteEmail(reg.id, reg.lead_email);

    db.from("it_run_audit_logs").insert({
      actor_email: session.email, actor_role: session.role,
      action:      force ? "force_resend_bib_invite" : "send_bib_invite",
      entity_type: "registration", entity_id: reg.registration_code,
      ip:          getClientIp(req),
      detail:      { lead_email: reg.lead_email },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true });
  }

  // Default: confirmation email
  if (force) {
    await db.from("it_run_registrations")
      .update({ confirmation_email_sent_at: null })
      .eq("id", registrationId);
  }

  await sendItRunConfirmationEmail(reg.id, reg.registration_code, reg.lead_email, "");

  db.from("it_run_audit_logs").insert({
    actor_email: session.email, actor_role: session.role,
    action:      force ? "force_resend_email" : "resend_email",
    entity_type: "registration", entity_id: reg.registration_code,
    ip:          getClientIp(req),
    detail:      { lead_email: reg.lead_email },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
