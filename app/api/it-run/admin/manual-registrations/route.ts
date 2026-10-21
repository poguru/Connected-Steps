import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/it-run-auth";
import { checkAndRecordEndpointLimit } from "@/lib/rate-limit";
import { createItRunRegistration, type ParticipantInput } from "@/lib/it-run-register-core";

// POST /api/it-run/admin/manual-registrations
// Registers participants on someone's behalf (phone or desk requests). It uses the same registration rules as the public
// form, through the shared function. Payment is never marked paid here: the registration waits for payment through the
// participant's dashboard link, unless it is complimentary, which needs a written reason and is recorded with the admin.
// Body: { categoryId, participants, idempotencyKey, complimentary?, waiverReason?, couponId? }
const WAIVER_MIN = 10;
const WAIVER_MAX = 300;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkAndRecordEndpointLimit(`itr:admin-manual:${session.email}`, 60, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many registrations. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: {
    categoryId?: string;
    participants?: ParticipantInput[];
    idempotencyKey?: unknown;
    complimentary?: unknown;
    waiverReason?: unknown;
    couponId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof body.idempotencyKey !== "string" || !KEY_PATTERN.test(body.idempotencyKey)) {
    return NextResponse.json({ error: "This form needs to be submitted again. Refresh the page and try again." }, { status: 400 });
  }

  const complimentary = body.complimentary === true;
  const waiverReason = typeof body.waiverReason === "string" ? body.waiverReason.trim() : "";
  if (complimentary && (waiverReason.length < WAIVER_MIN || waiverReason.length > WAIVER_MAX)) {
    return NextResponse.json({
      error: `Give the reason for the complimentary registration (${WAIVER_MIN} to ${WAIVER_MAX} characters).`,
      field: "waiverReason",
    }, { status: 400 });
  }
  if (complimentary && body.couponId) {
    return NextResponse.json({ error: "A complimentary registration can't also use a discount code." }, { status: 400 });
  }

  const outcome = await createItRunRegistration({
    categoryId: body.categoryId ?? null,
    couponId: complimentary ? null : (body.couponId ?? null),
    participants: Array.isArray(body.participants) ? body.participants : [],
    draftToken: null,
    linkedUserEmail: null,
    source: "admin_manual",
    admin: {
      email: session.email,
      role: session.role,
      complimentary,
      waiverReason: complimentary ? waiverReason : null,
      idempotencyKey: body.idempotencyKey,
    },
  });
  return NextResponse.json(outcome.body, { status: outcome.ok ? 200 : outcome.status });
}
