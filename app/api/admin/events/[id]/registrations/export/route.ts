import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/registrations/export
// Downloads all confirmed registrations for an event as a CSV.
// Safe: read-only, admin-only.

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const sp       = req.nextUrl.searchParams;
  const statusF  = sp.get("status") ?? "";          // optional filter
  const paymentF = sp.get("payment_status") ?? "";

  const db = getSupabaseServer();

  // Fetch event for filename
  const { data: ev } = await db
    .from("events")
    .select("title, start_date")
    .eq("id", eventId)
    .single();

  // Fetch all registrations (up to 5000 — more than enough for any event)
  let q = db
    .from("event_registrations")
    .select(`
      registration_code, bib_number, user_name, user_email, phone, gender,
      date_of_birth, blood_group, emergency_contact,
      distance_category, coupon_code, coupon_discount,
      original_price, final_price, payment_status, status,
      created_at, checked_in_at, breakfast_availed,
      tshirt_size, tshirt_issued, tshirt_issued_at, tshirt_issued_by,
      confirmation_email_sent_at, email_status
    `)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (statusF)  q = q.eq("status", statusF)          as typeof q;
  if (paymentF) q = q.eq("payment_status", paymentF) as typeof q;

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Build CSV
  const headers = [
    "Registration Code", "BIB", "Name", "Email", "Phone", "Gender",
    "Date of Birth", "Blood Group", "Emergency Contact",
    "Category/Race", "Coupon", "Discount (₹)", "Original Price (₹)", "Final Price (₹)",
    "Payment Status", "Registration Status",
    "Registered At", "Checked In At", "Breakfast Availed",
    "T-Shirt Size", "T-Shirt Issued", "T-Shirt Issued At", "T-Shirt Issued By",
    "Email Status",
  ];

  const escape = (v: unknown): string => {
    const s = String(v ?? "").replace(/"/g, '""');
    return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
  };

  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";

  const lines = [
    headers.join(","),
    ...(rows ?? []).map(r => [
      escape(r.registration_code),
      escape((r as { bib_number?: string | null }).bib_number ?? ""),
      escape(r.user_name),
      escape(r.user_email),
      escape(r.phone),
      escape(r.gender),
      escape(r.date_of_birth),
      escape(r.blood_group),
      escape(r.emergency_contact),
      escape(r.distance_category),
      escape(r.coupon_code),
      escape(r.coupon_discount ?? 0),
      escape(r.original_price ?? 0),
      escape(r.final_price ?? 0),
      escape(r.payment_status),
      escape(r.status),
      escape(fmtDate(r.created_at)),
      escape(fmtDate(r.checked_in_at)),
      escape(r.breakfast_availed ? "Yes" : "No"),
      escape(r.tshirt_size ?? ""),
      escape(r.tshirt_issued ? "Yes" : "No"),
      escape(fmtDate(r.tshirt_issued_at)),
      escape(r.tshirt_issued_by ?? ""),
      escape(r.email_status ?? "not sent"),
    ].join(",")),
  ].join("\n");

  const eventTitle  = ev?.title?.replace(/[^a-z0-9]/gi, "_") ?? "event";
  const date        = ev?.start_date ?? new Date().toISOString().slice(0, 10);
  const filename    = `${eventTitle}_${date}_registrations.csv`;
  const isTruncated = (rows?.length ?? 0) >= 5000;

  return new NextResponse(lines, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
      // Signals to the admin UI (and any scripted consumers) that not all rows
      // were returned. The client should display a warning and offer pagination.
      ...(isTruncated ? { "X-Truncated": "true", "X-Row-Limit": "5000" } : {}),
    },
  });
}
