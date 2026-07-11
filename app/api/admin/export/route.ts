import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import { enqueueJob } from "@/lib/job-queue";

// POST /api/admin/export
// Enqueues a background CSV or ZIP export.  Returns immediately with the
// export record ID so the caller can poll /api/admin/export/[id] for status.
//
// Body: { dataset, format?, filters? }
//   dataset  "users" | "memberships" | "registrations" | "referrals"
//   format   "csv" (default) | "zip"
//   filters  { event_id?, status?, q?, ... }
//
// GET /api/admin/export
// Lists the most recent 20 exports requested by the authenticated admin.

const VALID_DATASETS = new Set(["users", "memberships", "registrations", "referrals"]);

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body    = await req.json().catch(() => ({})) as Record<string, unknown>;
  const dataset = String(body.dataset ?? "");
  const format  = String(body.format  ?? "csv") as "csv" | "zip";
  const filters = (body.filters ?? {}) as Record<string, string>;

  if (!VALID_DATASETS.has(dataset)) {
    return NextResponse.json({ error: `dataset must be one of: ${[...VALID_DATASETS].join(", ")}` }, { status: 400 });
  }
  if (format !== "csv" && format !== "zip") {
    return NextResponse.json({ error: "format must be csv or zip" }, { status: 400 });
  }

  const requestedBy = getAdminEmail(req) ?? "admin";
  const db          = getSupabaseServer();

  // Create the export tracking record first
  const { data: exportRow, error: createErr } = await db
    .from("admin_exports")
    .insert({ dataset, format, filters, requested_by: requestedBy, status: "pending" })
    .select("id")
    .single();

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });

  const exportId = (exportRow as { id: string }).id;

  // Enqueue background job â€” no idempotency key so multiple exports of the
  // same dataset can coexist (admin may want fresh copies).
  await enqueueJob("admin_export", {
    exportId,
    dataset: dataset as "users" | "memberships" | "registrations" | "referrals",
    format,
    filters,
    requestedBy,
  }, { priority: -10, maxAttempts: 2 }); // low priority, only 2 attempts (exports are expensive)

  return NextResponse.json({ exportId, status: "pending" }, { status: 202 });
}

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("admin_exports")
    .select("id, dataset, format, status, row_count, file_path, error, requested_by, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ exports: data ?? [] });
}
