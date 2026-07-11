import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/events/[id]/bib/assign
// Assigns BIB numbers to all confirmed, paid registrations for an event.
// Groups by distance_category and uses the race's bib_prefix.
// Idempotent: skips registrations that already have a bib_number.
//
// Body:
//   force    boolean  if true, reassign even if already assigned
//   preview  boolean  if true, return what would be assigned without writing

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body    = await req.json().catch(() => ({})) as Record<string, unknown>;
  const force   = body.force   === true;
  const preview = body.preview === true;

  const db = getSupabaseServer();

  // Fetch races to get bib_prefix per distance
  const { data: races } = await db
    .from("event_races")
    .select("name, distance, bib_prefix, auto_bib")
    .eq("event_id", eventId)
    .eq("status", "active");

  // Build prefix map: distance → prefix (e.g. "5K" → "5K-")
  const prefixMap = new Map<string, string>();
  for (const race of races ?? []) {
    if (race.auto_bib) {
      prefixMap.set(race.distance, race.bib_prefix ?? "");
    }
  }

  // Fetch all confirmed, paid registrations needing BIB
  let q = db
    .from("event_registrations")
    .select("id, registration_code, user_name, distance_category, bib_number")
    .eq("event_id", eventId)
    .in("payment_status", ["paid", "free"])
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });  // FIFO assignment order

  if (!force) q = q.is("bib_number", null) as typeof q;

  const { data: registrations, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  if (!registrations?.length) {
    return NextResponse.json({ assigned: 0, skipped: 0, preview, assignments: [] });
  }

  // Group by distance_category and assign sequential BIB numbers
  const groups = new Map<string, typeof registrations>();
  for (const reg of registrations) {
    const cat = reg.distance_category ?? "OPEN";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(reg);
  }

  // Find the current max BIB number per category (to continue from where we left off)
  const maxQuery = await db
    .from("event_registrations")
    .select("distance_category, bib_number")
    .eq("event_id", eventId)
    .not("bib_number", "is", null);

  const maxMap = new Map<string, number>();
  for (const row of maxQuery.data ?? []) {
    const cat    = row.distance_category ?? "OPEN";
    const prefix = prefixMap.get(row.distance_category ?? "") ?? "";
    const numStr = String(row.bib_number ?? "").replace(prefix, "").replace(/^0+/, "") || "0";
    const num    = parseInt(numStr, 10) || 0;
    maxMap.set(cat, Math.max(maxMap.get(cat) ?? 0, num));
  }

  const assignments: { id: string; registration_code: string; user_name: string; category: string; bib_number: string }[] = [];

  for (const [category, regs] of groups) {
    const prefix = prefixMap.get(category) ?? prefixMap.get("OPEN") ?? "";
    let counter  = (maxMap.get(category) ?? 0);

    for (const reg of regs) {
      counter++;
      const bibNumber = prefix + String(counter).padStart(3, "0");
      assignments.push({
        id:                reg.id,
        registration_code: reg.registration_code,
        user_name:         reg.user_name,
        category,
        bib_number:        bibNumber,
      });
    }
  }

  if (preview) {
    return NextResponse.json({ assigned: 0, skipped: 0, preview: true, assignments });
  }

  // Write BIB numbers
  let assigned = 0, failed = 0;
  const errors: string[] = [];

  for (const a of assignments) {
    const { error: upErr } = await db
      .from("event_registrations")
      .update({ bib_number: a.bib_number })
      .eq("id", a.id)
      .eq("event_id", eventId);

    if (upErr) { failed++; errors.push(`${a.registration_code}: ${upErr.message}`); }
    else assigned++;
  }

  console.log(`[bib/assign] event=${eventId} assigned=${assigned} failed=${failed}`);

  return NextResponse.json({
    assigned,
    failed,
    skipped:     0,
    preview:     false,
    assignments: assignments.slice(0, 100),  // cap response size
    errors:      errors.slice(0, 10),
  });
}

// GET /api/admin/events/[id]/bib/assign
// Preview: show what would be assigned without making changes.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = { preview: true, force: false };
  return POST(new NextRequest(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(body) }), { params });
}
