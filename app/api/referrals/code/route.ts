import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCode } from "@/lib/referrals";
import { verifyUserToken } from "@/lib/admin-auth";

import { APP_URL } from "@/lib/config";
// GET /api/referrals/code?email=
export async function GET(req: NextRequest) {
  const email      = req.nextUrl.searchParams.get("email") ?? "";
  const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!tokenEmail || tokenEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const code     = await getOrCreateCode(email);
    const appUrl = APP_URL;
    const shareUrl = `${appUrl}/invite/${code}`;
    return NextResponse.json({ code, shareUrl });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
