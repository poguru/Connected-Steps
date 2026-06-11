import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * Returns a 403 NextResponse if the user's account is deactivated,
 * or null if the user is active (caller should proceed normally).
 *
 * Only blocks when is_active is explicitly false — unknown users pass through.
 */
export async function requireActiveUser(email: string): Promise<NextResponse | null> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("users")
    .select("is_active")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (data?.is_active === false) {
    return NextResponse.json(
      { error: "Account is deactivated" },
      { status: 403 }
    );
  }
  return null;
}
