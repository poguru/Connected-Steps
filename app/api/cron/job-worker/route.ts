import { NextRequest, NextResponse } from "next/server";
import { claimNextJobs, completeJob, failJob, type JobRow, type JobType, type JobPayloads } from "@/lib/job-queue";
import {
  handleInvoiceGenerate,
  handleEventQrEmail,
  handleMembershipEmail,
  handleReferralReward,
  handleBulkEmail,
  handleBulkInvoice,
  handleWeeklyDigestEmail,
  handleCertificateGenerate,
} from "@/lib/job-handlers";

// Runs every minute via Vercel Cron.
// Claims up to MAX_JOBS pending jobs, processes them sequentially, and marks
// each done or failed (with exponential-backoff retry up to max_attempts).
//
// Sequential (not parallel) processing keeps Supabase connection count low and
// makes logs easy to follow. At 20 jobs/min the queue drains fast enough for
// all real-world workloads — bulk batches spread across multiple invocations.

const MAX_JOBS = 20;

async function dispatch(job: JobRow): Promise<void> {
  const p = job.payload;
  switch (job.job_type as JobType) {
    case "invoice_generate":
      return handleInvoiceGenerate(p as JobPayloads["invoice_generate"]);
    case "event_qr_email":
      return handleEventQrEmail(p as JobPayloads["event_qr_email"]);
    case "membership_email":
      return handleMembershipEmail(p as JobPayloads["membership_email"]);
    case "referral_reward":
      return handleReferralReward(p as JobPayloads["referral_reward"]);
    case "bulk_email":
      return handleBulkEmail(p as JobPayloads["bulk_email"]);
    case "bulk_invoice":
      return handleBulkInvoice(p as JobPayloads["bulk_invoice"]);
    case "weekly_digest_email":
      return handleWeeklyDigestEmail(p as JobPayloads["weekly_digest_email"]);
    case "certificate_generate":
      return handleCertificateGenerate(p as JobPayloads["certificate_generate"]);
    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}

async function processJob(job: JobRow): Promise<"done" | "failed" | "dead"> {
  try {
    await dispatch(job);
    await completeJob(job.id);
    console.log(`[job-worker] done type=${job.job_type} id=${job.id} attempts=${job.attempts}`);
    return "done";
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[job-worker] failed type=${job.job_type} id=${job.id}` +
      ` attempts=${job.attempts}/${job.max_attempts} error="${msg}"`,
    );
    await failJob(job.id, msg, job.attempts, job.max_attempts);
    return job.attempts >= job.max_attempts ? "dead" : "failed";
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const jobs    = await claimNextJobs(MAX_JOBS);

  if (!jobs.length) {
    return NextResponse.json({ ok: true, processed: 0, durationMs: Date.now() - startMs });
  }

  let done = 0, failed = 0, dead = 0;

  for (const job of jobs) {
    const outcome = await processJob(job);
    if (outcome === "done")   done++;
    if (outcome === "failed") failed++;
    if (outcome === "dead")   dead++;
  }

  const durationMs = Date.now() - startMs;
  console.log(
    `[job-worker] processed=${jobs.length} done=${done} failed=${failed}` +
    ` dead=${dead} duration=${durationMs}ms`,
  );

  return NextResponse.json({ ok: true, processed: jobs.length, done, failed, dead, durationMs });
}
