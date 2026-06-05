import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/integrations?email=xxx
// Returns all integrations for a user, enriched with provider metadata

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data: integrations, error } = await db
    .from("user_integrations")
    .select("*")
    .eq("user_email", email.toLowerCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: sources } = await db
    .from("activity_sources")
    .select("*")
    .eq("is_enabled", true)
    .order("sort_order");

  return NextResponse.json({ integrations: integrations ?? [], sources: sources ?? [] });
}
