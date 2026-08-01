import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paginateAll } from "@/lib/paginate";

// Runs on the 1st of every month at 00:05 IST (18:35 UTC prev day) via Vercel Cron.
// Snapshots current monthly ranks into prev_month_rank so movement indicators
// on the leaderboard reflect how each user moved vs the previous month.
//
// Scale: O(N/CHUNK) round-trips instead of O(N).
// Each round-trip is one SQL UPDATE … FROM unnest(emails, ranks).

export const CHUNK      = 1000;  // rows per RPC call — exported for test assertions
export const MAX_RETRIES = 3;    // attempts per chunk before marking as failed

type DB = ReturnType<typeof getSupabaseServer>;

async function chunkWithRetry(
  db:       DB,
  emails:   string[],
  ranks:    number[],
  chunkIdx: number,
): Promise<{ affected: number; error: string | null }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await db.rpc("set_prev_month_ranks", {
      p_emails: emails,
      p_ranks:  ranks,
    });

    if (!error) {
      return { affected: (data as number) ?? emails.length, error: null };
    }

    console.error(
      `[rank-snapshot] chunk=${chunkIdx} attempt=${attempt}/${MAX_RETRIES} error="${error.message}"`,
    );

    if (attempt < MAX_RETRIES) {
      await new Promise<void>(r => setTimeout(r, attempt * 500));
    }
  }

  return {
    affected: 0,
    error:    `chunk ${chunkIdx} failed after ${MAX_RETRIES} attempts`,
  };
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startMs = Date.now();
  const db      = getSupabaseServer();

  // Paginated read — leaderboard can exceed 1000 rows per page at scale
  const { rows: entries, pages } = await paginateAll<{
    user_email:   string;
    month_points: number;
  }>(
    (from, to) =>
      db.from("leaderboard")
        .select("user_email, month_points")
        .order("month_points", { ascending: false })
        .order("user_email")          // stable secondary sort for consistent pagination
        .range(from, to),
  );

  if (!entries.length) {
    console.log(`[rank-snapshot] no entries found duration=${Date.now() - startMs}ms`);
    return NextResponse.json({ ok: true, updated: 0, total: 0 });
  }

  // ── Assign competition ranks (unchanged logic) ────────────────────────────
  // Tied scores share the same rank; the next rank skips (dense_rank-style is
  // NOT used — matches the leaderboard UI's movement calculation).
  const emails: string[] = [];
  const ranks:  number[] = [];
  let rank = 1;

  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].month_points < entries[i - 1].month_points) rank = i + 1;
    emails.push(entries[i].user_email);
    ranks.push(rank);
  }

  // ── Chunked RPC — one SQL UPDATE per chunk, not one per row ──────────────
  let totalAffected = 0;
  const errors: string[] = [];
  const totalChunks = Math.ceil(emails.length / CHUNK);

  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunkIdx    = Math.floor(i / CHUNK);
    const chunkEmails = emails.slice(i, i + CHUNK);
    const chunkRanks  = ranks.slice(i, i + CHUNK);

    const { affected, error } = await chunkWithRetry(db, chunkEmails, chunkRanks, chunkIdx);
    totalAffected += affected;
    if (error) errors.push(error);
  }

  const durationMs = Date.now() - startMs;

  console.log(
    `[rank-snapshot] users=${emails.length} chunks=${totalChunks} pages=${pages}` +
    ` updated=${totalAffected} errors=${errors.length} duration=${durationMs}ms`,
  );
  if (errors.length) {
    console.error("[rank-snapshot] chunk errors:", errors);
  }

  return NextResponse.json({
    ok:        errors.length === 0,
    updated:   totalAffected,
    total:     emails.length,
    chunks:    totalChunks,
    errors:    errors.length ? errors : undefined,
    durationMs,
  });
}
