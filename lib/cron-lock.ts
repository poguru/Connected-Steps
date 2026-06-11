import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * Attempts to claim the execution slot for (jobName, executionDate).
 *
 * IMPORTANT: call this AFTER all data fetches have succeeded.
 * If the lock is acquired before fetching and the fetch fails, the lock
 * row is already committed — Vercel retries will see the row and skip,
 * permanently losing that day's run.
 *
 * Returns true  — lock acquired, proceed with sending.
 * Returns false — row already exists, job already ran for this date; skip.
 *
 * Fails open on unexpected DB errors so jobs still run if the
 * cron_runs table is temporarily unavailable.
 */
export async function acquireCronLock(
  jobName:       string,
  executionDate: string,   // YYYY-MM-DD
): Promise<boolean> {
  const db = getSupabaseServer();

  const { error } = await db
    .from("cron_runs")
    .insert({ job_name: jobName, execution_date: executionDate });

  if (!error) return true;

  // Duplicate key — job already ran (or is currently running) for this date
  if (error.code === "23505") return false;

  // Unexpected error: log but let the job proceed rather than silently skip
  console.error(`[cron-lock] unexpected error for ${jobName}/${executionDate}:`, error.message);
  return true;
}

/**
 * Releases a previously acquired lock by deleting the cron_runs row.
 *
 * Call this in the catch block when execution fails after lock acquisition,
 * so the Vercel retry can re-acquire the lock and re-attempt sending.
 *
 * If the delete itself fails the error is logged but not re-thrown —
 * a failed release means the retry won't run that day, which is safer
 * than an infinite retry loop.
 */
export async function releaseCronLock(
  jobName:       string,
  executionDate: string,
): Promise<void> {
  const db = getSupabaseServer();

  const { error } = await db
    .from("cron_runs")
    .delete()
    .eq("job_name",       jobName)
    .eq("execution_date", executionDate);

  if (error) {
    console.error(`[cron-lock] failed to release lock for ${jobName}/${executionDate}:`, error.message);
  }
}
