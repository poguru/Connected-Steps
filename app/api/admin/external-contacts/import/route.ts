import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { parseImportBuffer } from "@/lib/external-contacts-import";

// POST /api/admin/external-contacts/import
// FormData: file, dry_run (true|false), duplicate_handling (skip|update|merge),
//           compliance_acknowledged (true|false), list_ids (JSON array of UUIDs)
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file     = formData.get("file") as File | null;
  const dryRun   = formData.get("dry_run") === "true";
  const dupHandling = (formData.get("duplicate_handling") as string) || "skip";
  const complianceAck = formData.get("compliance_acknowledged") === "true";
  const listIdsRaw    = formData.get("list_ids");
  const listIds: string[] = listIdsRaw ? JSON.parse(String(listIdsRaw)) : [];

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (!dryRun && !complianceAck) {
    return NextResponse.json({ error: "Compliance acknowledgment is required before importing" }, { status: 400 });
  }

  const filename = file.name;
  const ext      = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    return NextResponse.json({ error: "Only .xlsx, .xls, and .csv files are supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows;
  try {
    rows = parseImportBuffer(buffer, filename);
  } catch (err) {
    return NextResponse.json({ error: `Failed to parse file: ${(err as Error).message}` }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "The file appears to be empty or has no data rows" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Check duplicates against existing contacts
  const emails  = rows.map(r => r.email).filter(Boolean) as string[];
  const mobiles = rows.map(r => r.mobile).filter(Boolean) as string[];
  const was     = rows.map(r => r.whatsapp_number).filter(Boolean) as string[];

  const [{ data: existingByEmail }, { data: existingByMobile }, { data: existingByWa }] = await Promise.all([
    emails.length  ? db.from("external_contacts").select("id, email").in("email", emails) : Promise.resolve({ data: [] }),
    mobiles.length ? db.from("external_contacts").select("id, mobile").in("mobile", mobiles) : Promise.resolve({ data: [] }),
    was.length     ? db.from("external_contacts").select("id, whatsapp_number").in("whatsapp_number", was) : Promise.resolve({ data: [] }),
  ]);

  const emailMap:  Map<string, string> = new Map((existingByEmail  ?? []).map(r => [r.email!, r.id]));
  const mobileMap: Map<string, string> = new Map((existingByMobile ?? []).map(r => [r.mobile!, r.id]));
  const waMap:     Map<string, string> = new Map((existingByWa     ?? []).map(r => [r.whatsapp_number!, r.id]));

  for (const row of rows) {
    if (row.email    && emailMap.has(row.email))             row.isDuplicate = { field: "email",    existingId: emailMap.get(row.email)! };
    else if (row.mobile && mobileMap.has(row.mobile))        row.isDuplicate = { field: "mobile",   existingId: mobileMap.get(row.mobile)! };
    else if (row.whatsapp_number && waMap.has(row.whatsapp_number)) row.isDuplicate = { field: "whatsapp", existingId: waMap.get(row.whatsapp_number)! };
  }

  // Dry run: return preview
  if (dryRun) {
    const valid      = rows.filter(r => r.errors.length === 0);
    const withErrors = rows.filter(r => r.errors.length > 0);
    const duplicates = rows.filter(r => r.isDuplicate);
    return NextResponse.json({
      preview:    rows.slice(0, 100), // cap preview at 100 rows
      total:      rows.length,
      valid:      valid.length,
      errors:     withErrors.length,
      duplicates: duplicates.length,
    });
  }

  // Actual import
  const importRecord = await db.from("contact_import_history").insert({
    filename, file_type: ext, duplicate_handling: dupHandling,
    total_rows: rows.length, status: "processing",
    compliance_acknowledged: complianceAck,
    list_ids: listIds.length ? listIds : null,
    imported_by: "admin",
  }).select().single();

  const importId = importRecord.data?.id;
  let imported = 0, updated = 0, skipped = 0, failed = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const row of rows) {
    if (row.errors.length > 0) {
      failed++;
      errors.push({ row: row.row, message: row.errors.join("; ") });
      continue;
    }

    const payload = {
      full_name:        row.full_name,
      company_name:     row.company_name  ?? null,
      designation:      row.designation   ?? null,
      email:            row.email         ?? null,
      mobile:           row.mobile        ?? null,
      whatsapp_number:  row.whatsapp_number ?? null,
      city:             row.city          ?? null,
      state:            row.state         ?? null,
      country:          row.country       ?? "India",
      tags:             row.tags          ?? [],
      notes:            row.notes         ?? null,
      email_consent:    row.email_consent    ?? false,
      whatsapp_consent: row.whatsapp_consent ?? false,
      sms_consent:      row.sms_consent      ?? false,
      consent_date:     (row.email_consent || row.whatsapp_consent) ? new Date().toISOString() : null,
      consent_source:   "import",
      source:           "import",
      import_id:        importId ?? null,
      is_active:        true,
      do_not_contact:   false,
    };

    try {
      if (row.isDuplicate) {
        if (dupHandling === "skip") {
          skipped++;
          continue;
        } else if (dupHandling === "update" || dupHandling === "merge") {
          const { error } = await db.from("external_contacts")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", row.isDuplicate.existingId);
          if (error) { failed++; errors.push({ row: row.row, message: error.message }); }
          else {
            updated++;
            await db.from("external_contact_activity").insert({
              contact_id: row.isDuplicate.existingId, activity_type: "updated",
              details: { source: "import", filename },
            });
          }
          continue;
        }
      }

      const { data: created, error } = await db.from("external_contacts").insert(payload).select("id").single();
      if (error) {
        if (error.code === "23505") { skipped++; continue; }
        failed++;
        errors.push({ row: row.row, message: error.message });
      } else {
        imported++;
        if (created) {
          await db.from("external_contact_activity").insert({
            contact_id: created.id, activity_type: "imported",
            details: { source: "import", filename },
          });
          // Add to selected lists
          if (listIds.length) {
            await db.from("contact_list_members").upsert(
              listIds.map(lid => ({ list_id: lid, contact_id: created.id, added_by: "admin" })),
              { ignoreDuplicates: true }
            );
          }
        }
      }
    } catch (e) {
      failed++;
      errors.push({ row: row.row, message: (e as Error).message });
    }
  }

  // Update import record
  if (importId) {
    await db.from("contact_import_history").update({
      status: "completed", imported, updated, skipped, failed,
      errors: errors.slice(0, 200),
    }).eq("id", importId);
  }

  return NextResponse.json({ imported, updated, skipped, failed, errors: errors.slice(0, 50), import_id: importId });
}
