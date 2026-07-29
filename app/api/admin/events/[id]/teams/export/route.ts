import { NextRequest, NextResponse } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/teams/export
// Returns a CSV of all corporate team members with their event status for HR.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const { data: teams, error } = await db
    .from("event_corporate_teams")
    .select(`
      company_name, team_name, hr_contact_name, hr_contact_email,
      event_team_members (
        role,
        event_participants (
          first_name, last_name, email, phone, distance_category,
          registration_code, status, checked_in, bib_collected, tshirt_issued,
          medal_issued, bib_number
        )
      )
    `)
    .eq("event_id", eventId)
    .order("company_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: string[] = [
    [
      "Company", "Team", "Role", "First Name", "Last Name", "Email", "Phone",
      "Distance", "Registration Code", "Status",
      "Checked In", "BIB Number", "BIB Collected", "T-Shirt Issued", "Medal Issued",
      "HR Contact Name", "HR Contact Email",
    ].join(","),
  ];

  type PRow = { first_name: string; last_name: string; email: string; phone?: string | null; distance_category?: string | null; registration_code?: string | null; status?: string | null; checked_in: boolean; bib_collected: boolean; tshirt_issued: boolean; medal_issued: boolean; bib_number?: string | null };

  for (const t of teams ?? []) {
    for (const m of t.event_team_members ?? []) {
      const raw = m.event_participants;
      const p = (Array.isArray(raw) ? raw[0] : raw) as PRow | null;
      if (!p) continue;
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      rows.push([
        cell(t.company_name),
        cell(t.team_name),
        cell(m.role),
        cell(p.first_name),
        cell(p.last_name),
        cell(p.email),
        cell(p.phone ?? ""),
        cell(p.distance_category ?? ""),
        cell(p.registration_code ?? ""),
        cell(p.status ?? ""),
        cell(p.checked_in ? "Yes" : "No"),
        cell(p.bib_number ?? ""),
        cell(p.bib_collected ? "Yes" : "No"),
        cell(p.tshirt_issued ? "Yes" : "No"),
        cell(p.medal_issued  ? "Yes" : "No"),
        cell(t.hr_contact_name  ?? ""),
        cell(t.hr_contact_email ?? ""),
      ].join(","));
    }
  }

  const csv = rows.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="corporate-teams-${eventId}.csv"`,
    },
  });
}
