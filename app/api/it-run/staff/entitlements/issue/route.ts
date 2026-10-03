import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireStaffPermission, requireStaffRole, getClientIp } from "@/lib/staff-auth";

// POST /api/it-run/staff/entitlements/issue
// Staff issues an entitlement (BIB, breakfast, goodies, t-shirt, medal, certificate)
// Payload: { participantId, entitlementType, metadata?, idempotencyKey? }
export async function POST(req: NextRequest) {
  const session = requireStaffRole(req, [
    "super_admin",
    "event_admin",
    "bib_staff",
    "checkin_staff",
    "breakfast_staff",
    "goodies_staff",
    "tshirt_staff",
    "medal_staff",
  ]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      participantId?: string;
      entitlementType?: string;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string;
    };

    const { participantId, entitlementType, metadata = {}, idempotencyKey } = body;

    if (!participantId || !entitlementType) {
      return NextResponse.json(
        { error: "participantId and entitlementType required" },
        { status: 400 },
      );
    }

    // Validate entitlement type
    const validTypes = ["BIB", "BREAKFAST", "GOODIES", "TSHIRT", "MEDAL", "CERTIFICATE"];
    if (!validTypes.includes(entitlementType)) {
      return NextResponse.json({ error: "Invalid entitlementType" }, { status: 400 });
    }

    // Permission check: must have permission for this entitlement type
    const permissionMap: Record<string, string> = {
      BIB: "BIB_COLLECT",
      BREAKFAST: "BREAKFAST_ISSUE",
      GOODIES: "GOODIES_ISSUE",
      TSHIRT: "TSHIRT_ISSUE",
      MEDAL: "MEDAL_ISSUE",
      CERTIFICATE: "CERTIFICATE_ISSUE",
    };

    const requiredPerm = permissionMap[entitlementType];
    if (!requireStaffPermission(session, requiredPerm)) {
      return NextResponse.json(
        { error: `Permission ${requiredPerm} required` },
        { status: 403 },
      );
    }

    const db = getSupabaseServer();

    // Idempotency: check if this key was already processed
    if (idempotencyKey) {
      const { data: prior } = await db
        .from("it_run_entitlement_issues")
        .select("id, result, error_message")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle<{ id: string; result: string; error_message: string | null }>();

      if (prior) {
        // Return the prior result
        if (prior.result === "success") {
          return NextResponse.json({ ok: true, cached: true });
        } else {
          return NextResponse.json(
            { error: prior.error_message ?? "Prior request failed" },
            { status: 400 },
          );
        }
      }
    }

    // Load participant + registration
    const { data: participant } = await db
      .from("it_run_participants")
      .select(
        `
        id, first_name, last_name, event_id, registration_id,
        it_run_registrations!inner(id, registration_code, payment_status, registration_status)
      `,
      )
      .eq("id", participantId)
      .eq("event_id", session.eventId)
      .maybeSingle<{
        id: string;
        first_name: string;
        last_name: string;
        event_id: string;
        registration_id: string;
        it_run_registrations: {
          id: string;
          registration_code: string;
          payment_status: string;
          registration_status: string;
        };
      }>();

    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    const reg = participant.it_run_registrations;

    // Validate registration eligibility
    if (reg.payment_status !== "paid" && reg.payment_status !== "free") {
      return NextResponse.json(
        { error: "Registration payment not confirmed" },
        { status: 400 },
      );
    }

    if (reg.registration_status === "cancelled") {
      return NextResponse.json({ error: "Registration is cancelled" }, { status: 400 });
    }

    // Check for duplicate
    const { data: existing } = await db
      .from("it_run_event_entitlements")
      .select("id, status")
      .eq("event_id", session.eventId)
      .eq("participant_id", participantId)
      .eq("entitlement_type", entitlementType)
      .maybeSingle<{ id: string; status: string }>();

    if (existing && existing.status !== "pending") {
      const msg = `${entitlementType} already ${existing.status.toLowerCase()} for this participant`;

      // Log the duplicate attempt
      await db.from("it_run_entitlement_issues").insert({
        event_id: session.eventId,
        participant_id: participantId,
        registration_id: reg.id,
        staff_id: session.staffId,
        entitlement_type: entitlementType,
        action: "issued",
        idempotency_key: idempotencyKey || null,
        result: "duplicate",
        error_message: msg,
        metadata: {},
        device_info: {
          user_agent: req.headers.get("user-agent"),
          ip: getClientIp(req),
        },
      });

      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // Issue or update entitlement
    const now = new Date().toISOString();
    if (existing) {
      // Update pending → issued
      await db
        .from("it_run_event_entitlements")
        .update({
          status: "issued",
          issued_at: now,
          issued_by: session.staffId,
          metadata: metadata,
        })
        .eq("id", existing.id);
    } else {
      // Create new
      await db.from("it_run_event_entitlements").insert({
        event_id: session.eventId,
        participant_id: participantId,
        registration_id: reg.id,
        entitlement_type: entitlementType,
        status: "issued",
        issued_at: now,
        issued_by: session.staffId,
        metadata: metadata,
      });
    }

    // Log the action
    await db.from("it_run_entitlement_issues").insert({
      event_id: session.eventId,
      participant_id: participantId,
      registration_id: reg.id,
      staff_id: session.staffId,
      entitlement_type: entitlementType,
      action: "issued",
      idempotency_key: idempotencyKey || null,
      result: "success",
      metadata: metadata,
      device_info: {
        user_agent: req.headers.get("user-agent"),
        ip: getClientIp(req),
      },
    });

    // Log in staff activity
    await db.from("it_run_staff_activity_log").insert({
      event_id: session.eventId,
      staff_id: session.staffId,
      participant_id: participantId,
      action: `${entitlementType.toLowerCase()}_issued`,
      status: "success",
      ip_address: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      ok: true,
      participant: {
        id: participant.id,
        name: `${participant.first_name} ${participant.last_name}`,
      },
      entitlement: {
        type: entitlementType,
        status: "issued",
        issuedAt: now,
      },
    });
  } catch (e: unknown) {
    console.error("[staff/entitlements/issue] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
