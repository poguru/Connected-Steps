import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";

/**
 * Cron-triggered media cleanup job.
 *
 * Schedule: Run daily (e.g. 02:00 IST) via Vercel Cron, GitHub Actions,
 * or any external scheduler.
 *
 * Authentication: CRON_SECRET via Authorization: Bearer (Vercel cron standard).
 *
 * It simply delegates to /api/admin/media/cleanup which contains all
 * the deletion logic, so the cleanup logic is not duplicated.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Delegate to the admin cleanup route, passing the cron secret as auth
  const base = new URL(req.url).origin;
  const res  = await fetch(`${base}/api/admin/media/cleanup`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "x-cron-secret": process.env.CRON_SECRET ?? "",
    },
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

export const runtime = "edge";
