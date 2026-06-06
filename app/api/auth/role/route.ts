import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signCoachToken } from "@/lib/admin-auth";

// GET /api/auth/role?email=  — returns current role + coachToken for the email
// Called by the mobile app on startup to refresh a cached user's role
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email");
  if (!email) return NextResponse.json({ role: "user" });

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
