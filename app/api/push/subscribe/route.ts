import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { email, subscription } = await req.json();
  if (!email || !subscription) {
    return NextResponse.json({ error: "email and subscription required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Upsert — one subscription per email (latest device wins)
  const { error } = await db
    .from("push_subscriptions")
    .upsert(
      { user_email: email.toLowerCase(), subscription },
      { onConflict: "user_email" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();
  await db.from("push_subscriptions").delete().eq("user_email", email.toLowerCase());
  return NextResponse.json({ success: true });
}
