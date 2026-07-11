import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/user/change-email
// Body: { currentEmail, newEmail, otp }
//
// Flow:
//   1. Verify the OTP that was sent to newEmail is correct and unexpired.
//   2. Call the change_user_email DB function which updates every table
//      that stores email in a single transaction.
//   3. Mark the OTP as used and return the updated user data.
export async function POST(req: NextRequest) {
  try {
    const { currentEmail, newEmail, otp } = await req.json();

    if (!currentEmail || !newEmail || !otp) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const oldEmail = (currentEmail as string).toLowerCase().trim();
    const nextEmail = (newEmail as string).toLowerCase().trim();

    if (oldEmail === nextEmail) {
      return NextResponse.json({ error: "This is already your current email." }, { status: 400 });
    }

    const db = getSupabaseServer();

    // â”€â”€ 1. Verify OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { data: otpRow, error: otpErr } = await db
      .from("otp_verifications")
      .select("id, code, expires_at, verified")
      .eq("identifier", nextEmail)
      .eq("type", "email")
      .single();

    if (otpErr || !otpRow) {
      return NextResponse.json({ error: "Verification code not found. Please request a new one." }, { status: 400 });
    }
    if (otpRow.verified) {
      return NextResponse.json({ error: "Code already used. Please request a new one." }, { status: 400 });
    }
    if (new Date(otpRow.expires_at) < new Date()) {
      return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
    }
    if (otpRow.code !== String(otp).trim()) {
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    // â”€â”€ 2. Update email across all tables (single DB transaction) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { error: rpcErr } = await db.rpc("change_user_email", {
      p_old_email: oldEmail,
      p_new_email: nextEmail,
    });

    if (rpcErr) {
      // Surface meaningful errors (e.g. "Email already in use")
      const msg = rpcErr.message?.includes("already in use")
        ? "This email is already in use by another account."
        : "Failed to update email. Please try again.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // â”€â”€ 3. Mark OTP as used â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await db.from("otp_verifications").update({ verified: true }).eq("id", otpRow.id);

    return NextResponse.json({ success: true, email: nextEmail });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
