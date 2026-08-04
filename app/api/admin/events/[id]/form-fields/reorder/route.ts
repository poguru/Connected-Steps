import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/events/[id]/form-fields/reorder
// Body: { ids: string[] }  — ordered list of field IDs; sets display_order = array index
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const body = await req.json() as { ids?: string[] };

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Update each field's display_order to match its position in the ids array
  const updates = body.ids.map((fieldId, index) =>
    db.from("event_form_fields")
      .update({ display_order: index })
      .eq("id", fieldId)
      .eq("event_id", event_id)
  );

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}
