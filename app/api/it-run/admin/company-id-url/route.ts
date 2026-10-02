import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

const BUCKET           = "it-run-company-ids";
const SIGNED_URL_TTL_S = 3600; // 1 hour

// Extracts the storage path from either format:
//   Legacy: https://<host>/storage/v1/object/public/it-run-company-ids/<path>
//   New:    <path>   (e.g. "1729284291234-abc123.jpg")
// Returns null for clearly invalid inputs.
export function resolveCompanyIdPath(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;

  // Remove any whitespace
  const val = raw.trim();
  if (!val) return null;

  // Legacy public URL format (getPublicUrl was erroneously used with a private bucket)
  const publicMarker = `/object/public/${BUCKET}/`;
  const pubIdx = val.indexOf(publicMarker);
  if (pubIdx !== -1) {
    const extracted = val.slice(pubIdx + publicMarker.length).split("?")[0];
    return extracted || null;
  }

  // Legacy signed URL format (shouldn't exist, but be safe)
  const signMarker = `/object/sign/${BUCKET}/`;
  const signIdx = val.indexOf(signMarker);
  if (signIdx !== -1) {
    const extracted = val.slice(signIdx + signMarker.length).split("?")[0];
    return extracted || null;
  }

  // Authenticated URL format
  const authMarker = `/object/authenticated/${BUCKET}/`;
  const authIdx = val.indexOf(authMarker);
  if (authIdx !== -1) {
    const extracted = val.slice(authIdx + authMarker.length).split("?")[0];
    return extracted || null;
  }

  // Plain path (new format from fixed upload route)
  // Basic sanity: must not start with http, must not be a full URL
  if (val.startsWith("http://") || val.startsWith("https://")) {
    // Unrecognised URL format — log and return null
    console.warn("[company-id-url] unrecognised URL format:", val.slice(0, 80));
    return null;
  }

  return val;
}

// GET /api/it-run/admin/company-id-url?participantId=<uuid>
//
// Returns a short-lived signed URL for a participant's company ID document.
// Requires a valid admin portal session (verification_team or event_admin).
// IDOR protection: the participant must belong to the sprint-2 event.
//
// Never trusts a client-provided storage path — always resolves from the DB.
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "verification_team"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId || typeof participantId !== "string") {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Load participant + verify event ownership (IDOR guard).
  // Uses !inner join: if the registration is not for sprint-2, the row is
  // absent and we return 404 — no data leakage across events.
  const { data: part } = await db
    .from("it_run_participants")
    .select(`
      id, company_id_url,
      it_run_registrations!inner (
        id,
        it_run_events!inner ( slug )
      )
    `)
    .eq("id", participantId)
    .eq("it_run_registrations.it_run_events.slug", "sprint-2")
    .maybeSingle<{
      id:             string;
      company_id_url: string | null;
      it_run_registrations: {
        id: string;
        it_run_events: { slug: string };
      };
    }>();

  if (!part) {
    // Either participant not found, or belongs to a different event.
    console.warn(
      `[company-id-url] NOT_FOUND participantId=${participantId} actor=${session.email}`,
    );
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  if (!part.company_id_url) {
    return NextResponse.json({ available: false, reason: "NO_DOCUMENT" });
  }

  const storagePath = resolveCompanyIdPath(part.company_id_url);
  if (!storagePath) {
    console.error(
      `[company-id-url] UNRESOLVABLE_PATH participantId=${participantId}` +
      ` raw=${part.company_id_url.slice(0, 80)}`,
    );
    return NextResponse.json(
      { available: false, reason: "UNRESOLVABLE_PATH" },
      { status: 422 },
    );
  }

  const { data: signed, error: signErr } = await db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_S);

  if (signErr || !signed?.signedUrl) {
    // The most common cause: file was deleted from storage after upload.
    console.error(
      `[company-id-url] STORAGE_SIGN_FAILED participantId=${participantId}` +
      ` path=${storagePath} error=${signErr?.message ?? "no signed url"}`,
    );
    return NextResponse.json(
      { available: false, reason: "STORAGE_FILE_NOT_FOUND" },
      { status: 404 },
    );
  }

  // Infer MIME type from extension (the path always carries the extension)
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  const MIME: Record<string, string> = {
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    png:  "image/png",
    webp: "image/webp",
    pdf:  "application/pdf",
  };
  const mimeType  = MIME[ext] ?? "application/octet-stream";
  const isPdf     = ext === "pdf";
  const fileName  = storagePath.split("/").pop() ?? storagePath;
  const expiresAt = Date.now() + SIGNED_URL_TTL_S * 1000;

  return NextResponse.json({
    available:  true,
    url:        signed.signedUrl,
    mimeType,
    isPdf,
    fileName,
    expiresAt,
  });
}
