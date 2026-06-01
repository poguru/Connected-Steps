import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("training_plans")
    .select("id, user_email, title, coach_name, active, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { user_email, title, coach_name, days } = body as {
    user_email: string;
    title:      string;
    coach_name: string;
    days:       { type: string; detail: string; emoji: string }[];
  };

  if (!user_email || !Array.isArray(days) || days.length !== 7) {
    return NextResponse.json({ error: "user_email and 7 days required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Deactivate all previous plans for this user
  await db.from("training_plans").update({ active: false }).eq("user_email", user_email.toLowerCase());

  const { data, error } = await db.from("training_plans").insert({
    user_email:  user_email.toLowerCase(),
    title:       title || "Weekly Plan",
    coach_name:  coach_name || "",
    days,
    active:      true,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}
