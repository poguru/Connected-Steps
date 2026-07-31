// GET  /api/admin/event-config/types   — list event types
// POST /api/admin/event-config/types   — create a new event type

import { NextRequest, NextResponse } from "next/server";
import { isAdmin }           from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

function makeSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const all = req.nextUrl.searchParams.get("all") === "1";
  const db  = getSupabaseServer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db as any)
    .from("event_types")
    .select("id, name, slug, description, icon, color, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true });

  if (!all) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ types: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name  = String(body.name  ?? "").trim();
  const icon  = String(body.icon  ?? "🎯").trim();
  const color = String(body.color ?? "#e8620a").trim();

  if (!name)          return NextResponse.json({ error: "Name is required." },        { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name is too long." },      { status: 400 });

  const slug = makeSlug(name);
  if (!slug)          return NextResponse.json({ error: "Name produces an empty slug." }, { status: 400 });

  const db = getSupabaseServer();

  // Case-insensitive duplicate check (the unique index also enforces this, but we
  // return a friendlier message by checking first)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from("event_types")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: `An event type named "${name}" already exists.` }, { status: 409 });

  // Find the current max sort_order
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maxRow } = await (db as any)
    .from("event_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("event_types")
    .insert({ name, slug, icon, color, sort_order: sortOrder })
    .select("id, name, slug, description, icon, color, is_active, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: `"${name}" already exists.` }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ type: data }, { status: 201 });
}
