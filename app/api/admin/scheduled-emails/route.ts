import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/scheduled-emails
// Returns all scheduled email batches across all events, sorted by scheduled_for ASC.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_comm_history")
    .select(`
      id, batch_id, subject, recipients, recipient_filter, scheduled_for, sent_at,
      event_id,
      events ( id, title, share_slug, start_date )
    `)
    .eq("status", "scheduled")
    .not("scheduled_for", "is", null)
    .order("scheduled_for", { ascending: true })
    .returns<{
      id: string;
      batch_id: string | null;
      subject: string;
      recipients: number;
      recipient_filter: string | null;
      scheduled_for: string;
      sent_at: string | null;
      event_id: string;
      events: { id: string; title: string; share_slug: string | null; start_date: string } | null;
    }[]>();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ scheduled: data ?? [] });
}
