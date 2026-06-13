import { NextRequest, NextResponse } from "next/server";
import { getOwnerByCode } from "@/lib/referrals";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/referrals/info?code=CODE
// Public — no auth required. Returns referrer's first name so the invite
// landing page can show "You've been invited by [Name]".
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!code) return NextResponse.json({ referrerName: null }, { status: 200 });

  const referrerEmail = await getOwnerByCode(code);
  if (!referrerEmail) return NextResponse.json({ referrerName: null }, { status: 200 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("users")
    .select("first_name")
    .eq("email", referrerEmail)
    .single();

  return NextResponse.json({ referrerName: data?.first_name ?? null });
}
