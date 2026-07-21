import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip  = getClientIp(req);
  const key = `verify-email:${ip}`;
  if (await isRateLimited(key, 20)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const plainToken = (body.token ?? "").trim();

  if (!plainToken) {
    return NextResponse.json({ error: "Verification token is required." }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(plainToken).digest("hex");
  const db = getSupabaseServer();

  const { data: record } = await db
    .from("email_verification_tokens")
    .select("id, email, verified, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired verification link." }, { status: 400 });
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: "This verification link has expired. Please request a new one." }, { status: 400 });
  }

  if (!record.verified) {
    await db
      .from("email_verification_tokens")
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq("id", record.id);

    // If the user already exists (e.g. registered but never verified), mark them verified too
    await db
      .from("users")
      .update({ email_verified: true })
      .eq("email", record.email)
      .eq("email_verified", false);
  }

  return NextResponse.json({ success: true, email: record.email });
}
