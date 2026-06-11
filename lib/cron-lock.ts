import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * Attempts to claim the execution slot for (jobName, executionDate).
 *
 * Returns true  — lock acquired, proceed with the job.
 * Returns false — row already exists, job already ran for this date; skip.
 *
 * Fails open on unexpected DB errors: if the cron_runs table is
 * unavailable, we log and return true so the job still runs rather
 * than silently doing nothing.
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

  // PostgreSQL unique-violation code — job already ran for this date
  if (error.code === "23505") return false;

  // Unexpected error: log but let the job proceed rather than silently skip
  console.error(`[cron-lock] unexpected error for ${jobName}/${executionDate}:`, error.message);
  return true;
}
