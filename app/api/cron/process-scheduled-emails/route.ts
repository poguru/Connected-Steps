import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { processEmailBatch } from "@/lib/process-email-batch";

// POST /api/cron/process-scheduled-emails
// Called by Vercel cron every hour to start sending email batches whose
// scheduled_for time has arrived.
// Also accepts x-cron-secret header for manual triggering from admin UI.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET ?? "";

  // Allow Vercel cron (no auth) or manual trigger with secret
  const isVercelCron = req.headers.get("x-vercel-cron-signature") !== null;
  const hasSecret    = cronSecret && (secret === cronSecret || secret === `Bearer ${cronSecret}`);

  if (!isVercelCron && !hasSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Find scheduled batches that are now due
  const { data: dueBatches } = await db
    .from("event_comm_history")
    .select("batch_id, event_id, subject, recipients")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .limit(10);  // process at most 10 batches per run to stay within timeout

  if (!dueBatches || dueBatches.length === 0) {
    return NextResponse.json({ processed: 0, message: "No scheduled batches due" });
  }

  // Mark them as queued so they don't get picked up again before processing starts
  const batchIds = dueBatches.map(b => b.batch_id).filter(Boolean) as string[];
  await db.from("event_comm_history").update({ status: "queued" }).in("batch_id", batchIds);

  // Process each batch after response (non-blocking)
  for (const batch of dueBatches) {
    if (batch.batch_id) {
      const batchId = batch.batch_id;
      after(() => processEmailBatch(batchId));
    }
  }

  return NextResponse.json({ processed: dueBatches.length, batch_ids: batchIds });
}
