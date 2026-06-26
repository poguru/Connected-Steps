import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/events/[id]/results/import
// Bulk-imports results from CSV text.
//
// Expected CSV columns (header row required, order flexible):
//   bib_number, user_name, user_email, distance_category,
//   finish_time, gun_time_secs, pace, overall_position, category_position, status
//
// Body: { csv: string, auto_rank?: boolean }
//   auto_rank=true  — automatically compute overall and category positions
//                     from gun_time_secs after import.

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body     = await req.json() as { csv?: string; auto_rank?: boolean };
  const csvText  = body.csv?.trim() ?? "";
  const autoRank = body.auto_rank === true;

  if (!csvText) return NextResponse.json({ error: "csv field is required" }, { status: 400 });

  // Parse CSV
  const lines  = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });

  const headerRaw = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (col: string) => headerRaw.indexOf(col);

  const rows = lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      bib_number:        cells[idx("bib_number")]        ?? cells[idx("bib")] ?? null,
      user_name:         cells[idx("user_name")]          ?? cells[idx("name")] ?? cells[idx("participant")] ?? "",
      user_email:        cells[idx("user_email")]         ?? cells[idx("email")] ?? "",
      distance_category: cells[idx("distance_category")] ?? cells[idx("category")] ?? cells[idx("distance")] ?? null,
      finish_time:       cells[idx("finish_time")]        ?? cells[idx("time")] ?? null,
      gun_time_secs:     cells[idx("gun_time_secs")]      ? Number(cells[idx("gun_time_secs")]) : null,
      pace:              cells[idx("pace")]               ?? null,
      overall_position:  cells[idx("overall_position")]  ? Number(cells[idx("overall_position")]) : null,
      category_position: cells[idx("category_position")] ? Number(cells[idx("category_position")]) : null,
      status:            cells[idx("status")]             ?? "finisher",
    };
  }).filter(r => r.user_email || r.bib_number); // skip blank rows

  if (!rows.length) return NextResponse.json({ error: "No valid data rows found" }, { status: 400 });

  const db = getSupabaseServer();

  // Resolve emails from bib numbers where email is missing
  const bibEmails: Record<string, { email: string; name: string; code: string }> = {};
  const bibsToResolve = rows.filter(r => !r.user_email && r.bib_number).map(r => r.bib_number!);
  if (bibsToResolve.length > 0) {
    const { data: regs } = await db
      .from("event_registrations")
      .select("user_email, user_name, registration_code, bib_number")
      .eq("event_id", eventId)
      .in("bib_number", bibsToResolve);
    for (const r of regs ?? []) {
      if (r.bib_number) bibEmails[r.bib_number] = { email: r.user_email, name: r.user_name, code: r.registration_code };
    }
  }

  // Build upsert rows
  const upsertRows = rows.map(r => {
    const resolved = r.bib_number ? bibEmails[r.bib_number] : null;
    return {
      event_id:          eventId,
      user_email:        (r.user_email || resolved?.email || "").toLowerCase().trim(),
      user_name:         r.user_name || resolved?.name || "Unknown",
      registration_code: resolved?.code ?? null,
      bib_number:        r.bib_number,
      distance_category: r.distance_category,
      finish_time:       r.finish_time,
      gun_time_secs:     r.gun_time_secs,
      pace:              r.pace,
      overall_position:  r.overall_position,
      category_position: r.category_position,
      status:            r.status || "finisher",
      updated_at:        new Date().toISOString(),
    };
  }).filter(r => r.user_email); // must have email

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  // Batch upsert in 100-row chunks
  for (let i = 0; i < upsertRows.length; i += 100) {
    const chunk = upsertRows.slice(i, i + 100);
    const { error } = await db
      .from("event_results")
      .upsert(chunk, { onConflict: "event_id,user_email" });
    if (error) { errors.push(`Chunk ${Math.floor(i/100)}: ${error.message}`); skipped += chunk.length; }
    else imported += chunk.length;
  }

  // Auto-rank: recompute overall and category positions from gun_time_secs
  if (autoRank && imported > 0) {
    const { data: allResults } = await db
      .from("event_results")
      .select("id, distance_category, gun_time_secs, status")
      .eq("event_id", eventId)
      .eq("status", "finisher")
      .not("gun_time_secs", "is", null)
      .order("gun_time_secs", { ascending: true });

    if (allResults?.length) {
      // Overall positions
      const overallUpdates = allResults.map((r, idx) => ({ id: r.id, overall_position: idx + 1 }));

      // Category positions
      const byCategory = new Map<string, typeof allResults>();
      for (const r of allResults) {
        const cat = r.distance_category ?? "OPEN";
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(r);
      }
      const catUpdates: { id: string; category_position: number }[] = [];
      for (const rows of byCategory.values()) {
        rows.forEach((r, i) => catUpdates.push({ id: r.id, category_position: i + 1 }));
      }

      // Apply updates
      for (const u of overallUpdates) {
        const catPos = catUpdates.find(c => c.id === u.id)?.category_position ?? null;
        await db.from("event_results").update({ overall_position: u.overall_position, category_position: catPos, updated_at: new Date().toISOString() }).eq("id", u.id);
      }
    }
  }

  return NextResponse.json({ imported, skipped, errors: errors.slice(0, 5), auto_ranked: autoRank });
}
