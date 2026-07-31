// PATCH  /api/admin/event-config/types/[id]  — update name, icon, color, is_active, sort_order
// DELETE /api/admin/event-config/types/[id]  — delete (only allowed when no events reference it)

import { NextRequest, NextResponse } from "next/server";
import { isAdmin }           from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

function makeSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const db     = getSupabaseServer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) return NextResponse.json({ error: "Invalid name." }, { status: 400 });

    // Check for duplicate name (excluding this record)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dup } = await (db as any)
      .from("event_types")
      .select("id")
      .ilike("name", name)
      .neq("id", id)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: `"${name}" already exists.` }, { status: 409 });

    updates.name = name;
    updates.slug = makeSlug(name);
  }

  if (body.icon       !== undefined) updates.icon       = String(body.icon).trim()  || "🎯";
  if (body.color      !== undefined) updates.color      = String(body.color).trim() || "#e8620a";
  if (body.is_active  !== undefined) updates.is_active  = Boolean(body.is_active);
  if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order);
  if (body.description !== undefined) updates.description = String(body.description).trim() || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("event_types")
    .update(updates)
    .eq("id", id)
    .select("id, name, slug, description, icon, color, is_active, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That name already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ type: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  // Get the slug so we can check event usage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (db as any)
    .from("event_types")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Count events currently using this type
  const { count } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", (row as { slug: string }).slug);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} event${count === 1 ? "" : "s"} use this type. Disable it instead.` },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from("event_types").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
