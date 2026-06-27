import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET — per-email status breakdown for a batch
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void params; // id not needed — batch_id is globally unique

  const batch_id = req.nextUrl.searchParams.get("batch_id");
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("email_queue")
    .select("status, failure_code, failure_reason, is_permanent, recipient_email, attempts, aws_message_id, sent_at")
    .eq("batch_id", batch_id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows      = data ?? [];
  const total     = rows.length;
  const queued    = rows.filter(r => r.status === "queued").length;
  const sending   = rows.filter(r => r.status === "sending").length;
  const delivered = rows.filter(r => r.status === "delivered").length;
  const failed    = rows.filter(r => r.status === "failed").length;

  const failures = rows
    .filter(r => r.status === "failed")
    .map(r => ({
      email:        r.recipient_email,
      error:        r.failure_reason,
      code:         r.failure_code,
      is_permanent: r.is_permanent,
      attempts:     r.attempts,
    }));

  return NextResponse.json({ total, queued, sending, delivered, failed, failures });
}

// POST — re-queue transient failed emails for retry
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void params;

  const { batch_id } = await req.json() as { batch_id: string };
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Only re-queue non-permanent failures with < 5 total attempts
  const { error } = await db.from("email_queue")
    .update({ status: "queued" })
    .eq("batch_id", batch_id)
    .eq("status", "failed")
    .eq("is_permanent", false)
    .lt("attempts", 5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await db
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batch_id)
    .eq("status", "queued");

  return NextResponse.json({ requeued: count ?? 0 });
}
