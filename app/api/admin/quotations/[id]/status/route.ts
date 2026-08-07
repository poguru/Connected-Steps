import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:     ["sent", "cancelled"],
  sent:      ["viewed", "accepted", "rejected", "expired", "cancelled"],
  viewed:    ["accepted", "rejected", "expired", "cancelled"],
  accepted:  ["converted", "cancelled"],
  rejected:  ["draft"],
  expired:   ["draft"],
  converted: [],
  cancelled: ["draft"],
};

// PATCH /api/admin/quotations/[id]/status
// Body: { status: string, notes?: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as { status: string; notes?: string };

  if (!body.status) return NextResponse.json({ error: "status is required" }, { status: 400 });

  const { data: quo } = await db.from("quotations")
    .select("id, status, quotation_number").eq("id", id).single();
  if (!quo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = VALID_TRANSITIONS[quo.status] ?? [];
  if (!allowed.includes(body.status)) {
    return NextResponse.json(
      { error: `Cannot transition from "${quo.status}" to "${body.status}"` },
      { status: 409 },
    );
  }

  const { error } = await db.from("quotations")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("quotation_status_history").insert({
    quotation_id: id,
    from_status:  quo.status,
    to_status:    body.status,
    notes:        body.notes ?? null,
    actor:        "admin",
  });

  await db.from("quotation_history").insert({
    quotation_id: id,
    action:       "status_changed",
    description:  `Status changed from ${quo.status} → ${body.status}${body.notes ? `: ${body.notes}` : ""}`,
    actor:        "admin",
  });

  return NextResponse.json({ status: body.status });
}
