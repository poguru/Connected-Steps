import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/participants?q=&page=1&limit=50&status=
// Returns paginated event_participants with registration_code + payment_status
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const sp     = req.nextUrl.searchParams;
  const q      = sp.get("q")?.trim() ?? "";
  const page   = Math.max(1, Number(sp.get("page") ?? 1));
  const limit  = Math.min(100, Math.max(10, Number(sp.get("limit") ?? 50)));
  const status = sp.get("status") ?? "";

  const db     = getSupabaseServer();
  const offset = (page - 1) * limit;

  let query = db
    .from("event_participants")
    .select(`
      id, registration_id, account_email, first_name, last_name,
      gender, dob, blood_group, mobile, email,
      distance_category, tshirt_size, bib_number, wave,
      qr_token, checked_in_at, checked_in_by,
      tshirt_issued, tshirt_issued_at,
      breakfast_availed, breakfast_availed_at,
      medal_issued, medal_issued_at,
      bib_collected_at, status, created_at
    `, { count: "exact" })
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,account_email.ilike.%${q}%,bib_number.ilike.%${q}%`
    );
  }

  const { data: participants, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch registration codes for these participants
  const regIds = [...new Set((participants ?? []).map(p => p.registration_id))];
  const { data: regs } = regIds.length > 0
    ? await db.from("event_registrations")
        .select("id, registration_code, payment_status, final_price")
        .in("id", regIds)
    : { data: [] };

  const regMap: Record<string, { registration_code: string; payment_status: string; final_price: number }> = {};
  for (const r of regs ?? []) regMap[r.id] = r;

  const result = (participants ?? []).map(p => ({
    ...p,
    registration_code: regMap[p.registration_id]?.registration_code ?? null,
    payment_status:    regMap[p.registration_id]?.payment_status    ?? null,
    final_price:       regMap[p.registration_id]?.final_price       ?? 0,
  }));

  return NextResponse.json({
    participants: result,
    total:       count ?? 0,
    page,
    total_pages: Math.ceil((count ?? 0) / limit),
  });
}

// PATCH /api/admin/events/[id]/participants
// Body: { participant_id, bib_number }  — update BIB for one participant
//   OR  { bulk_bib: true, prefix, start }  — auto-assign sequential BIBs
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const db   = getSupabaseServer();

  // Single participant BIB update
  if (body.participant_id) {
    const { error } = await db
      .from("event_participants")
      .update({ bib_number: body.bib_number as string | null })
      .eq("id", body.participant_id as string)
      .eq("event_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Bulk sequential BIB assignment
  if (body.bulk_bib === true) {
    const prefix  = (body.prefix  as string)  ?? "";
    const start   = Number(body.start ?? 1);
    const pad     = Number(body.pad   ?? 3);
    const cat     = body.distance_category as string | undefined;
    const force   = body.force === true;
    const preview = body.preview === true;

    let query = db
      .from("event_participants")
      .select("id, bib_number, distance_category, created_at")
      .eq("event_id", eventId)
      .in("status", ["active", "confirmed"])
      .order("created_at", { ascending: true });

    if (cat) query = query.eq("distance_category", cat);
    if (!force) query = query.is("bib_number", null);

    const { data: participants } = await query;
    if (!participants?.length) return NextResponse.json({ ok: true, assigned: 0 });

    const assignments = participants.map((p, i) => ({
      id:         p.id,
      bib_number: `${prefix}${String(start + i).padStart(pad, "0")}`,
    }));

    if (preview) return NextResponse.json({ preview: assignments });

    let assigned = 0;
    for (const a of assignments) {
      const { error } = await db
        .from("event_participants")
        .update({ bib_number: a.bib_number })
        .eq("id", a.id);
      if (!error) assigned++;
    }
    return NextResponse.json({ ok: true, assigned });
  }

  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}
