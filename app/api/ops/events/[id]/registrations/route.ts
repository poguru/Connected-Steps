import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOpsSession } from "@/lib/ops-auth";

// GET /api/ops/events/[id]/registrations
// Query params:
//   q     — search by name, email, BIB number, or registration code
//   page  — 1-indexed (default 1)
//   limit — rows per page (default 20, max 100)
//
// Returns participant rows + their parent registration (for payment status).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getOpsSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  if (session.eid !== eventId) {
    return NextResponse.json({ error: "Session belongs to a different event" }, { status: 403 });
  }

  const url   = new URL(req.url);
  const q     = url.searchParams.get("q")?.trim() ?? "";
  const page  = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const from  = (page - 1) * limit;

  const db = getSupabaseServer();

  let query = db
    .from("event_participants")
    .select(
      "id, first_name, last_name, email, mobile, distance_category, tshirt_size, " +
      "bib_number, wave, qr_token, checked_in_at, tshirt_issued, breakfast_availed, " +
      "medal_issued, bib_collected_at, status, account_email, registration_id",
      { count: "exact" }
    )
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("first_name")
    .range(from, from + limit - 1);

  if (q) {
    // Search across name, email, BIB, account email
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,bib_number.ilike.%${q}%,account_email.ilike.%${q}%`
    );
  }

  const { data: participants, count, error } = await query.returns<{
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    mobile: string | null;
    distance_category: string | null;
    tshirt_size: string | null;
    bib_number: string | null;
    wave: string | null;
    qr_token: string | null;
    checked_in_at: string | null;
    tshirt_issued: boolean;
    breakfast_availed: boolean;
    medal_issued: boolean;
    bib_collected_at: string | null;
    status: string;
    account_email: string;
    registration_id: string;
  }[]>();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Fetch payment status from parent registrations
  const regIds = [...new Set((participants ?? []).map(p => p.registration_id))];
  const regMap: Record<string, { payment_status: string; registration_code: string }> = {};
  if (regIds.length > 0) {
    const { data: regs } = await db
      .from("event_registrations")
      .select("id, payment_status, registration_code")
      .in("id", regIds)
      .returns<{ id: string; payment_status: string; registration_code: string }[]>();
    for (const r of regs ?? []) regMap[r.id] = r;
  }

  const rows = (participants ?? []).map(p => ({
    ...p,
    name:             [p.first_name, p.last_name].filter(Boolean).join(" "),
    payment_status:   regMap[p.registration_id]?.payment_status ?? "unknown",
    registration_code: regMap[p.registration_id]?.registration_code ?? "",
  }));

  return NextResponse.json({
    participants: rows,
    total:        count ?? 0,
    page,
    total_pages:  Math.ceil((count ?? 0) / limit),
  });
}
