import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/contact-lists
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // Fetch lists + member counts in one shot
  const { data: lists, error } = await db.from("contact_lists")
    .select("id, name, description, category, color, is_active, created_at")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count members per list
  const { data: counts } = await db.from("contact_list_members")
    .select("list_id");
  const countMap: Record<string, number> = {};
  (counts ?? []).forEach(r => { countMap[r.list_id] = (countMap[r.list_id] ?? 0) + 1; });

  const result = (lists ?? []).map(l => ({ ...l, member_count: countMap[l.id] ?? 0 }));
  return NextResponse.json({ lists: result });
}

// POST /api/admin/contact-lists
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await db.from("contact_lists").insert({
    name:        String(body.name).trim(),
    description: body.description ?? null,
    category:    body.category    ?? null,
    color:       body.color       ?? "#6b7280",
    is_active:   true,
    created_by:  "admin",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ list: data }, { status: 201 });
}
