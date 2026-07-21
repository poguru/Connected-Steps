import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// Polling endpoint used by the signup form to detect when a user has clicked
// the verification link in their inbox.
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ verified: false });
  }

  const db = getSupabaseServer();

  const { data } = await db
    .from("email_verification_tokens")
    .select("verified")
    .eq("email", email)
    .eq("verified", true)
    .maybeSingle();

  return NextResponse.json({ verified: !!data });
}
