import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/reports?type=registrations|revenue|verification|bib|checkin
// Returns CSV data for the requested report type.
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") ?? "registrations";
  const db   = getSupabaseServer();

  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let csv = "";
  let filename = `it-run-${type}-${new Date().toISOString().split("T")[0]}.csv`;

  if (type === "registrations") {
    const { data } = await db
      .from("it_run_registrations")
      .select("registration_code,lead_email,participant_count,final_price,payment_status,created_at,it_run_categories(name)")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false });

    csv  = "Registration Code,Lead Email,Participant Count,Amount Paid,Payment Status,Category,Registered At\n";
    csv += (data ?? []).map(r => [
      r.registration_code,
      r.lead_email,
      r.participant_count,
      r.final_price,
      r.payment_status,
      (r.it_run_categories as unknown as { name: string } | null)?.name ?? "",
      r.created_at,
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  else if (type === "participants") {
    const { data } = await db
      .from("it_run_participants")
      .select(`
        first_name, last_name, gender, dob, email, mobile, blood_group,
        company_name, employee_id, tshirt_size, bib_number, wave,
        verification_status, food_preference,
        it_run_registrations!inner ( registration_code, payment_status,
          it_run_categories ( name ) )
      `)
      .eq("event_id", event.id)
      .order("id");

    csv  = "First Name,Last Name,Gender,DOB,Email,Mobile,Blood Group,Company,Employee ID,T-Shirt,BIB,Wave,Verification,Food,Category,Reg Code,Payment\n";
    csv += (data ?? []).map((p: unknown) => {
      const part = p as {
        first_name: string; last_name: string; gender: string; dob: string | null;
        email: string | null; mobile: string; blood_group: string | null;
        company_name: string | null; employee_id: string | null; tshirt_size: string | null;
        bib_number: string | null; wave: string | null; verification_status: string;
        food_preference: string | null;
        it_run_registrations: { registration_code: string; payment_status: string; it_run_categories: { name: string } | null };
      };
      return [
        part.first_name, part.last_name, part.gender, part.dob, part.email,
        part.mobile, part.blood_group, part.company_name, part.employee_id,
        part.tshirt_size, part.bib_number, part.wave, part.verification_status,
        part.food_preference,
        part.it_run_registrations?.it_run_categories?.name,
        part.it_run_registrations?.registration_code,
        part.it_run_registrations?.payment_status,
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    }).join("\n");
    filename = `it-run-participants-${new Date().toISOString().split("T")[0]}.csv`;
  }

  else if (type === "revenue") {
    const { data } = await db
      .from("it_run_registrations")
      .select("registration_code,lead_email,base_price,discount_amount,final_price,payment_status,razorpay_payment_id,created_at,it_run_categories(name)")
      .eq("event_id", event.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false });

    csv  = "Registration Code,Email,Category,Base Price,Discount,Final Price,Payment ID,Date\n";
    csv += (data ?? []).map(r => [
      r.registration_code,
      r.lead_email,
      (r.it_run_categories as unknown as { name: string } | null)?.name ?? "",
      r.base_price,
      r.discount_amount,
      r.final_price,
      r.razorpay_payment_id ?? "",
      r.created_at,
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    filename = `it-run-revenue-${new Date().toISOString().split("T")[0]}.csv`;
  }

  else if (type === "checkin") {
    const { data } = await db
      .from("it_run_checkins")
      .select("checked_in_at,volunteer_email,it_run_participants(first_name,last_name,bib_number,email,it_run_registrations(it_run_categories(name)))")
      .order("checked_in_at", { ascending: false });

    csv  = "Name,BIB,Email,Category,Checked In At,Volunteer\n";
    csv += (data ?? []).map((c: unknown) => {
      const row = c as {
        checked_in_at: string; volunteer_email: string | null;
        it_run_participants: { first_name: string; last_name: string; bib_number: string | null; email: string | null; it_run_registrations: { it_run_categories: { name: string } | null } | null } | null;
      };
      const p = row.it_run_participants;
      return [
        p ? `${p.first_name} ${p.last_name}` : "",
        p?.bib_number ?? "",
        p?.email ?? "",
        p?.it_run_registrations?.it_run_categories?.name ?? "",
        row.checked_in_at,
        row.volunteer_email ?? "",
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    }).join("\n");
    filename = `it-run-checkins-${new Date().toISOString().split("T")[0]}.csv`;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
