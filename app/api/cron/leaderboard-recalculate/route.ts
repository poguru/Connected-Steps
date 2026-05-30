import { NextRequest, NextResponse } from "next/server";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";

// Vercel sends Authorization: Bearer <CRON_SECRET> on every cron invocation.
// Set CRON_SECRET in Vercel project environment variables.
function auth(req: NextRequest) {
  const header = req.headers.get("authorization");
  return header === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Runs daily → always recalculate the current month
  const now   = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  try {
    const result = await recalculateMonth(month);
    console.log(`[cron] leaderboard-recalculate: ${result.message}`);
    return NextResponse.json({ month, ...result });
  } catch (e: unknown) {
    console.error("[cron] leaderboard-recalculate error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
