import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signCoachToken, verifyUserToken } from "@/lib/admin-auth";

// GET /api/auth/role — returns current role + coachToken for the authenticated user
// Requires x-user-token header. Email is derived from the verified token, not from query params.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = verifyUserToken(token);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("users")
    .select("role")
    .eq("email", email.toLowerCase())
    .single();

  const role       = (data?.role as string) ?? "user";
  const coachToken = role === "coach" ? signCoachToken(email.toLowerCase()) : undefined;

  return NextResponse.json({ role, coachToken });
}
