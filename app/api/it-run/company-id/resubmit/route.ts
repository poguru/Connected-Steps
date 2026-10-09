import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getClientIp } from "@/lib/rate-limit";
import { getRejectionReasonText, isVerificationReason } from "@/lib/it-run-verification";
import {
  verifyCorrectionToken,
  documentFingerprint,
} from "@/lib/it-run-company-id-link";

// Participant company ID correction. Authorization is the signed, encrypted, expiring link.
// No login is needed, so the link never sends the participant through an auth redirect.
//
// GET  /api/it-run/company-id/resubmit?t=...   status, admin reason, and whether resubmission is allowed
// POST /api/it-run/company-id/resubmit         multipart: t (token) + file (replacement document)

const BUCKET    = "it-run-company-ids";
const MAX_SIZE  = 5 * 1024 * 1024; // 5 MB
const ALLOWED   = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const CORRECTABLE = ["rejected", "need_clarification"];

interface LoadedCorrection {
  participant: {
    id: string; first_name: string; email: string | null;
    company_id_url: string | null; verification_status: string;
    event_id: string;
  };
  eventTitle: string;
  latest: {
    verification_reason: string | null;
    admin_explanation: string | null;
    reviewed_at: string | null;
  } | null;
}

type LoadError =
  | { code: "INVALID_LINK"; status: 400 }
  | { code: "EXPIRED_LINK"; status: 410 }
  | { code: "STALE_LINK"; status: 409 }
  | { code: "NOT_FOUND"; status: 404 }
  | { code: "SERVER_ERROR"; status: 500 };

// Validates the token and loads the record it points to. Every check happens on the server.
async function loadCorrection(token: string): Promise<{ ok: true; data: LoadedCorrection } | { ok: false; error: LoadError }> {
  const verified = verifyCorrectionToken(token);
  if (!verified.ok) {
    return { ok: false, error: verified.reason === "expired"
      ? { code: "EXPIRED_LINK", status: 410 }
      : { code: "INVALID_LINK", status: 400 } };
  }

  const db = getSupabaseServer();
  const { data: participant, error } = await db
    .from("it_run_participants")
    .select("id, first_name, email, company_id_url, verification_status, event_id")
    .eq("id", verified.payload.participantId)
    .maybeSingle<LoadedCorrection["participant"]>();
  if (error) {
    console.error("[it-run/company-id] participant lookup failed:", error.code ?? "unknown");
    return { ok: false, error: { code: "SERVER_ERROR", status: 500 } };
  }
  if (!participant || !participant.company_id_url) {
    return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
  }

  // The link is only valid for the document it was issued for. A newer upload makes it stale.
  if (documentFingerprint(participant.company_id_url) !== verified.payload.documentFingerprint) {
    return { ok: false, error: { code: "STALE_LINK", status: 409 } };
  }

  const { data: event } = await db
    .from("it_run_events")
    .select("title")
    .eq("id", participant.event_id)
    .maybeSingle<{ title: string }>();

  const { data: latest } = await db
    .from("it_run_company_verifications")
    .select("verification_reason, admin_explanation, reviewed_at")
    .eq("participant_id", participant.id)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle<LoadedCorrection["latest"]>();

  return {
    ok: true,
    data: {
      participant,
      eventTitle: event?.title ?? "The IT Run Sprint-2",
      latest: latest ?? null,
    },
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const loaded = await loadCorrection(token);
  if (!loaded.ok) {
    return NextResponse.json({ error: messageFor(loaded.error.code), code: loaded.error.code }, { status: loaded.error.status });
  }

  const { participant, eventTitle, latest } = loaded.data;
  const reason = latest?.verification_reason && isVerificationReason(latest.verification_reason)
    ? getRejectionReasonText(latest.verification_reason, latest.admin_explanation)
    : null;
  const canResubmit = CORRECTABLE.includes(participant.verification_status);

  return NextResponse.json({
    participantName: participant.first_name,
    eventTitle,
    verificationStatus: participant.verification_status,
    reasonText: reason,
    canResubmit,
    // Explains why the page cannot accept a file, without exposing internal status codes
    notice: canResubmit ? null
      : participant.verification_status === "verified" ? "Your company ID has already been verified."
      : "Your corrected company ID is already waiting for review.",
  });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const token = String(form.get("t") ?? "");
  const file  = form.get("file") as File | null;

  const loaded = await loadCorrection(token);
  if (!loaded.ok) {
    return NextResponse.json({ error: messageFor(loaded.error.code), code: loaded.error.code }, { status: loaded.error.status });
  }
  const { participant } = loaded.data;

  if (!CORRECTABLE.includes(participant.verification_status)) {
    return NextResponse.json({
      error: "Your company ID is not waiting for correction.",
      code: "NOT_CORRECTABLE",
    }, { status: 409 });
  }

  if (!file) return NextResponse.json({ error: "Please choose a file to upload.", code: "NO_FILE" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed.", code: "BAD_TYPE" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File is too large. The maximum is 5 MB.", code: "TOO_LARGE" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const ext  = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const path = `resubmit-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) {
    console.error("[it-run/company-id] storage upload failed:", uploadErr.message);
    return NextResponse.json({ error: "We couldn't upload your file. Please try again.", code: "UPLOAD_FAILED" }, { status: 500 });
  }

  // Compare-and-swap: only replace the document that the link was issued for, and only while the
  // record is still awaiting correction. A concurrent or stale submission matches no row.
  const previousUrl = participant.company_id_url;
  const { data: updated, error: updErr } = await db
    .from("it_run_participants")
    .update({ company_id_url: path, verification_status: "pending" })
    .eq("id", participant.id)
    .eq("company_id_url", previousUrl)
    .in("verification_status", CORRECTABLE)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updErr || !updated) {
    // Nothing was changed on the record, so remove the file we just stored
    await db.storage.from(BUCKET).remove([path]).catch(() => {});
    if (updErr) console.error("[it-run/company-id] record update failed:", updErr.message);
    return NextResponse.json({
      error: "This link is out of date. Please open the latest email from us.",
      code: "STALE_LINK",
    }, { status: 409 });
  }

  // Audit: keep the previous decision history intact (it_run_company_verifications is not touched)
  await db.from("it_run_audit_logs").insert({
    actor_email: participant.email ?? "participant",
    actor_role: "participant",
    action: "company_id_resubmitted",
    entity_type: "participant",
    entity_id: participant.id,
    ip: getClientIp(req),
    detail: { previous_status: participant.verification_status },
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    message: "Thank you. Your corrected company ID has been submitted and will be reviewed.",
  });
}

function messageFor(code: LoadError["code"]): string {
  switch (code) {
    case "INVALID_LINK":  return "This participant link is invalid. Please open the latest email or sign in to Connected Steps.";
    case "EXPIRED_LINK":  return "This link has expired. Please sign in to view your registration.";
    case "STALE_LINK":    return "This link is out of date. Please open the latest email from us.";
    case "NOT_FOUND":     return "We couldn't find a company ID associated with this link.";
    default:              return "We couldn't load this page right now. Your registration has not been changed. Please try again.";
  }
}
