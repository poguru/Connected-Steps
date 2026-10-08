import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/admin/search-users?email=...
// Searches for Connected Steps users by email
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");

  if (!email || email.trim().length === 0) {
    return NextResponse.json({ users: [] });
  }

  const db = getSupabaseServer();

  // Search by exact email or partial match
  const { data, error } = await db
    .from("users")
    .select("email, first_name, last_name")
    .or(
      `email.ilike.%${email.trim()}%,` +
      `first_name.ilike.%${email.trim()}%,` +
      `last_name.ilike.%${email.trim()}%`
    )
    .limit(10);

  if (error) {
    console.error("[admin/search-users] error:", error.message);
    return NextResponse.json({ users: [] });
  }

  return NextResponse.json({
    users: (data ?? []).map((u: any) => ({
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
    })),
  });
}
