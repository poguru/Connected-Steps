import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOpsSession, OPS_ROLE_LABELS, type OpsRole } from "@/lib/ops-auth";
import { verifyEventQR } from "@/lib/event-qr";

type DB = ReturnType<typeof getSupabaseServer>;

interface RegInfo {
  registration_code: string;
  payment_status: string;
  gender: string | null;
  tshirt_size: string | null;
}

interface Participant {
  id: string;
  event_id: string;
  registration_id: string;
  account_email: string;
  first_name: string;
  last_name: string | null;
  distance_category: string | null;
  tshirt_size: string | null;
  bib_number: string | null;
  wave: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  tshirt_issued: boolean;
  tshirt_issued_at: string | null;
  tshirt_issued_by: string | null;
  breakfast_availed: boolean;
  breakfast_availed_at: string | null;
  breakfast_availed_by: string | null;
  medal_issued: boolean;
  medal_issued_at: string | null;
  medal_issued_by: string | null;
  bib_collected_at: string | null;
  bib_collected_by: string | null;
  certificate_issued: boolean;
  certificate_issued_at: string | null;
  certificate_issued_by: string | null;
  status: string;
  event_registrations: RegInfo | null;
}

// Which scan services each volunteer role is permitted to invoke.
// event_admin has unrestricted access. Roles absent from the map (or with an
// empty array) cannot invoke any service — they will receive 403.
const ROLE_SERVICE_MAP: Record<string, readonly string[]> = {
  event_admin:       ["checkin", "tshirt", "breakfast", "medal", "bib", "certificate"],
  registration_desk: ["checkin"],
  checkin:           ["checkin"],
  tshirt:            ["tshirt"],
  breakfast:         ["breakfast"],
  bib:               ["bib"],
  medal:             ["medal"],
  certificate:       ["certificate"],
  support:           ["checkin"],
  medical:           ["checkin"],
  photography:       [],
  sponsor:           [],
};

const SELECT =
  "id, event_id, registration_id, account_email, first_name, last_name, " +
  "distance_category, tshirt_size, bib_number, wave, " +
  "checked_in_at, checked_in_by, " +
  "tshirt_issued, tshirt_issued_at, tshirt_issued_by, " +
  "breakfast_availed, breakfast_availed_at, breakfast_availed_by, " +
  "medal_issued, medal_issued_at, medal_issued_by, " +
  "bib_collected_at, bib_collected_by, " +
  "certificate_issued, certificate_issued_at, certificate_issued_by, status, " +
  "event_registrations(registration_code, payment_status, gender, tshirt_size)";

