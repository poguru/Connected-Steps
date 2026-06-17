import { NextRequest, NextResponse } from "next/server";
import { claimReferral } from "@/lib/referrals";
import { verifyUserToken } from "@/lib/admin-auth";

// POST /api/referrals/claim  { email, code }
// Called once from the dashboard after a newly-registered referred user logs in.
export async function POST(req: NextRequest) {
  const { email, code } = await req.json().catch(() => ({} as { email?: string; code?: string }));
  if (!email || !code) return NextResponse.json({ error: "email and code required" }, { status: 400 });

  const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!tokenEmail || tokenEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ok = await claimReferral(email, code);
  return NextResponse.json({ success: ok });
}
