import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { isStoredDocumentPath, idDocumentTypeFor } from "@/lib/it-run-id-verification";

// POST /api/it-run/my-registrations/id-document
// Body: { participantId, documentPath, documentType: "company" | "government" }
//
// A signed-in account adds an ID document to a participant who registered without one ("Continue Without ID").
// Only for an adult with no document on file. The document path comes from the upload route (a private storage
// path, validated here). The participant moves to admin review as pending.
//
// Ownership: the registration must be linked to the signed-in account. Any other request gets the same 404, so
// participant ids cannot be probed. Nothing else on the registration or payment is changed.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) return NextResponse.json({ error: "Please sign in.", code: "AUTH_REQUIRED" }, { status: 401, headers: NO_STORE });

  let body: { participantId?: unknown; documentPath?: unknown; documentType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
  }
  const participantId = typeof body.participantId === "string" ? body.participantId : "";
  const documentPath = typeof body.documentPath === "string" ? body.documentPath : "";
  if (!participantId) return NextResponse.json({ error: "Participant is required." }, { status: 400, headers: NO_STORE });
  if (!isStoredDocumentPath(documentPath)) {
    return NextResponse.json({ error: "The document could not be verified. Please upload it again." }, { status: 400, headers: NO_STORE });
  }
  const documentType = idDocumentTypeFor(documentPath, body.documentType);
  if (!documentType) return NextResponse.json({ error: "The document could not be verified. Please upload it again." }, { status: 400, headers: NO_STORE });

  const db = getSupabaseServer();

  const { data: part, error: partErr } = await db
    .from("it_run_participants")
    .select("id, event_id, registration_id, verification_status, company_id_url")
    .eq("id", participantId)
    .maybeSingle<{ id: string; event_id: string; registration_id: string; verification_status: string; company_id_url: string | null }>();
  if (partErr) return NextResponse.json({ error: "We couldn't save your document. Please try again." }, { status: 500, headers: NO_STORE });

  const { data: reg } = part
    ? await db
        .from("it_run_registrations")
        .select("linked_user_email")
        .eq("id", part.registration_id)
        .maybeSingle<{ linked_user_email: string | null }>()
    : { data: null };

  // Same response whether the participant is missing or belongs to another account
  if (!part || !reg?.linked_user_email || reg.linked_user_email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "We couldn't find this participant on your account." }, { status: 404, headers: NO_STORE });
  }

  // Only a participant who continued without an ID can add one here. Children are exempt, and a participant who
  // already has a document uses the replacement link instead.
  if (part.verification_status !== "not_provided" || part.company_id_url) {
    return NextResponse.json({ error: "This participant already has an ID on file." }, { status: 409, headers: NO_STORE });
  }

  // The guarded update succeeds only if nothing changed in the meantime
  const { data: updated, error: updErr } = await db
    .from("it_run_participants")
    .update({ company_id_url: documentPath, id_document_type: documentType, verification_status: "pending" })
    .eq("id", part.id)
    .eq("verification_status", "not_provided")
    .is("company_id_url", null)
    .select("id");

  if (updErr) {
    console.error("[it-run/my-registrations/id-document] update failed:", updErr.code ?? "unknown");
    return NextResponse.json({ error: "We couldn't save your document. Please try again." }, { status: 500, headers: NO_STORE });
  }
  if (!updated?.length) {
    return NextResponse.json({ error: "This participant already has an ID on file." }, { status: 409, headers: NO_STORE });
  }

  // Audit: the participant's own action, recorded with the participant and the document type (never the path)
  await db.from("it_run_audit_logs").insert({
    event_id: part.event_id,
    actor_email: email,
    actor_role: "participant",
    action: "id_document_added",
    entity_type: "participant",
    entity_id: part.id,
    detail: { document_type: documentType, previous_status: "not_provided" },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, verificationStatus: "pending", documentType }, { headers: NO_STORE });
}
