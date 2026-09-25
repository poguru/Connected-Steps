import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

const SIZE_ORDER = ["XS","S","M","L","XL","XXL","3XL","4XL","6Y","8Y","10Y","12Y","14Y"];

// GET /api/it-run/admin/tshirt
// Returns T-shirt size breakdown for paid/free participants.
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Step 1: get paid/free registrations with their category
  const { data: paidRegs } = await db
    .from("it_run_registrations")
    .select("id, registration_code, it_run_categories ( name, color )")
    .eq("event_id", event.id)
    .in("payment_status", ["paid", "free"]);

  if (!paidRegs?.length) {
    return NextResponse.json({ total: 0, sizeSummary: [], byCategory: {}, participants: [] });
  }

  const regById = Object.fromEntries(
    paidRegs.map(r => [r.id, r as typeof r & { it_run_categories: { name: string; color: string } | null }])
  );
  const paidRegIds = paidRegs.map(r => r.id);

  // Step 2: get all participants for those registrations
  const { data: parts, error } = await db
    .from("it_run_participants")
    .select("id, first_name, last_name, tshirt_size, participant_type, registration_id")
    .in("registration_id", paidRegIds)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate
  const sizeCounts: Record<string, number> = {};
  const byCategoryAndSize: Record<string, { color: string; sizes: Record<string, number> }> = {};

  for (const p of parts ?? []) {
    const size    = p.tshirt_size ?? "Unknown";
    const catData = regById[p.registration_id]?.it_run_categories;
    const catName = catData?.name ?? "Unknown";
    const catColor= catData?.color ?? "#e8620a";

    sizeCounts[size] = (sizeCounts[size] ?? 0) + 1;

    if (!byCategoryAndSize[catName]) {
      byCategoryAndSize[catName] = { color: catColor, sizes: {} };
    }
    byCategoryAndSize[catName].sizes[size] = (byCategoryAndSize[catName].sizes[size] ?? 0) + 1;
  }

  const known   = SIZE_ORDER.filter(s => sizeCounts[s]);
  const unknown = Object.keys(sizeCounts).filter(s => !SIZE_ORDER.includes(s));
  const sizeSummary = [
    ...known.map(s  => ({ size: s, count: sizeCounts[s] })),
    ...unknown.map(s => ({ size: s, count: sizeCounts[s] })),
  ];

  const participants = (parts ?? []).map(p => ({
    id:      p.id,
    name:    `${p.first_name} ${p.last_name}`,
    type:    p.participant_type,
    size:    p.tshirt_size ?? "—",
    regCode: regById[p.registration_id]?.registration_code ?? "",
    category:regById[p.registration_id]?.it_run_categories?.name ?? "",
  }));

  return NextResponse.json({ total: participants.length, sizeSummary, byCategory: byCategoryAndSize, participants });
}
