import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/communicate/report?batch_id=xxx
// Streams a CSV delivery report for the given campaign batch.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void params;

  const batch_id = req.nextUrl.searchParams.get("batch_id");
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("email_queue")
    .select("recipient_email, recipient_name, status, attempts, sent_at, failure_reason, failure_code, is_permanent")
    .eq("batch_id", batch_id)
    .order("created_at");

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  function escape(v: unknown): string {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
  }

  const rows = data ?? [];
  const lines = [
    ["Email", "Name", "Status", "Attempts", "Sent At", "Error", "Error Code", "Permanent Failure"].map(escape).join(","),
    ...rows.map(r =>
      [
        r.recipient_email,
        r.recipient_name ?? "",
        r.status,
        r.attempts,
        r.sent_at ?? "",
        r.failure_reason ?? "",
        r.failure_code ?? "",
        r.is_permanent ?? "",
      ].map(escape).join(",")
    ),
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${batch_id.slice(0, 8)}-report.csv"`,
    },
  });
}