// POST /api/ops/events/[id]/scan
// Body: { service, qr_token, dry_run? }
//
// dry_run=true  — looks up participant and returns status without any DB write.
//                 Use this for the "preview before confirm" step in the UI.
// dry_run=false — performs the service action (check-in, tshirt, etc.) atomically.
//
// BIB number fallback: if qr_token fails HMAC verification and is ≤20 alphanumeric
// chars, the route falls back to looking up by bib_number within the event.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getOpsSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  if (session.eid !== eventId) {
    return NextResponse.json({ error: "Session belongs to a different event" }, { status: 403 });
  }

  let body: { service?: string; qr_token?: string; dry_run?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { service, qr_token, dry_run = false } = body;
  if (!service || !qr_token) {
    return NextResponse.json({ error: "service and qr_token are required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // ── Participant lookup ─────────────────────────────────────────────────────
  let participant: Participant | null = null;

  const decoded = verifyEventQR(qr_token);

  if (decoded) {
    if (decoded.eventId !== eventId) {
      return NextResponse.json({
        valid: false,
        code: "WRONG_EVENT",
        error: "This QR code belongs to a different event",
        message: "This QR code belongs to a different event. Please check you are at the correct event.",
      }, { status: 400 });
    }

    // Primary: exact QR token match
    const { data: byToken } = await db
      .from("event_participants")
      .select(SELECT)
      .eq("qr_token", qr_token)
      .eq("event_id", eventId)
      .maybeSingle<Participant>();
    participant = byToken;

    // Secondary fallback: valid QR signature but no participant has this exact token.
    // This covers webhook-path registrations where the confirmation email QR is
    // signed with the registration code (CS-EVT-xxxxx) but event_participants holds
    // a different UUID-based token assigned during participant activation.
    if (!participant) {
      const rc = decoded.registrationCode;
      if (/^CS-/i.test(rc)) {
        const { data: regRow } = await db
          .from("event_registrations")
          .select("id")
          .eq("registration_code", rc)
          .eq("event_id", eventId)
          .maybeSingle();
        if (regRow) {
          const multiResult = await lookupByRegistrationId(db, regRow.id, eventId, SELECT);
          if (multiResult.response) return multiResult.response;
          participant = multiResult.participant;
        }
      }
    }
  } else {
    // QR signature invalid — try fallback identifiers in order:
    // 1. Event Registration ID (e.g. CS-EVT-LBAMJB)
    // 2. BIB number
    const raw   = qr_token.trim();
    const upper = raw.toUpperCase();

    // ── 1. Registration code lookup ──────────────────────────────────────────
    if (upper.length >= 3) {
      // registration_code has a unique index — O(1) lookup
      const { data: regRow } = await db
        .from("event_registrations")
        .select("id, event_id")
        .eq("registration_code", upper)
        .maybeSingle();

      if (regRow) {
        if (regRow.event_id !== eventId) {
          return NextResponse.json({
            valid: false,
            code: "WRONG_EVENT",
            error: "This Registration ID belongs to a different event",
            message: "This Registration ID belongs to a different event. Please check you are at the correct station.",
          }, { status: 400 });
        }
        const multiResult = await lookupByRegistrationId(db, regRow.id, eventId, SELECT);
        if (multiResult.response) return multiResult.response;
        participant = multiResult.participant;
      }
    }

    // ── 2. BIB number lookup ─────────────────────────────────────────────────
    if (!participant && /^[A-Za-z0-9]{1,20}$/.test(raw)) {
      const { data } = await db
        .from("event_participants")
        .select(SELECT)
        .eq("bib_number", raw)
        .eq("event_id", eventId)
        .maybeSingle<Participant>();
      participant = data;
    }

    if (!participant) {
      return NextResponse.json({
        valid: false,
        code: "NOT_FOUND",
        error: "Participant not found",
        message: "No participant found for this Registration ID, QR Code or BIB Number. Please check and try again.",
      }, { status: 404 });
    }
  }

  if (!participant) {
    return NextResponse.json({
      valid: false,
      code: "NOT_FOUND",
      error: "Participant not found",
      message: "No participant found for this Registration ID, QR Code or BIB Number. Please check and try again.",
    }, { status: 404 });
  }

  if (participant.status === "cancelled") {
    return NextResponse.json({
      valid: false,
      code: "CANCELLED",
      error: "Registration Cancelled",
      message: "This registration has been cancelled and is no longer valid.",
    }, { status: 409 });
  }

  // Use the authoritative payment_status from event_registrations, not the participant
  // row status. The Razorpay webhook path confirms payment in event_registrations but
  // never updates event_participants.status, so checking participant.status here would
  // incorrectly block participants who paid via the webhook fallback path.
  const regPaymentStatus = participant.event_registrations?.payment_status;
  if (regPaymentStatus && regPaymentStatus !== "paid" && regPaymentStatus !== "free") {
    return NextResponse.json({
      valid: false,
      code: "PENDING_PAYMENT",
      error: "Payment Not Completed",
      message: "Payment has not been completed for this registration. The participant should complete payment before proceeding.",
    }, { status: 409 });
  }

  const now             = new Date().toISOString();
  const volunteerEmail  = session.em;
  const volunteerRole   = session.role;
  const participantName = [participant.first_name, participant.last_name].filter(Boolean).join(" ");

  // ── Role-based service authorization ─────────────────────────────────────────
  // Enforce that the volunteer's role permits the requested service.
  // Must run before dry_run so preview mode is also gated.
  const allowedServices = ROLE_SERVICE_MAP[volunteerRole] ?? [];
  if (!allowedServices.includes(service)) {
    const roleLabel = OPS_ROLE_LABELS[volunteerRole as OpsRole] ?? volunteerRole;
    return NextResponse.json({
      valid:   false,
      code:    "ROLE_UNAUTHORIZED",
      error:   `Your role does not have access to the ${service} service`,
      message: `Your role (${roleLabel}) is not authorized to perform ${service} operations. Please contact the event administrator.`,
    }, { status: 403 });
  }

  // ── Dry-run: preview without DB update ─────────────────────────────────────
  if (dry_run) {
    // Service-specific validation (so the UI can show errors before the confirm click)
    const effectiveTshirtSize = participant.tshirt_size ?? participant.event_registrations?.tshirt_size ?? null;
    if (service === "tshirt" && !effectiveTshirtSize) {
      return NextResponse.json({
        valid: false,
        code: "NO_TSHIRT_SIZE",
        error: "No T-shirt size recorded for this participant",
        message: "No T-shirt size was recorded for this participant during registration. Contact the event administrator.",
        participant: participantCard(participant, participantName),
      }, { status: 409 });
    }

    const svc = serviceStatus(participant, service);
    return NextResponse.json({
      valid:        true,
      already_done: svc.already_done,
      done_at:      svc.done_at,
      done_by:      svc.done_by,
      message:      svc.already_done
        ? `Already completed for ${participantName}.`
        : `Ready: ${participantName}`,
      participant: participantCard(participant, participantName),
    });
  }

  // ── Live service actions ────────────────────────────────────────────────────
  switch (service) {
    case "checkin":   return handleCheckin(db, participant, participantName, now, volunteerEmail, volunteerRole, eventId);
    case "tshirt":    return handleTshirt(db, participant, participantName, now, volunteerEmail, volunteerRole, eventId);
    case "breakfast": return handleBreakfast(db, participant, participantName, now, volunteerEmail, volunteerRole, eventId);
    case "medal":     return handleMedal(db, participant, participantName, now, volunteerEmail, volunteerRole, eventId);
    case "bib":         return handleBib(db, participant, participantName, now, volunteerEmail, volunteerRole, eventId);
    case "certificate": return handleCertificate(db, participant, participantName, now, volunteerEmail, volunteerRole, eventId);
    default:
      return NextResponse.json({ error: `Unknown service: ${service}` }, { status: 400 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// For group registrations, a registration_id maps to multiple event_participants.
// maybeSingle() silently returns one arbitrarily — this helper fetches all and
// returns a MULTI_PARTICIPANT response when there are more than one.
async function lookupByRegistrationId(
  db: DB, registrationId: string, eventId: string, select: string
): Promise<{ participant: Participant | null; response: NextResponse | null }> {
  const { data: parts } = await db
    .from("event_participants")
    .select(select)
    .eq("registration_id", registrationId)
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("first_name")
    .returns<Participant[]>();

  if (!parts || parts.length === 0) return { participant: null, response: null };

  if (parts.length === 1) return { participant: parts[0], response: null };

  // Group booking — return all participants so the UI can prompt for selection
  return {
    participant: null,
    response: NextResponse.json({
      valid: false,
      code: "MULTI_PARTICIPANT",
      message: "This is a group registration with multiple participants. Please scan individual QR codes or select a participant below.",
      participants: parts.map(pp =>
        participantCard(pp, [pp.first_name, pp.last_name].filter(Boolean).join(" "))
      ),
    }, { status: 200 }),
  };
}

function participantCard(p: Participant, name: string) {
  return {
    id:                p.id,
    name,
    registration_code: p.event_registrations?.registration_code ?? null,
    distance_category: p.distance_category,
    tshirt_size:       p.tshirt_size ?? p.event_registrations?.tshirt_size ?? null,
    bib_number:        p.bib_number,
    wave:              p.wave,
    gender:            p.event_registrations?.gender ?? null,
    payment_status:    p.event_registrations?.payment_status ?? null,
  };
}

function serviceStatus(p: Participant, svc: string) {
  switch (svc) {
    case "checkin":   return { already_done: !!p.checked_in_at,    done_at: p.checked_in_at,     done_by: p.checked_in_by };
    case "tshirt":    return { already_done: p.tshirt_issued,       done_at: p.tshirt_issued_at,  done_by: p.tshirt_issued_by };
    case "breakfast": return { already_done: p.breakfast_availed,   done_at: p.breakfast_availed_at, done_by: p.breakfast_availed_by };
    case "medal":     return { already_done: p.medal_issued,        done_at: p.medal_issued_at,   done_by: p.medal_issued_by };
    case "bib":         return { already_done: !!p.bib_collected_at,       done_at: p.bib_collected_at,        done_by: p.bib_collected_by };
    case "certificate": return { already_done: p.certificate_issued,       done_at: p.certificate_issued_at,   done_by: p.certificate_issued_by };
    default:            return { already_done: false, done_at: null, done_by: null };
  }
}

async function logAction(
  db: DB, eventId: string, participantId: string, registrationId: string,
  svc: string, action: string, volunteerEmail: string, volunteerRole: string
) {
  await db.from("event_service_logs").insert({
    event_id: eventId, participant_id: participantId, registration_id: registrationId,
    service_name: svc, action, volunteer_email: volunteerEmail, volunteer_role: volunteerRole,
  });
}

async function handleCheckin(
  db: DB, p: Participant, name: string,
  now: string, vol: string, role: string, eventId: string
): Promise<NextResponse> {
  if (p.checked_in_at) {
    return NextResponse.json({
      valid: true, already_done: true,
      message: `${name} is already checked in.`,
      done_at: p.checked_in_at, done_by: p.checked_in_by,
      participant: participantCard(p, name),
    });
  }

  const { error } = await db
    .from("event_participants")
    .update({ checked_in_at: now, checked_in_by: vol })
    .eq("id", p.id)
    .is("checked_in_at", null);  // optimistic lock — prevent double check-in on concurrent scans
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await logAction(db, eventId, p.id, p.registration_id, "checkin", "checkin", vol, role);
  return NextResponse.json({
    valid: true, already_done: false,
    message: `✅ ${name} checked in!`,
    done_at: now, participant: participantCard(p, name),
  });
}

async function handleTshirt(
  db: DB, p: Participant, name: string,
  now: string, vol: string, role: string, eventId: string
): Promise<NextResponse> {
  const size = p.tshirt_size ?? p.event_registrations?.tshirt_size ?? null;
  if (!size) {
    return NextResponse.json({ error: "No T-shirt size recorded for this participant", valid: false }, { status: 409 });
  }
  if (p.tshirt_issued) {
    return NextResponse.json({
      valid: true, already_done: true,
      message: `T-shirt already issued to ${name}.`,
      done_at: p.tshirt_issued_at, done_by: p.tshirt_issued_by,
      participant: participantCard(p, name),
    });
  }

  const { error } = await db.from("event_participants").update({
    tshirt_issued: true, tshirt_issued_at: now, tshirt_issued_by: vol,
  }).eq("id", p.id).eq("tshirt_issued", false);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await logAction(db, eventId, p.id, p.registration_id, "tshirt", "tshirt_issued", vol, role);
  return NextResponse.json({
    valid: true, already_done: false,
    message: `✅ T-shirt (${size}) issued to ${name}!`,
    done_at: now, participant: participantCard(p, name),
  });
}

async function handleBreakfast(
  db: DB, p: Participant, name: string,
  now: string, vol: string, role: string, eventId: string
): Promise<NextResponse> {
  if (p.breakfast_availed) {
    return NextResponse.json({
      valid: true, already_done: true,
      message: `Breakfast already issued to ${name}.`,
      done_at: p.breakfast_availed_at, done_by: p.breakfast_availed_by,
      participant: participantCard(p, name),
    });
  }

  const { error } = await db.from("event_participants").update({
    breakfast_availed: true, breakfast_availed_at: now, breakfast_availed_by: vol,
  }).eq("id", p.id).eq("breakfast_availed", false);  // optimistic lock
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await logAction(db, eventId, p.id, p.registration_id, "breakfast", "breakfast_issued", vol, role);
  return NextResponse.json({
    valid: true, already_done: false,
    message: `✅ Breakfast issued to ${name}!`,
    done_at: now, participant: participantCard(p, name),
  });
}

async function handleMedal(
  db: DB, p: Participant, name: string,
  now: string, vol: string, role: string, eventId: string
): Promise<NextResponse> {
  if (p.medal_issued) {
    return NextResponse.json({
      valid: true, already_done: true,
      message: `Medal already issued to ${name}.`,
      done_at: p.medal_issued_at, done_by: p.medal_issued_by,
      participant: participantCard(p, name),
    });
  }

  const { error } = await db.from("event_participants").update({
    medal_issued: true, medal_issued_at: now, medal_issued_by: vol,
  }).eq("id", p.id).eq("medal_issued", false);  // optimistic lock
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await logAction(db, eventId, p.id, p.registration_id, "medal", "medal_issued", vol, role);
  return NextResponse.json({
    valid: true, already_done: false,
    message: `✅ Medal issued to ${name}!`,
    done_at: now, participant: participantCard(p, name),
  });
}

async function handleBib(
  db: DB, p: Participant, name: string,
  now: string, vol: string, role: string, eventId: string
): Promise<NextResponse> {
  if (p.bib_collected_at) {
    return NextResponse.json({
      valid: true, already_done: true,
      message: `BIB already collected by ${name}.`,
      done_at: p.bib_collected_at, done_by: p.bib_collected_by,
      participant: participantCard(p, name),
    });
  }

  const { error } = await db.from("event_participants").update({
    bib_collected_at: now, bib_collected_by: vol,
  }).eq("id", p.id).is("bib_collected_at", null);  // optimistic lock
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await logAction(db, eventId, p.id, p.registration_id, "bib", "bib_collected", vol, role);
  return NextResponse.json({
    valid: true, already_done: false,
    message: `✅ BIB confirmed for ${name}${p.bib_number ? ` — BIB #${p.bib_number}` : ""}!`,
    done_at: now, participant: participantCard(p, name),
  });
}

async function handleCertificate(
  db: DB, p: Participant, name: string,
  now: string, vol: string, role: string, eventId: string
): Promise<NextResponse> {
  if (p.certificate_issued) {
    return NextResponse.json({
      valid: true, already_done: true,
      message: `Certificate already issued to ${name}.`,
      done_at: p.certificate_issued_at, done_by: p.certificate_issued_by,
      participant: participantCard(p, name),
    });
  }

  const { error } = await db.from("event_participants").update({
    certificate_issued: true, certificate_issued_at: now, certificate_issued_by: vol,
  }).eq("id", p.id).eq("certificate_issued", false);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await logAction(db, eventId, p.id, p.registration_id, "certificate", "certificate_issued", vol, role);
  return NextResponse.json({
    valid: true, already_done: false,
    message: `✅ Certificate issued to ${name}!`,
    done_at: now, participant: participantCard(p, name),
  });
}
