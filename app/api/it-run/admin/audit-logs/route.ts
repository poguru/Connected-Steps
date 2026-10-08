import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyItRunAdmin } from "@/lib/it-run-admin-auth";

// GET /api/it-run/admin/audit-logs
// Returns audit logs for admin actions
// Admin access only
export async function GET(req: NextRequest) {
  const adminEmail = await verifyItRunAdmin(req);
  if (!adminEmail) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("it_run_audit_logs")
    .select("id, action, admin_email, resource_type, resource_id, details, timestamp")
    .order("timestamp", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[admin/audit-logs] error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    logs: (data ?? []).map((log: any) => ({
      id: log.id,
      action: log.action,
      admin_email: log.admin_email,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      details: log.details ? JSON.parse(typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : null,
      timestamp: log.timestamp,
    })),
  });
}
