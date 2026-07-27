import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { enqueueJob } from "@/lib/job-queue";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  const { data: job } = await db
    .from("import_jobs")
    .select("id, organization_id, entity_type, status, error_rows, storage_path, event_id, file_name")
    .eq("id", id)
    .single();

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, (job as { organization_id: string }).organization_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobData = job as {
    id: string;
    organization_id: string;
    entity_type: string;
    status: string;
    error_rows: number;
    storage_path: string | null;
    event_id: string | null;
    file_name: string;
  };

  if (jobData.status !== "validated") {
    return NextResponse.json({
      error: `Cannot commit import with status "${jobData.status}". Only "validated" imports can be committed.`,
    }, { status: 400 });
  }
  if (jobData.error_rows > 0) {
    return NextResponse.json({
      error: `Cannot commit: ${jobData.error_rows} rows have validation errors. Fix the CSV and re-upload.`,
    }, { status: 400 });
  }
  if (!jobData.storage_path) {
    return NextResponse.json({ error: "No file found for this import job" }, { status: 400 });
  }

  // Mark as committing before enqueueing so duplicate commits are rejected
  const { error: updateErr } = await db
    .from("import_jobs")
    .update({ status: "committing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "validated"); // optimistic lock

  if (updateErr) return NextResponse.json({ error: "Commit failed — concurrent update detected" }, { status: 409 });

  await enqueueJob("import_csv", {
    import_id:    id,
    entity_type:  jobData.entity_type,
    storage_path: jobData.storage_path,
    event_id:     jobData.event_id ?? undefined,
  }, {
    idempotencyKey: `import:${id}`,
  });

  await writeOrgAudit({
    organization_id: jobData.organization_id,
    action:          "import.committed",
    actor_email:     actorEmail(ctx),
    resource_type:   "import_job",
    resource_id:     id,
    detail:          { entity_type: jobData.entity_type, file_name: jobData.file_name },
  });

  return NextResponse.json({
    data: { id, status: "committing" },
    message: "Import queued. Poll GET /api/admin/import/" + id + " for status.",
  }, { status: 202 });
}
