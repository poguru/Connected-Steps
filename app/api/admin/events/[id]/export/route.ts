import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

function fmtIst(ts: string | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch { return ts; }
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
}

// GET /api/admin/events/[id]/export?format=csv
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  // Fetch event title for filename
  const { data: ev } = await db
    .from("events")
    .select("title, start_date")
    .eq("id", eventId)
    .single();

  // Fetch all participants (up to 5000 — enough for any single event)
  const { data: participants, error } = await db
    .from("event_participants")
    .select(`
      id, registration_id, account_email, first_name, last_name,
      gender, dob, blood_group, mobile, email,
      distance_category, tshirt_size, bib_number, wave,
      checked_in_at, tshirt_issued, tshirt_issued_at,
      breakfast_availed, breakfast_availed_at,
      medal_issued, medal_issued_at,
      bib_collected_at, status, created_at
    `)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .range(0, 4999);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch registration info for all these participants
  const regIds = [...new Set((participants ?? []).map(p => p.registration_id))];
  const { data: regs } = regIds.length > 0
    ? await db.from("event_registrations")
        .select("id, registration_code, payment_status, final_price")
        .in("id", regIds)
    : { data: [] };

  const regMap: Record<string, { registration_code: string; payment_status: string; final_price: number }> = {};
  for (const r of regs ?? []) regMap[r.id] = r;

  // Build CSV
  const HEADERS = [
    "Registration Code", "Payment Status", "Final Price (₹)",
    "Account Email",
    "First Name", "Last Name", "Gender", "Date of Birth", "Blood Group",
    "Mobile", "Participant Email",
    "Distance Category", "T-Shirt Size", "BIB Number", "Wave",
    "Check-In", "Check-In Time",
    "T-Shirt Issued", "T-Shirt Issued Time",
    "Breakfast Availed", "Breakfast Time",
    "Medal Issued", "Medal Time",
    "BIB Collected", "BIB Collected Time",
    "Status", "Registered At",
  ];

  const rows: string[] = [csvRow(HEADERS)];

  for (const p of participants ?? []) {
    const reg = regMap[p.registration_id];
    rows.push(csvRow([
      reg?.registration_code ?? "",
      reg?.payment_status    ?? "",
      reg?.final_price       ?? "",
      p.account_email,
      p.first_name,
      p.last_name ?? "",
      p.gender    ?? "",
      fmtDate(p.dob),
      p.blood_group ?? "",
      p.mobile      ?? "",
      p.email       ?? "",
      p.distance_category ?? "",
      p.tshirt_size       ?? "",
      p.bib_number        ?? "",
      p.wave              ?? "",
      p.checked_in_at ? "Yes" : "No",
      fmtIst(p.checked_in_at),
      p.tshirt_issued    ? "Yes" : "No",
      fmtIst(p.tshirt_issued_at),
      p.breakfast_availed ? "Yes" : "No",
      fmtIst(p.breakfast_availed_at),
      p.medal_issued      ? "Yes" : "No",
      fmtIst(p.medal_issued_at),
      p.bib_collected_at  ? "Yes" : "No",
      fmtIst(p.bib_collected_at),
      p.status,
      fmtIst(p.created_at),
    ]));
  }

  const csv = rows.join("\r\n");

  // Filename: "EventTitle_YYYY-MM-DD_participants.csv"
  const slug = (ev?.title ?? "event").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  const date = ev?.start_date ?? new Date().toISOString().split("T")[0];
  const filename = `${slug}_${date}_participants.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
