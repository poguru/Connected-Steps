import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { processEmailBatch } from "@/lib/process-email-batch";

// POST — resume server-side processing for a stuck batch
// (emails stuck in 'queued' status because the prior delivery attempt was interrupted)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void params;

  const { batch_id } = await req.json() as { batch_id: string };
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();

  const { count } = await db
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batch_id)
    .eq("status", "queued");

  if (!count || count === 0) {
    return NextResponse.json({ error: "No queued emails found for this batch. Use Retry for failed emails." }, { status: 400 });
  }

  after(() => processEmailBatch(batch_id));
  return NextResponse.json({ resumed: count });
}
