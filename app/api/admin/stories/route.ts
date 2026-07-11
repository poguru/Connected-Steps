import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/stories — all stories with pending first
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("stories")
    .select("id, user_email, user_name, quote, achievement, approved, created_at")
    .order("approved", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ stories: data ?? [] });
}

// PATCH /api/admin/stories — approve or reject
export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, action } = await req.json(); // action: "approve" | "reject"
    if (!id || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const db = getSupabaseServer();
    if (action === "reject") {
      await db.from("stories").delete().eq("id", id);
    } else {
      await db.from("stories").update({ approved: true }).eq("id", id);
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
