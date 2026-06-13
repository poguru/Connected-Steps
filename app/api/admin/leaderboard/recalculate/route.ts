import { NextRequest, NextResponse } from "next/server";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";
import { isAdminOrCoach } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { month } = body as { month?: string };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Provide month as YYYY-MM" }, { status: 400 });
  }

  try {
    const result = await recalculateMonth(month);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
