import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ plan: null });

  const db = getSupabaseServer();
  const { data } = await db
    .from("training_plans")
    .select("id, title, coach_name, days, created_at")
    .eq("user_email", email.toLowerCase())
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ plan: data ?? null });
}
