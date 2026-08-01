import { type NextRequest } from "next/server";

// Vercel sets Authorization: Bearer <CRON_SECRET> on every cron invocation.
// During development CRON_SECRET is unset, so the check is skipped.
// Returns true when the request is authorized to run cron logic.
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / CI — no secret set
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
