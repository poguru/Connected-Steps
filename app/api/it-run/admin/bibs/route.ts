import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/bibs?unallocated=1
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const unallocated = req.nextUrl.searchParams.get("unallocated") === "1";

  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let q = db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile, bib_number, wave, collection_counter,
      verification_status, tshirt_size, participant_type,
      it_run_registrations!inner ( registration_code, payment_status,
        it_run_categories ( name, distance_km, slug, color ) ),
      it_run_bib_collections ( id, collected_at )
    `)
    .eq("event_id", event.id)
    .in("it_run_registrations.payment_status", ["paid","free"]);

  if (unallocated) q = q.is("bib_number", null);

  const { data, error } = await q.order("id");
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ data });
}

// POST /api/it-run/admin/bibs — bulk auto-allocate BIBs
// Body: { categorySlug? } — allocate for one category or all
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { categorySlug } = await req.json() as { categorySlug?: string };
    const db = getSupabaseServer();

    const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Get unallocated participants (paid/free registrations only)
    let q = db
      .from("it_run_participants")
      .select(`
        id, participant_type,
        it_run_registrations!inner ( payment_status,
          it_run_categories ( slug, sort_order ) )
      `)
      .eq("event_id", event.id)
      .is("bib_number", null)
      .in("it_run_registrations.payment_status", ["paid","free"]);

    if (categorySlug) {
      q = q.eq("it_run_registrations.it_run_categories.slug", categorySlug);
    }

    const { data: parts } = await q.order("id");
    if (!parts?.length) return NextResponse.json({ allocated: 0, message: "No unallocated participants found" });

    // BIB number range by category sort_order:
    // sort 1 (10K): 1001-1999, Wave A
    // sort 2 (5K Timed): 2001-2999, Wave A
    // sort 3 (5K Fun): 3001-3999, Wave B
    // sort 4 (Duo): 4001-4999, Wave B
    // sort 5 (Kid): 5001-5999, Wave C
    const RANGES: Record<number, { start: number; wave: string }> = {
      1: { start: 1001, wave: "A" },
      2: { start: 2001, wave: "A" },
      3: { start: 3001, wave: "B" },
      4: { start: 4001, wave: "B" },
      5: { start: 5001, wave: "C" },
    };

    // Get existing max BIBs per category
    const bibCounters: Record<number, number> = {};

    for (const part of parts) {
      const cat    = (part.it_run_registrations as unknown as { it_run_categories: { slug: string; sort_order: number } }).it_run_categories;
      const sord   = cat?.sort_order ?? 3;
      const range  = RANGES[sord] ?? { start: 9001, wave: "D" };

      if (!bibCounters[sord]) {
        // Find the max bib already assigned in this range
        const { data: maxRow } = await db
          .from("it_run_participants")
          .select("bib_number")
          .eq("event_id", event.id)
          .gte("bib_number", String(range.start))
          .lt("bib_number", String(range.start + 999))
          .order("bib_number", { ascending: false })
          .limit(1)
          .single();

        bibCounters[sord] = maxRow?.bib_number
          ? parseInt(maxRow.bib_number, 10)
          : range.start - 1;
      }

      bibCounters[sord]++;
      const bib  = String(bibCounters[sord]);
      const wave = range.wave;

      await db
        .from("it_run_participants")
        .update({ bib_number: bib, wave })
        .eq("id", part.id);
    }

    return NextResponse.json({ allocated: parts.length });
  } catch (e: unknown) {
    console.error("[it-run/admin/bibs] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
