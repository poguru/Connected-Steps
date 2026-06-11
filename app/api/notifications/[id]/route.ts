import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// PATCH /api/notifications/[id]  — mark single notification as read
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Require a valid user token.  Scope the update to that user so a guessed
  // UUID cannot be used to mark a different user's notification as read.
  const email = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_email", email.toLowerCase())  // ownership scope
    .is("read_at", null);

  return NextResponse.json({ success: true });
}
