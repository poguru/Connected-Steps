import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer }         from "@/lib/supabase-server";
import { requireRole }               from "@/lib/it-run-auth";

const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const CHILD_SIZES = ["5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y"];

function sizeGroup(size: string | null): "adult" | "child" | "none" {
  if (!size) return "none";
  if (CHILD_SIZES.includes(size)) return "child";
  if (ADULT_SIZES.includes(size)) return "adult";
  return "none"; // unexpected size
}

function zeroBreakdown(sizes: string[]) {
  return sizes.map(s => ({ size: s, required: 0, issued: 0, not_issued: 0 }));
}

type PRow = {
  id: string; first_name: string; last_name: string;
  mobile: string; email: string | null;
  tshirt_size: string | null; participant_type: string;
  it_run_registrations: {
    id: string; registration_code: string; lead_email: string;
    payment_status: string; registration_status: string; category_id: string;
    it_run_categories: { id: string; name: string; color: string } | null;
  };
  it_run_tshirt_issuances: { id: string; issued_at: string }[];
};

// GET /api/it-run/admin/tshirt
// Params (all optional):
//   category_id  – filter by category UUID
//   group        – "adult" | "child"
//   issued       – "yes" | "no"
//   search       – name / mobile / email / reg code
//   page         – for participant list (default 0)
//   limit        – for participant list (default 50)
//   format=csv   – returns CSV download instead of JSON
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const categoryId = sp.get("category_id") ?? "";
  const group      = sp.get("group")       ?? "";        // adult | child | ""
  const issued     = sp.get("issued")      ?? "";        // yes | no | ""
  const search     = sp.get("search")?.trim() ?? "";
  const page       = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));
  const limit      = Math.min(200, Math.max(10, parseInt(sp.get("limit") ?? "50", 10)));
  const fmt        = sp.get("format") ?? "";

  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Fetch categories for the filter dropdown
  const { data: categories } = await db
    .from("it_run_categories")
    .select("id, name, color")
    .eq("event_id", event.id)
    .order("sort_order");

  // ── Participant fetch ────────────────────────────────────────────────────────
  let query = db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, mobile, email,
      tshirt_size, participant_type,
      it_run_registrations!inner(
        id, registration_code, lead_email,
        payment_status, registration_status, category_id,
        it_run_categories ( id, name, color )
      ),
      it_run_tshirt_issuances ( id, issued_at )
    `)
    .eq("it_run_registrations.event_id", event.id)
    .in("it_run_registrations.payment_status", ["paid", "free"])
    .eq("it_run_registrations.registration_status", "active");

  if (categoryId) query = query.eq("it_run_registrations.category_id", categoryId);

  const { data: allParts, error } = await query as unknown as {
    data: PRow[] | null; error: { message: string } | null;
  };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = allParts ?? [];

  // ── Apply remaining filters in JS ────────────────────────────────────────────
  let filtered = rows;

  // Filter: only participants WITH a tshirt_size for breakdown purposes
  // (used separately below; keep full set for total_participants)
  const withSize = rows.filter(p => p.tshirt_size !== null);

  // Apply group filter
  if (group === "adult") filtered = filtered.filter(p => sizeGroup(p.tshirt_size) === "adult");
  if (group === "child") filtered = filtered.filter(p => sizeGroup(p.tshirt_size) === "child");

  // Apply issued filter
  if (issued === "yes") filtered = filtered.filter(p => p.it_run_tshirt_issuances.length > 0);
  if (issued === "no")  filtered = filtered.filter(p => p.it_run_tshirt_issuances.length === 0 && p.tshirt_size !== null);

  // Apply search
  if (search) {
    const lc = search.toLowerCase();
    filtered = filtered.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(lc) ||
      p.mobile.includes(lc) ||
      (p.email ?? "").toLowerCase().includes(lc) ||
      p.it_run_registrations.registration_code.toLowerCase().includes(lc) ||
      p.it_run_registrations.lead_email.toLowerCase().includes(lc)
    );
  }

  // For summary, use rows that have a tshirt_size AND pass group/search filters
  // but NOT the issued filter (we compute issued/not_issued from unfiltered)
  const forSummary = filtered.filter(p => p.tshirt_size !== null);

  // ── Summary tiles ────────────────────────────────────────────────────────────
  const totalParticipants = rows.length;
  const totalRequired     = withSize.filter(p => {
    // Apply group filter for consistency
    if (group === "adult" && sizeGroup(p.tshirt_size) !== "adult") return false;
    if (group === "child" && sizeGroup(p.tshirt_size) !== "child") return false;
    if (search) {
      const lc = search.toLowerCase();
      if (!(`${p.first_name} ${p.last_name}`.toLowerCase().includes(lc) ||
        p.mobile.includes(lc) || (p.email ?? "").toLowerCase().includes(lc) ||
        p.it_run_registrations.registration_code.toLowerCase().includes(lc)))
        return false;
    }
    return true;
  }).length;
  const totalIssued    = forSummary.filter(p => p.it_run_tshirt_issuances.length > 0).length;
  const totalNotIssued = forSummary.filter(p => p.it_run_tshirt_issuances.length === 0).length;

  // ── Size breakdown ───────────────────────────────────────────────────────────
  const adultMap = Object.fromEntries(ADULT_SIZES.map(s => [s, { required: 0, issued: 0, not_issued: 0 }]));
  const childMap = Object.fromEntries(CHILD_SIZES.map(s => [s, { required: 0, issued: 0, not_issued: 0 }]));

  for (const p of forSummary) {
    const sz  = p.tshirt_size!;
    const grp = sizeGroup(sz);
    const map = grp === "child" ? childMap : adultMap;
    if (!map[sz]) continue;
    map[sz].required++;
    if (p.it_run_tshirt_issuances.length > 0) map[sz].issued++;
    else map[sz].not_issued++;
  }

  const adult_sizes = ADULT_SIZES.map(s => ({ size: s, ...adultMap[s] }));
  const child_sizes = CHILD_SIZES.map(s => ({ size: s, ...childMap[s] }));

  // ── CSV format ───────────────────────────────────────────────────────────────
  if (fmt === "csv") {
    const headers = [
      "Registration Code","Lead Email","Category","Participant Name","Participant Type",
      "T-Shirt Size","Size Group","T-Shirt Issued","Issued At","Mobile","Email",
    ].join(",");

    const csvRows = filtered
      .filter(p => p.tshirt_size !== null)
      .map(p => {
        const ti      = p.it_run_tshirt_issuances[0] ?? null;
        const cat     = p.it_run_registrations.it_run_categories?.name ?? "";
        const grp     = sizeGroup(p.tshirt_size);
        const issuedVal = ti ? "Yes" : "No";
        const issuedAt  = ti ? new Date(ti.issued_at).toLocaleString("en-IN") : "";
        const name = `${p.first_name} ${p.last_name}`.replace(/,/g, " ");
        return [
          p.it_run_registrations.registration_code,
          p.it_run_registrations.lead_email,
          cat,
          name,
          p.participant_type,
          p.tshirt_size,
          grp,
          issuedVal,
          issuedAt,
          p.mobile,
          p.email ?? "",
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      });

    const csv  = [headers, ...csvRows].join("\n");
    const body = Buffer.from(csv, "utf-8");
    return new NextResponse(body, {
      headers: {
        "Content-Type":        "text/csv",
        "Content-Disposition": `attachment; filename="tshirt-report.csv"`,
      },
    });
  }

  // ── Paginated participant list ────────────────────────────────────────────────
  const sortedFiltered = [...filtered].sort((a, b) => {
    const nameA = `${a.first_name} ${a.last_name}`;
    const nameB = `${b.first_name} ${b.last_name}`;
    return nameA.localeCompare(nameB);
  });
  const totalList = sortedFiltered.length;
  const pageRows  = sortedFiltered.slice(page * limit, (page + 1) * limit);

  const participants = pageRows.map(p => ({
    id:              p.id,
    name:            `${p.first_name} ${p.last_name}`,
    participant_type: p.participant_type,
    tshirt_size:     p.tshirt_size,
    size_group:      sizeGroup(p.tshirt_size),
    mobile:          p.mobile,
    email:           p.email,
    registration_code: p.it_run_registrations.registration_code,
    lead_email:      p.it_run_registrations.lead_email,
    category:        p.it_run_registrations.it_run_categories?.name ?? "",
    category_color:  p.it_run_registrations.it_run_categories?.color ?? "#888",
    issued:          p.it_run_tshirt_issuances.length > 0,
    issued_at:       p.it_run_tshirt_issuances[0]?.issued_at ?? null,
  }));

  return NextResponse.json({
    summary: {
      total_participants: totalParticipants,
      total_required:     totalRequired,
      total_issued:       totalIssued,
      total_not_issued:   totalNotIssued,
    },
    adult_sizes,
    child_sizes,
    participants,
    total_list: totalList,
    page,
    limit,
    categories: categories ?? [],
  });
}
