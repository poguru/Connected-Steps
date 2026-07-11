import { NextRequest, NextResponse } from "next/server";
import { getReferralStats } from "@/lib/referrals";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/referrals/stats?email=
export async function GET(req: NextRequest) {
  const email      = req.nextUrl.searchParams.get("email") ?? "";
  const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!tokenEmail || tokenEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getReferralStats(email);
    return NextResponse.json(stats);
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
