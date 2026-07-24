import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/refund-policy
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("events")
    .select("id, title, refund_policy, refund_policy_config, cancellation_policy")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ event: data });
}

// PUT /api/admin/events/[id]/refund-policy
// Body: { refund_policy?: string, refund_policy_config?: object, cancellation_policy?: string }
export async function PUT(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as {
    refund_policy?:        string;
    refund_policy_config?: unknown;
    cancellation_policy?:  string;
  };

  const update: Record<string, unknown> = {};
  if ("refund_policy"        in body) update.refund_policy        = body.refund_policy;
  if ("refund_policy_config" in body) update.refund_policy_config = body.refund_policy_config;
  if ("cancellation_policy"  in body) update.cancellation_policy  = body.cancellation_policy;

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.from("events").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Database error: " + error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
