import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

// GET /api/admin/events/[id]/tshirt-report
// Returns T-shirt size distribution for an event.

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_registrations")
    .select("tshirt_size, tshirt_issued, status")
    .eq("event_id", eventId)
    .not("tshirt_size", "is", null);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const confirmed = (data ?? []).filter(r => r.status === "confirmed" || r.status === "checked_in");

  const bySize: Record<string, { total: number; issued: number; pending: number }> = {};
  for (const size of SIZES) {
    bySize[size] = { total: 0, issued: 0, pending: 0 };
  }

  let total = 0, issued = 0;
  for (const r of confirmed) {
    const s = r.tshirt_size as string;
    if (!bySize[s]) bySize[s] = { total: 0, issued: 0, pending: 0 };
    bySize[s].total++;
    total++;
    if (r.tshirt_issued) {
      bySize[s].issued++;
      issued++;
    } else {
      bySize[s].pending++;
    }
  }

  return NextResponse.json({
    total,
    issued,
    pending: total - issued,
    by_size: bySize,
    sizes: SIZES,
  });
}
