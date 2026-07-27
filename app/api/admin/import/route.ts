import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { parseCsvSimple, validateImportRows } from "@/lib/csv-utils";

const VALID_ENTITY_TYPES = ["participants", "registrations", "volunteers", "merchandise", "sponsors", "coupons"] as const;
type EntityType = typeof VALID_ENTITY_TYPES[number];

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const page     = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const per_page = Math.min(50, Math.max(1, Number(url.searchParams.get("per_page") ?? 20)));

  const db = getSupabaseServer();
  const { data, count, error } = await db
    .from("import_jobs")
    .select("id, entity_type, status, file_name, total_rows, valid_rows, error_rows, created_rows, error_message, created_by, event_id, committed_at, created_at", { count: "exact" })
    .eq("organization_id", org_id)
    .order("created_at", { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  if (error) return NextResponse.json({ error: "Failed to fetch imports" }, { status: 500 });

  const total = count ?? 0;
  return NextResponse.json({
    data: data ?? [],
    meta: { total, page, per_page, pages: Math.ceil(total / per_page) },
    available_entity_types: VALID_ENTITY_TYPES,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const org_id      = form.get("org_id")      as string | null;
  const entity_type = form.get("entity_type") as string | null;
  const event_id    = form.get("event_id")    as string | null;
  const file        = form.get("file")        as File | null;

  if (!org_id || !entity_type || !file) {
    return NextResponse.json({ error: "org_id, entity_type, and file are required" }, { status: 400 });
  }
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(VALID_ENTITY_TYPES as readonly string[]).includes(entity_type)) {
    return NextResponse.json({ error: `Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!file.name.endsWith(".csv")) {
    return NextResponse.json({ error: "Only .csv files are supported" }, { status: 400 });
  }
  const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 413 });
  }

  const db          = getSupabaseServer();
  const storagePath = `imports/${org_id}/${Date.now()}-${file.name}`;

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await db.storage.from("imports").upload(storagePath, fileBuffer, {
    contentType: "text/csv",
    upsert:      false,
  });
  if (uploadErr) return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });

  const text = fileBuffer.toString("utf-8");
  const rows = parseCsvSimple(text);
  const { valid_rows, error_rows, validation_report } = validateImportRows(rows, entity_type);

  const { data: job, error: jobErr } = await db
    .from("import_jobs")
    .insert({
      organization_id:   org_id,
      entity_type:       entity_type as EntityType,
      status:            "validated",
      file_name:         file.name,
      total_rows:        rows.length,
      valid_rows,
      error_rows,
      storage_path:      storagePath,
      validation_report: validation_report.flatMap((errs, i) => errs.map(e => ({ ...e, row_index: i }))),
      created_by:        actorEmail(ctx),
      event_id:          event_id ?? null,
    })
    .select("id, entity_type, status, file_name, total_rows, valid_rows, error_rows, created_at")
    .single();

  if (jobErr || !job) {
    await db.storage.from("imports").remove([storagePath]);
    return NextResponse.json({ error: "Failed to create import job" }, { status: 500 });
  }

  const errorSample = validation_report
    .flatMap((errs, i) => errs.map(e => ({ ...e, row_index: i + 1 })))
    .filter(e => e.error)
    .slice(0, 50);

  return NextResponse.json({
    data:          { ...job, error_sample: errorSample },
    can_commit:    error_rows === 0,
    message:       error_rows === 0
      ? `All ${rows.length} rows are valid. Call POST /api/admin/import/${(job as { id: string }).id}/commit to import.`
      : `${error_rows} of ${rows.length} rows have errors. Fix the CSV and re-upload.`,
  }, { status: 201 });
}
