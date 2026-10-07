/**
 * POST /api/auth/debug-email-lookup
 *
 * TEMPORARY DIAGNOSTIC ENDPOINT
 * Tests email lookup against the users table
 *
 * Body: { email: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const emailNorm = (email as string).toLowerCase().trim();
    const db = getSupabaseServer();

    console.log(`[debug-email-lookup] testing email: "${email}" → normalized: "${emailNorm}"`);

    // Test 1: Exact match
    const { data: exactUser, error: exactError } = await db
      .from("users")
      .select("id, email, first_name, last_name, phone, is_active")
      .eq("email", emailNorm)
      .maybeSingle();

    console.log(`[debug-email-lookup] exact match: found=${!!exactUser}, error=${exactError?.code || "none"}`);

    // Test 2: Case-insensitive
    const { data: ilikeUser, error: ilikeError } = await db
      .from("users")
      .select("id, email, first_name, last_name, phone, is_active")
      .ilike("email", emailNorm)
      .maybeSingle();

    console.log(`[debug-email-lookup] ilike match: found=${!!ilikeUser}, error=${ilikeError?.code || "none"}`);

    // Test 3: Count all users in database
    const { count: totalUsers, error: countError } = await db
      .from("users")
      .select("*", { count: "exact", head: true });

    // Test 4: Find users with similar username
    const username = emailNorm.split("@")[0];
    const { data: similarUsers, error: similarError } = await db
      .from("users")
      .select("id, email, first_name, last_name")
      .ilike("email", `%${username}%`)
      .limit(5);

    return NextResponse.json({
      input: { email, emailNorm },
      tests: {
        exactMatch: {
          found: !!exactUser,
          user: exactUser,
          error: exactError?.message,
        },
        ilikeMatch: {
          found: !!ilikeUser,
          user: ilikeUser,
          error: ilikeError?.message,
        },
        totalUsers: totalUsers,
        similarUsers: similarUsers || [],
      },
    });
  } catch (e: unknown) {
    console.error("[debug-email-lookup] error:", e);
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}
